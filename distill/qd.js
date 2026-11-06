// Quality-diversity search (MAP-Elites) over the walk's settings, scored by the full DINO judge.
// Keeps the best setting for each kind of line, kinds being a 5x5x5 grid over three descriptors that track your taste:
//   coverage  = share of a 6x6 grid over the drawn box that has ink (goods fill less)
//   area      = signed area swept / length^2 (goods orbit less)
//   turning   = total turning in turns (goods turn more)
// Fitness = mean judge score of the plain walk with that setting over several seeds (no steering).
// Usage:
//   node qd.js run <seed> <minutes> <out.json> [start archive.json]
//   node qd.js merge <out.json> <in1.json> <in2.json> ...
//   node qd.js reeval <archive.json> <seeds> <part> <parts> <out.json>
const fs = require('fs'), W = require('./walkmods.js'), PJ = require('./pickjudge.js'), R = require('./raster.js');
let ort; const ORT = () => ort || (ort = require('onnxruntime-node'));
const PJS = PJ.make(Object.assign({}, JSON.parse(fs.readFileSync(__dirname + '/pickjudge_w.json')), { scale: 3 })), J2 = (w, wt, all) => W.judge(w, wt, all) + PJS(w, wt, all);
const POOL = JSON.parse(fs.readFileSync(__dirname + '/path_pool.json')), JM = JSON.parse(fs.readFileSync(__dirname + '/onnx/judge.json')), SECS = 12;
const STEER = +(process.env.STEER || 0);
const EGOOD = fs.existsSync(__dirname + '/explore_good.json') ? JSON.parse(fs.readFileSync(__dirname + '/explore_good.json')) : [];
const KEYS = Object.keys(POOL[0]).filter(k => typeof POOL[0][k] === 'number'), RANGE = {}, UNIT = ['gFlip', 'keepCurl', 'pMid', 'rho', 'speedRho', 'jagTaper', 'beta', 'weight'];
const POS = ['gAmp', 'sigma', 'speedSigma', 'jagRate', 'span', 'rate', 'pulseSigma', 'gPeriod', 'jagLeg', 'absMu'];
KEYS.forEach(k => { const v = POOL.map(g => g[k]).filter(x => typeof x === 'number'); RANGE[k] = [Math.min(...v), Math.max(...v)]; });
// bin edges = quintiles of each descriptor over your 1,611 labelled cards
const EDGES = { cov: [0.417, 0.472, 0.5, 0.556], area: [0.005, 0.01, 0.016, 0.024], turn: [4.073, 4.695, 5.247, 5.933] };
const bin = (v, e) => { let i = 0; while (i < e.length && v > e[i]) i++; return i; };
function optsOf(g, seed) { const o = Object.assign({}, W.C.walk, { seed, modes: true, K: 6, modeBias: {} }); for (const k in g) { if (k === 'src' || typeof g[k] !== 'number') continue; if (k.startsWith('m_')) o.modeBias[k.slice(2)] = g[k]; else o[k] = g[k]; } o.mu = g.absMu; o.gPeriod = Math.round(g.gPeriod); o.jagLeg = Math.round(g.jagLeg); return o; }
function clean(g) { const o = {}; KEYS.forEach(k => { const [lo, hi] = RANGE[k], r = hi - lo; let v = typeof g[k] === 'number' ? g[k] : (lo + hi) / 2; if (r > 0) v = Math.max(lo - 0.3 * r, Math.min(hi + 0.3 * r, v)); if (UNIT.includes(k)) v = Math.max(0, Math.min(1, v)); if (POS.includes(k)) v = Math.max(lo * 0.5, v); o[k] = +v.toFixed(4); }); return o; }

