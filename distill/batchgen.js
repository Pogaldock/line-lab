// Makes a batch of feed cards: half plain walk, half planned with the full DINO judge (same walk, settings and planner as the feed).
// Usage: node batchgen.js <part> <parts> <cards per part> <batch id> <out.json>
const fs = require('fs'), W = require('./walkmods.js'), PJ = require('./pickjudge.js'), R = require('./raster.js'), ort = require('onnxruntime-node');
const FORM = require('./formula.js');
const PJS = PJ.make(Object.assign({}, JSON.parse(fs.readFileSync(__dirname + '/pickjudge_w.json')), { scale: 3 })), J2 = (w, wt, all) => W.judge(w, wt, all) + PJS(w, wt, all);
const POOL = JSON.parse(fs.readFileSync(__dirname + '/path_pool.json')), JM = JSON.parse(fs.readFileSync(__dirname + '/onnx/judge.json')), SECS = 12;
/* pool weights (from your taps on plain-walk cards per setting): stronger settings are drawn more often, weak ones rarely, none dropped */
const PW = fs.existsSync(__dirname + '/pool_weights.json') && (process.env.WEIGHTED || process.env.ARMS === 'r3') ? JSON.parse(fs.readFileSync(__dirname + '/pool_weights.json')) : null;
function pickPool(u) { if (!PW) return Math.floor(u * POOL.length); const t = PW.reduce((a, b) => a + b, 0); let x = u * t; for (let i = 0; i < PW.length; i++) { x -= PW[i]; if (x <= 0) return i; } return PW.length - 1; }
/* round 4: settings from the quality-diversity archive (best setting per kind of line, re-scored on fresh seeds) */
const QDA = fs.existsSync(__dirname + '/qd_pick.json') ? JSON.parse(fs.readFileSync(__dirname + '/qd_pick.json')) : [];
const REP = fs.existsSync(__dirname + '/r4_repeats.json') ? JSON.parse(fs.readFileSync(__dirname + '/r4_repeats.json')) : [];
const FTEMP = 0.3 * 1.258;   // formula scores have sd 1.26 over your labelled lines; same relative sharpness as the judge steering
const PLAN = { N: 6, H: 3, temp: +(0.3 * JM.score_sd).toFixed(3) }, ARMS = process.env.ARMS || 'ab';
/* exploration (ARMS=explore): settings outside the winning pool, so the search does not settle in one corner.
   Half the time a far jump (every setting drawn anew within the pool's range, widened by 30%), otherwise a pool setting with about
   half its values moved by a large step (35% of that setting's range across the pool). Drawn by the plain walk, unsteered. */
const KEYS = Object.keys(POOL[0]).filter(k => typeof POOL[0][k] === 'number'), RANGE = {}, UNIT = ['gFlip', 'keepCurl', 'pMid', 'rho', 'speedRho', 'jagTaper', 'beta', 'weight'];
KEYS.forEach(k => { const v = POOL.map(g => g[k]).filter(x => typeof x === 'number'); RANGE[k] = [Math.min(...v), Math.max(...v)]; });
const EGOOD = fs.existsSync(__dirname + '/explore_good.json') ? JSON.parse(fs.readFileSync(__dirname + '/explore_good.json')) : [];
function exploreNear(rnd) {   // local search around an exploration setting you liked in an earlier round (smaller steps)
  const base = EGOOD[Math.floor(rnd() * EGOOD.length)], g = Object.assign({}, base, { src: 'explore', far: false, near_liked: true }), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  KEYS.forEach(k => { const [lo, hi] = RANGE[k], r = hi - lo; if (!(r > 0) || typeof g[k] !== 'number' || rnd() < 0.5) return; let v = g[k] + gauss() * 0.15 * r; v = Math.max(lo - 0.3 * r, Math.min(hi + 0.3 * r, v)); if (UNIT.includes(k)) v = Math.max(0, Math.min(1, v)); g[k] = +v.toFixed(4); });
  return g; }
function explore(rnd) {
  if ((ARMS === 'r2' || ARMS === 'r3') && EGOOD.length && rnd() < 0.5) return exploreNear(rnd);
  const base = POOL[Math.floor(rnd() * POOL.length)], g = Object.assign({}, base, { src: 'explore' }), far = rnd() < 0.5, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  KEYS.forEach(k => { const [lo, hi] = RANGE[k], r = hi - lo; if (!(r > 0)) return; let v = g[k];
    if (far) v = lo - 0.3 * r + rnd() * 1.6 * r; else if (rnd() < 0.5) v = v + gauss() * 0.35 * r;
    v = Math.max(lo - 0.3 * r, Math.min(hi + 0.3 * r, v)); if (UNIT.includes(k)) v = Math.max(0, Math.min(1, v)); if (['gAmp', 'sigma', 'speedSigma', 'jagRate', 'span', 'rate', 'pulseSigma', 'gPeriod', 'jagLeg', 'absMu'].includes(k)) v = Math.max(lo * 0.5, v); g[k] = +v.toFixed(4); });
  g.far = far; return g; }
