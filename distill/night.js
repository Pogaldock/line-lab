// Overnight engine: SMC steering of the walk by the judges, plus the jobs that use it.
//
// SMC (sequential Monte Carlo) steering: P copies of the line ("particles") are drawn side by side. Every H seconds each one is
// scored by a judge; a particle's weight is multiplied by exp(lambda x its score gain since the last check). When the weights get
// uneven (effective sample size below P/2) the particles are resampled: weak ones dropped, strong ones copied, and every copy gets
// its own randomness so they part ways again. At the end one particle is drawn in proportion to its weight.
// This samples lines from (walk's own distribution) x exp(lambda x final score): lambda = 0 is the plain walk, larger lambda is
// more pressure towards the judge. Unlike picking the single best candidate, several directions stay alive the whole time.
//
// Usage:
//   node night.js dose <part> <parts> <out.json>          lines at several lambdas, steered by judge A, all judges recorded
//   node night.js worker                                    stdin: {"id", "x" | "g", "seeds", "lambda", "steer"} per line -> stdout results
//   node night.js rescore <cands.json> <part> <parts> <out.json> <lambda>   final check of search winners on fresh seeds
const fs = require('fs'), W = require('./walkmods.js'), R = require('./raster.js'), F = require('./formula.js');
let ort; const ORT = () => ort || (ort = require('onnxruntime-node'));
const POOL = JSON.parse(fs.readFileSync(__dirname + '/path_pool.json')), SECS = 12, H = 1.5, P_DEFAULT = 8;
const KEYS = Object.keys(POOL[0]).filter(k => typeof POOL[0][k] === 'number'), RANGE = {}, UNIT = ['gFlip', 'keepCurl', 'pMid', 'rho', 'speedRho', 'jagTaper', 'beta', 'weight'];
const POS = ['gAmp', 'sigma', 'speedSigma', 'jagRate', 'span', 'rate', 'pulseSigma', 'gPeriod', 'jagLeg', 'absMu'];
KEYS.forEach(k => { const v = POOL.map(g => g[k]).filter(x => typeof x === 'number'); RANGE[k] = [Math.min(...v), Math.max(...v)]; });
function clean(g) { const o = {}; KEYS.forEach(k => { const [lo, hi] = RANGE[k], r = hi - lo; let v = typeof g[k] === 'number' ? g[k] : (lo + hi) / 2; if (r > 0) v = Math.max(lo - 0.3 * r, Math.min(hi + 0.3 * r, v)); if (UNIT.includes(k)) v = Math.max(0, Math.min(1, v)); if (POS.includes(k)) v = Math.max(lo * 0.5, v); o[k] = +v.toFixed(4); }); return o; }
// settings <-> unit cube for the search (each setting's range across the pool, widened by 30% each side)
function decode(x) { const g = {}; KEYS.forEach((k, i) => { const [lo, hi] = RANGE[k], r = (hi - lo) || Math.abs(lo) || 1; g[k] = lo - 0.3 * r + Math.max(0, Math.min(1, x[i])) * 1.6 * r; }); return clean(g); }
function encode(g) { return KEYS.map(k => { const [lo, hi] = RANGE[k], r = (hi - lo) || Math.abs(lo) || 1; return Math.max(0, Math.min(1, (g[k] - (lo - 0.3 * r)) / (1.6 * r))); }); }
function optsOf(g, seed) { const o = Object.assign({}, W.C.walk, { seed, modes: true, K: 6, modeBias: {} }); for (const k in g) { if (k === 'src' || typeof g[k] !== 'number') continue; if (k.startsWith('m_')) o.modeBias[k.slice(2)] = g[k]; else o[k] = g[k]; } o.mu = g.absMu; o.gPeriod = Math.round(g.gPeriod); o.jagLeg = Math.round(g.jagLeg); return o; }