/* --- descriptors, same definitions as code/curvebank.py (window fitted in a unit box, resampled by length, fade weights) --- */
function gauss1d(a, s) { const r = Math.ceil(4 * s), k = []; let t = 0; for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * s * s)); k.push(v); t += v; } const n = a.length, o = new Float64Array(n); for (let i = 0; i < n; i++) { let s2 = 0; for (let j = -r; j <= r; j++) s2 += k[j + r] * a[Math.min(n - 1, Math.max(0, i + j))]; o[i] = s2 / t; } return o; }
function describe(win) {
  let P = win.filter((p, i) => i === 0 || Math.hypot(p[0] - win[i - 1][0], p[1] - win[i - 1][1]) > 1e-9); if (P.length < 10) return null;
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9; P.forEach(p => { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); });
  const ext = Math.max(b - a, d - c, 1e-9), mx = (a + b) / 2, my = (c + d) / 2, t0 = P[0][3], t1 = P[P.length - 1][3];
  const X = P.map(p => (p[0] - mx) / ext), Y = P.map(p => (p[1] - my) / ext), T = P.map(p => (p[3] - t0) / Math.max(t1 - t0, 1e-9)), S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]));
  const L = S[S.length - 1], N = 400, x = new Float64Array(N), y = new Float64Array(N), t = new Float64Array(N); let j = 0;
  for (let i = 0; i < N; i++) { const u = L * i / (N - 1); while (j < S.length - 2 && S[j + 1] < u) j++; const f = (u - S[j]) / Math.max(S[j + 1] - S[j], 1e-12), g = Math.max(0, Math.min(1, f)); x[i] = X[j] + g * (X[j + 1] - X[j]); y[i] = Y[j] + g * (Y[j + 1] - Y[j]); t[i] = T[j] + g * (T[j + 1] - T[j]); }
  let wt = 0; const w = Array.from(t, v => 0.3 + 0.7 * v); w.forEach(v => wt += v);
  const G = new Float64Array(36); for (let i = 0; i < N; i++) { const cx = Math.min(5, Math.max(0, Math.floor((x[i] + 0.5) * 6))), cy = Math.min(5, Math.max(0, Math.floor((y[i] + 0.5) * 6))); G[cx * 6 + cy] += w[i] / wt; }
  const cov = G.filter(v => v > 0.005).length / 36;
  let A = 0; for (let i = 0; i < N - 1; i++) A += 0.5 * ((x[i] - x[0]) * (y[i + 1] - y[i]) - (y[i] - y[0]) * (x[i + 1] - x[i]));
  const xs = gauss1d(x, 2), ys = gauss1d(y, 2); let turn = 0, prev = null;
  for (let i = 0; i < N - 1; i++) { const th = Math.atan2(ys[i + 1] - ys[i], xs[i + 1] - xs[i]); if (prev !== null) { let dd = th - prev; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI; turn += Math.abs(dd); } prev = th; }
  return { cov, area: Math.abs(A) / (L * L), turn: turn / (2 * Math.PI) };
}

let sess;
async function judgeMany(list) { const b = new Float32Array(list.length * 50176); list.forEach((p, k) => b.set(R.raster(p, 224), k * 50176)); return Array.from((await sess.run({ ink: new (ORT()).Tensor('float32', b, [list.length, 1, 224, 224]) })).score.data); }
async function evaluate(g, seeds) {   // plain walk (as the walk arm: half the time the pick judge inside the walk), window scored by the judge
  const wins = [], D = [];
  for (const seed of seeds) {
    const r = W.LineGen.mulberry(seed * 13 + 7), pick = r() < 0.5, S = W.Steer.create(optsOf(g, seed)); S.o.arena = 7; const JJ = pick ? J2 : W.judge;
    if (!STEER) { while (S.t < SECS) { W.Steer.step(S, JJ); if (S.comps.length > 400) S.comps = S.comps.slice(-200); } }
    else {   // steered, as the round 4 winner: every 3 s, STEER candidate futures, soft choice by the judge
      let sd = seed * 7919;
      while (S.t < SECS) {
        const cands = [], t1 = Math.min(SECS, S.t + 3);
        for (let k = 0; k < STEER; k++) { const C = { o: S.o, r: W.LineGen.mulberry(++sd), st: JSON.parse(JSON.stringify(S.st)), comps: S.comps.slice(), pts: S.pts, x: S.x, y: S.y, t: S.t, choices: [] }; while (C.t < t1) { W.Steer.step(C, JJ); if (C.comps.length > 400) C.comps = C.comps.slice(-200); } cands.push(C); }
        const sc = await judgeMany(cands.map(c => R.windowOf(c.pts))), mx = Math.max(...sc), ws = sc.map(v => Math.exp((v - mx) / (0.3 * JM.score_sd))); let u = r() * ws.reduce((a, b) => a + b, 0), c = 0;
        for (; c < ws.length - 1; c++) { u -= ws[c]; if (u <= 0) break; }
        const C = cands[c]; S.st = C.st; S.comps = C.comps; S.pts = C.pts; S.x = C.x; S.y = C.y; S.t = C.t;
      }
    }
    const win = R.windowOf(S.pts.filter(p => p[3] <= SECS * 1000)); wins.push(win); D.push(describe(win));
  }
  const sc = await judgeMany(wins), ok = D.filter(Boolean); if (!ok.length) return null;
  const m = k => ok.reduce((s, d) => s + d[k], 0) / ok.length, beh = { cov: m('cov'), area: m('area'), turn: m('turn') };
  return { score: sc.reduce((s, v) => s + v, 0) / sc.length, scores: sc.map(v => +v.toFixed(3)), beh, cell: [bin(beh.cov, EDGES.cov), bin(beh.area, EDGES.area), bin(beh.turn, EDGES.turn)].join('') };
}
async function load() { if (!fs.existsSync('judge.onnx')) { let b = ''; for (let k = 0; k < JM.parts; k++) b += fs.readFileSync(`onnx/judge_${k}.txt`, 'utf8'); fs.writeFileSync('judge.onnx', Buffer.from(b, 'base64')); } sess = await ORT().InferenceSession.create('judge.onnx', { intraOpNumThreads: 1 }); }