function optsOf(g, seed) { const o = Object.assign({}, W.C.walk, { seed, modes: true, K: 6, modeBias: {} }); for (const k in g) { if (k === 'src') continue; if (k.startsWith('m_')) o.modeBias[k.slice(2)] = g[k]; else o[k] = g[k]; } o.mu = g.absMu; o.gPeriod = Math.round(g.gPeriod); o.jagLeg = Math.round(g.jagLeg); return o; }
async function main() {
  const [part, parts, n, batch, out] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], process.argv[6]];
  if (!fs.existsSync('judge.onnx')) { let b = ''; for (let k = 0; k < JM.parts; k++) b += fs.readFileSync(`onnx/judge_${k}.txt`, 'utf8'); fs.writeFileSync('judge.onnx', Buffer.from(b, 'base64')); }
  const sess = await ort.InferenceSession.create('judge.onnx', { intraOpNumThreads: 1 });
  const score = async list => { const b = new Float32Array(list.length * 50176); list.forEach((p, k) => b.set(R.raster(R.windowOf(p), 224), k * 50176)); return Array.from((await sess.run({ ink: new ort.Tensor('float32', b, [list.length, 1, 224, 224]) })).score.data); };
  const cards = [];
  for (let i = 0; i < n; i++) {
    const idx = part * n + i, rnd = W.LineGen.mulberry(1000 + idx * 7 + batch.length * 131 + batch.charCodeAt(batch.length - 1)), gi = pickPool(rnd()), seed = 1 + Math.floor(rnd() * 1e9), pick = rnd() < 0.5;
    // round 2 mix (ARMS=r2): 30% steered (winning settings), 20% steered on exploration settings, 20% plain walk, 30% exploration
    const k10 = idx % 10, k20 = idx % 20;
    // round 3 mix (ARMS=r3): 30% steered (winning settings, weighted by your taps), 35% steered on exploration settings, 15% plain walk, 20% exploration
    // round 4 mix (ARMS=r4): 15% plain walk (old settings), 20% plain walk on QD settings, 20% judge-steered on QD settings,
    // 20% judge-steered exploration (round 2-3 best), 25% steered by the 4-measure spacing formula on the same exploration settings
    if (process.env.CAP && idx >= +process.env.CAP) continue;
    const arm = ARMS === 'r4' ? (k20 < 3 ? 'walk' : k20 < 7 ? 'qd' : k20 < 11 ? 'qdS' : k20 < 15 ? 'dinoX' : 'form') : ARMS === 'explore' ? 'explore' : ARMS === 'r3' ? (k20 < 6 ? 'dino' : k20 < 13 ? 'dinoX' : k20 < 16 ? 'walk' : 'explore') : ARMS === 'r2' ? (k10 < 3 ? 'dino' : k10 < 5 ? 'dinoX' : k10 < 7 ? 'walk' : 'explore') : idx % 2 === 0 ? 'dino' : 'walk';
    const qi = Math.floor(rnd() * Math.max(1, QDA.length));
    const G = arm.startsWith('qd') ? QDA[qi].g : (arm === 'explore' || arm === 'dinoX' || arm === 'form') ? explore(rnd) : POOL[gi];
    // steered cards: how strongly the judge picks between candidate stretches varies (x0.5 sharper, x1, x2 more random)
    const tmul = arm.startsWith('dino') && ARMS === 'r2' ? [0.5, 1, 2][Math.floor(rnd() * 3)] : arm.startsWith('dino') && ARMS === 'r3' ? [0.5, 1][Math.floor(rnd() * 2)] : 1;
    // round 3: steered cards consider either 6 or 12 candidate stretches each time (more = stronger steering)
    const NC = arm.startsWith('dino') && ARMS === 'r3' ? [6, 12][Math.floor(rnd() * 2)] : ARMS === 'r4' ? 12 : PLAN.N;
    const o = optsOf(G, seed), S = W.Steer.create(o); S.o.arena = 7; const JJ = pick ? J2 : W.judge, picks = []; let sd = seed * 7919;
    if (!(arm.startsWith('dino') || arm === 'qdS' || arm === 'form')) { while (S.t < SECS) { W.Steer.step(S, JJ); if (S.comps.length > 400) S.comps = S.comps.slice(-200); } }
    else while (S.t < SECS) {
      const cands = [], t1 = Math.min(SECS, S.t + PLAN.H);
      for (let k = 0; k < NC; k++) { const C = { o: S.o, r: W.LineGen.mulberry(++sd), st: JSON.parse(JSON.stringify(S.st)), comps: S.comps.slice(), pts: S.pts, x: S.x, y: S.y, t: S.t, choices: [] }; while (C.t < t1) { W.Steer.step(C, JJ); if (C.comps.length > 400) C.comps = C.comps.slice(-200); } cands.push(C); }
      const sc = arm === 'form' ? cands.map(c => FORM.score(R.windowOf(c.pts))) : await score(cands.map(c => c.pts)), mx = Math.max(...sc), ws = sc.map(v => Math.exp((v - mx) / ((arm === 'form' ? FTEMP : PLAN.temp) * tmul))); let u = S.r() * ws.reduce((a, b) => a + b, 0), c = 0;
      for (; c < ws.length - 1; c++) { u -= ws[c]; if (u <= 0) break; }
      const C = cands[c]; S.st = C.st; S.comps = C.comps; S.pts = C.pts; S.x = C.x; S.y = C.y; S.t = C.t; picks.push(+sc[c].toFixed(3));
    }
    const pts = S.pts.filter(p => p[3] <= SECS * 1000), js = (await score([pts]))[0];
    // stored compactly: every 2nd point as whole numbers [x*1000, y*1000, width*1000, ms]
    const q = []; pts.forEach((p, k) => { if (k % 2 === 0) q.push(Math.round(p[0] * 1000), Math.round(p[1] * 1000), Math.round(p[2] * 1000), Math.round(p[3])); });
    cards.push({ id: batch + '-' + idx, fs: +FORM.score(R.windowOf(pts)).toFixed(3), gi: (arm === 'explore' || arm === 'dinoX' || arm === 'form') ? -1 : gi, qcell: arm.startsWith('qd') ? QDA[qi].cell : undefined, g: G, tmul, nc: NC, seed, pick, arm, js: +js.toFixed(3), picks, q });
    if (i % 5 === 0) console.log(part, i, arm, js.toFixed(2));
  }
  fs.writeFileSync(out, JSON.stringify(cards)); console.log('cards', cards.length);
}
main();