let sess, JM;
async function load(dir) {
  if (process.env.STUB_ONNX) {   // local testing only: one-output judge copied into five outputs
    JM = { stub: true }; sess = await ORT().InferenceSession.create(process.env.STUB_ONNX, { intraOpNumThreads: 1 });
    const orig = sess.run.bind(sess); sess.run = async (f) => { const d = (await orig(f)).score.data, o = new Float32Array(d.length * 5); d.forEach((v, k) => { o.set([v, v, v * 0.8, v * 0.1, -v * 0.1], k * 5); }); return { out: { data: o } }; };
    return JM;
  }
  dir = dir || __dirname + '/onnx_night'; JM = JSON.parse(fs.readFileSync(dir + '/judges.json'));
  const f = __dirname + '/judges.onnx';
  if (!fs.existsSync(f)) { let b = ''; for (let k = 0; k < JM.parts; k++) b += fs.readFileSync(`${dir}/judges_${k}.txt`, 'utf8'); fs.writeFileSync(f, Buffer.from(b, 'base64')); }
  sess = await ORT().InferenceSession.create(f, { intraOpNumThreads: 1 }); return JM;
}
// five numbers per window: full judge, half-A judge, half-B judge, image-feature axes d1, d2
async function judge(wins) {
  const out = [];
  for (let i = 0; i < wins.length; i += 16) {
    const part = wins.slice(i, i + 16), b = new Float32Array(part.length * 50176); part.forEach((p, k) => b.set(R.raster(p, 224), k * 50176));
    const o = (await sess.run({ ink: new (ORT()).Tensor('float32', b, [part.length, 1, 224, 224]) })).out.data;
    for (let k = 0; k < part.length; k++) out.push(Array.from(o.slice(k * 5, k * 5 + 5)));
  }
  return out;
}
const steerScore = (o, steer) => steer === 'min' ? Math.min(o[1], o[2]) : steer === 'full' ? o[0] : o[1];   // default: half-A judge

async function smc(g, seed, lambda, steer, P) {
  P = P || P_DEFAULT; const rng = W.LineGen.mulberry(seed * 7 + 3), base = optsOf(g, seed); let sd = seed * 104729;
  const mk = () => { const S = W.Steer.create(Object.assign({}, base)); S.o.arena = 7; return S; };
  const S0 = mk(), parts = [];
  for (let p = 0; p < P; p++) parts.push({ o: S0.o, r: W.LineGen.mulberry(++sd), st: JSON.parse(JSON.stringify(S0.st)), comps: S0.comps.slice(), pts: S0.pts, x: S0.x, y: S0.y, t: S0.t, choices: [], lw: 0, prev: 0 });
  let resamples = 0, essMin = P;
  for (let t1 = H; t1 <= SECS + 1e-9; t1 += H) {
    for (const C of parts) { while (C.t < t1) { W.Steer.step(C, W.judge); if (C.comps.length > 400) C.comps = C.comps.slice(-200); if (C.choices.length > 50) C.choices = C.choices.slice(-10); } }
    if (lambda > 0) {
      const o = await judge(parts.map(C => R.windowOf(C.pts)));
      parts.forEach((C, i) => { const s = steerScore(o[i], steer); C.lw += lambda * (s - C.prev); C.prev = s; });
      const mx = Math.max(...parts.map(C => C.lw)), w = parts.map(C => Math.exp(C.lw - mx)), sw = w.reduce((a, b) => a + b, 0), ess = sw * sw / w.reduce((a, b) => a + b * b, 0);
      essMin = Math.min(essMin, ess);
      if (ess < P / 2 && t1 < SECS - 1e-9) {   // systematic resampling; copies get fresh randomness
        const u0 = rng() / P, pick = []; let c = w[0] / sw, i = 0;
        for (let k = 0; k < P; k++) { const u = u0 + k / P; while (u > c && i < P - 1) { i++; c += w[i] / sw; } pick.push(i); }
        const old = parts.slice();
        pick.forEach((i2, k) => { const A = old[i2]; parts[k] = { o: A.o, r: W.LineGen.mulberry(++sd), st: JSON.parse(JSON.stringify(A.st)), comps: A.comps.slice(), pts: A.pts, x: A.x, y: A.y, t: A.t, choices: [], lw: 0, prev: A.prev }; });
        resamples++;
      }
    }
  }
  const mx = Math.max(...parts.map(C => C.lw)), w = parts.map(C => Math.exp(C.lw - mx)), sw = w.reduce((a, b) => a + b, 0);
  let u = rng() * sw, i = 0; for (; i < P - 1; i++) { u -= w[i]; if (u <= 0) break; }
  const win = R.windowOf(parts[i].pts.filter(p => p[3] <= SECS * 1000)), o = (await judge([win]))[0];
  return { win, out: o.map(v => +v.toFixed(4)), form: +F.score(win).toFixed(3), resamples, essMin: +essMin.toFixed(2) };
}
const pack = win => { const q = []; win.forEach(p => q.push(Math.round(p[0] * 1000), Math.round(p[1] * 1000), Math.round(p[2] * 1000), Math.round(p[3]))); return q; };