async function run(seed, minutes, out, start) {
  await load(); const rnd = W.LineGen.mulberry(seed * 977 + 1), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const arc = start ? JSON.parse(fs.readFileSync(start)) : {}, NS = STEER ? 2 : 3; let sd = seed * 100000, n = 0, added = 0; const t0 = Date.now();
  const place = (g, e, from) => { if (!e) return; const cur = arc[e.cell]; if (!cur || e.score > cur.score) { arc[e.cell] = { g, score: +e.score.toFixed(4), scores: e.scores, beh: e.beh, from }; added++; } };
  const INIT = STEER && fs.existsSync(__dirname + '/qd_archive.json') ? Object.values(JSON.parse(fs.readFileSync(__dirname + '/qd_archive.json'))).map(e => e.g).concat(POOL) : POOL.concat(EGOOD);
  if (!start) for (const g0 of INIT.sort(() => rnd() - 0.5)) { const g = clean(g0); place(g, await evaluate(g, Array.from({ length: NS }, () => ++sd)), g0.src || 'explore'); n++; if (Date.now() - t0 > minutes * 30e3) break; }
  while (Date.now() - t0 < minutes * 60e3) {
    const cells = Object.keys(arc), A = arc[cells[Math.floor(rnd() * cells.length)]].g, g = Object.assign({}, A), u = rnd();
    if (u < 0.25 && cells.length > 1) { const B = arc[cells[Math.floor(rnd() * cells.length)]].g; KEYS.forEach(k => { const m = rnd(); g[k] = A[k] + m * (B[k] - A[k]); }); }   // blend of two elites
    const step = u < 0.25 ? 0.03 : u < 0.8 ? 0.1 : 0.3;                                                                                        // small, medium or large mutation
    KEYS.forEach(k => { const [lo, hi] = RANGE[k]; if (hi > lo && rnd() < 0.4) g[k] += gauss() * step * (hi - lo); });
    const gc = clean(g); place(gc, await evaluate(gc, Array.from({ length: NS }, () => ++sd)), 'mut'); n++;
    if (n % 50 === 0) { const v = Object.values(arc).map(e => e.score); console.log(seed, 'evals', n, 'cells', v.length, 'best', Math.max(...v).toFixed(2), 'mean', (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)); }
  }
  fs.writeFileSync(out, JSON.stringify(arc)); console.log('done', seed, 'evals', n, 'cells', Object.keys(arc).length, 'improvements', added);
}
function merge(out, files) { const arc = {}; for (const f of files) { if (!fs.existsSync(f)) { console.log('missing', f); continue; } const a = JSON.parse(fs.readFileSync(f)); for (const c in a) if (!arc[c] || a[c].score > arc[c].score) arc[c] = a[c]; } fs.writeFileSync(out, JSON.stringify(arc)); const v = Object.values(arc).map(e => e.score); console.log('merged cells', v.length, 'mean', (v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)); }
async function reeval(file, ns, part, parts, out) {   // fresh seeds for every elite: the score from the search is inflated by luck (it was the max of many tries)
  await load(); const arc = JSON.parse(fs.readFileSync(file)), cells = Object.keys(arc).sort().filter((c, i) => i % parts === part), res = {};
  for (const c of cells) { const e = await evaluate(arc[c].g, Array.from({ length: ns }, (_, k) => 9e8 + k * 31 + c.charCodeAt(0) * 7 + +c)); res[c] = Object.assign({}, arc[c], { fresh: e && +e.score.toFixed(4), fresh_scores: e && e.scores, fresh_beh: e && e.beh, fresh_cell: e && e.cell }); }
  fs.writeFileSync(out, JSON.stringify(res)); console.log('reeval', cells.length);
}
module.exports = { describe, evaluate, load, clean, EDGES };
if (require.main === module) {
  const [mode, ...a] = process.argv.slice(2);
  if (mode === 'run') run(+a[0], +a[1], a[2], a[3]);
  else if (mode === 'merge') merge(a[0], a.slice(1));
  else if (mode === 'reeval') reeval(a[0], +a[1], +a[2], +a[3], a[4]);
}