async function dose(part, parts, out) {
  await load(); const picks = JSON.parse(fs.readFileSync(__dirname + '/qd_pick.json')).map(e => e.g), S = POOL.map(clean).concat(picks.map(clean));
  const LAMBDAS = [0, 0.25, 0.5, 1, 2, 4, 8], jobs = [];
  S.forEach((g, gi) => [0, 1, 2, 3].forEach(si => LAMBDAS.forEach(l => jobs.push({ gi, seed: 5000 + gi * 10 + si, lambda: l }))));
  const mine = jobs.filter((j, k) => k % parts === part), res = []; const t0 = Date.now();
  for (const j of mine) { const r = await smc(S[j.gi], j.seed, j.lambda, 'A'); res.push(Object.assign(j, { out: r.out, form: r.form, resamples: r.resamples, essMin: r.essMin, q: res.length < 4 || j.seed % 10 === 0 ? pack(r.win) : undefined })); if (res.length % 10 === 0) console.log(part, res.length, '/', mine.length, ((Date.now() - t0) / 1000 / res.length).toFixed(1), 's each'); }
  fs.writeFileSync(out, JSON.stringify(res)); console.log('done', res.length);
}
async function worker() {   // one evaluation per input line: mean over seeds of the steering score, mean image-feature axes
  await load(); const rl = require('readline').createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue; const m = JSON.parse(line), g = m.g ? clean(m.g) : decode(m.x), rs = [];
    for (const s of m.seeds) rs.push(await smc(g, s, m.lambda, m.steer || 'min'));
    const mean = k => rs.reduce((a, r) => a + r.out[k], 0) / rs.length;
    process.stdout.write(JSON.stringify({ id: m.id, obj: rs.reduce((a, r) => a + Math.min(r.out[1], r.out[2]), 0) / rs.length, desc: [mean(3), mean(4)], full: mean(0), A: mean(1), B: mean(2) }) + '\n');
  }
}
async function rescore(file, part, parts, out, lambda) {
  await load(); const C = JSON.parse(fs.readFileSync(file)).filter((c, k) => k % parts === part), res = [];
  for (const c of C) { const g = c.g ? clean(c.g) : decode(c.x), rs = []; for (let s = 0; s < 8; s++) rs.push(await smc(g, 900000 + s * 13 + (c.k || 0) * 101, lambda, 'min'));
    res.push({ id: c.id, g, x: encode(g), island: c.island, search_obj: c.obj, outs: rs.map(r => r.out), forms: rs.map(r => r.form), q: rs.slice(0, 2).map(r => pack(r.win)) }); }
  fs.writeFileSync(out, JSON.stringify(res)); console.log('rescored', res.length);
}
module.exports = { smc, load, judge, clean, decode, encode, KEYS };
if (require.main === module) {
  const [mode, ...a] = process.argv.slice(2);
  if (mode === 'dose') dose(+a[0], +a[1], a[2]);
  else if (mode === 'worker') worker();
  else if (mode === 'rescore') rescore(a[0], +a[1], +a[2], a[3], +a[4]);
  else if (mode === 'encode') console.log(JSON.stringify(JSON.parse(fs.readFileSync(a[0])).map(g => encode(clean(g)))));
}
