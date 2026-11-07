// A word as one continuous line: found letters (moments of plain natural walk, unchanged) joined by the walk itself.
// Between two letters the walk travels from the end of one to the start of the next with its own pulses (W.Steer.pulse); a beam
// search only chooses which pulses, keeping the ones that arrive at the right spot heading the right way. Nothing is bent.
// Usage: node join_word.js <out.json> <seed> <word> <found.json> [picks e.g. 0,1,0,...]
const D = __dirname + '/../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js');
const [out, seed, word, foundF, picksS] = process.argv.slice(2, 7);
const FA = JSON.parse(fs.readFileSync(foundF)), picks = (picksS || '').split(',').map(Number);
const top = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB);
const E = L.create(W, R, top[0].g, +seed, { lambda: 2 }), P0 = E.parts[0], o = P0.o; o.arena = 1e4;
const rng = W.LineGen.mulberry(+seed * 131 + 9);
const B = +(process.env.B || 120), C = +(process.env.C || 8), MAXP = +(process.env.MAXP || 45), SPACE = 0.35;

// the letters: found glyphs in font units, placed along the line by the font's advance widths, scaled to walk units by K
const glyphs = [], abc = __dirname + '/abc/'; let x = 0;
[...word].forEach((ch, i) => {
  if (ch === ' ') { x += SPACE; return; }
  const adv = JSON.parse(fs.readFileSync(abc + ch + '_0.json')).adv, g = FA[ch][picks[glyphs.length] || 0];
  glyphs.push({ ch, g, x0: x }); x += adv;
});
const K = +(process.env.K || [...glyphs.map(G => G.g.k)].sort((a, b) => a - b)[Math.floor(glyphs.length / 2)]);   // the letters' natural size (median)
const place = (G) => G.g.pts.map(p => [(p[0] + G.x0) * K, p[1] * K, p[2] == null ? 0.6 : p[2], p[3] == null ? 0 : p[3]]);
const heading = (P, fromEnd) => { const n = P.length, a = fromEnd ? P[Math.max(0, n - 8)] : P[0], b = fromEnd ? P[n - 1] : P[Math.min(n - 1, 7)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const erf = (x2) => { const s = x2 < 0 ? -1 : 1; x2 = Math.abs(x2); const t = 1 / (1 + 0.3275911 * x2); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x2 * x2)); };
function restOf(comps, t) { let dx = 0, dy = 0; comps.forEach(c => { const tau = t - c.t0, done = tau <= 0 ? 0 : 0.5 * (1 + erf((Math.log(tau) - c.mu) / (c.sg * Math.SQRT2))), a = (c.ts + c.te) / 2; dx += c.D * (1 - done) * Math.cos(a); dy += c.D * (1 - done) * Math.sin(a); }); return [dx, dy]; }

// travel with the walk's own pulses from point A (heading hA) to point S (heading hS)
function travel(A, hA, S, hS, minP) {
  const st0 = JSON.parse(JSON.stringify(P0.st)); st0.h = hA; st0.tau = 0; st0.dtau = 0; st0.legLeft = 0; st0.t0 = 0; st0.gap = 0; st0.dScale = +(process.env.JS || 0.35);   // joins: the walk at a smaller scale (same shape), like a careful connecting stroke
  let beams = [{ st: st0, comps: [], x: A[0], y: A[1], t: 0, pts: [], n: 0 }], done = [];
  for (let n = 0; n < MAXP && beams.length; n++) {
    const kids = [];
    for (const b of beams) for (let c = 0; c < C; c++) {
      const st = JSON.parse(JSON.stringify(b.st)), comps = b.comps.slice();
      if (o.modes && rng() < 0.06) { const ot = W.Steer.MODE_NAMES.filter(m => m !== st.mode); st.prev = st.mode; st.mode = ot[Math.floor(rng() * ot.length)]; st.blend = 0; st.modeT = 0; }
      W.Steer.pulse(o, st, rng, comps);
      const t1 = st.t0, fresh = W.Steer.integrate(comps, b.x, b.y, b.t, t1, o); if (!fresh.length) continue;   // draw until the next pulse would start
      const lf = fresh[fresh.length - 1], rest = restOf(comps, t1), ex = lf[0] + rest[0], ey = lf[1] + rest[1];   // where the pen will stop
      const dist = Math.hypot(S[0] - ex, S[1] - ey) / K, dh = Math.abs(wrap(st.h - hS));
      const k = { st, comps: comps.filter(c2 => c2.t0 + Math.exp(c2.mu + 2.5 * c2.sg) > t1), x: lf[0], y: lf[1], t: t1, pts: b.pts.concat(fresh), n: b.n + 1, dist, dh };
      k.sc = -6 * dist - 0.3 * dh * Math.min(1, 0.12 / Math.max(0.04, dist)) - 0.004 * k.n;
      if (k.n >= minP && dist < 0.06 && dh < 1.2) done.push(k); else kids.push(k);
    }
    kids.sort((a, b2) => b2.sc - a.sc); beams = kids.slice(0, B);
    if (done.length >= 6) break;
  }
  const pool = done.length ? done : beams; pool.sort((a, b2) => b2.sc - a.sc); const best = pool[0];
  const tail = W.Steer.integrate(best.comps, best.x, best.y, best.t, best.t + 0.6, o);   // let the scheduled pulses run out
  return { pts: best.pts.concat(tail), arrived: !!done.length, dist: best.dist };
}

(async () => {
  const line = []; let T = 0;
  const add = (P, shift) => { const t0 = P[0][3]; P.forEach(p => line.push([p[0] + shift[0], p[1] + shift[1], p[2], T + (p[3] - t0)])); T = line[line.length - 1][3] + 8; };
  // lead-in: the walk comes into the first letter from the left
  const G0 = place(glyphs[0]), S0 = G0[0], h0 = heading(G0, false);
  const lead = travel([S0[0] - 1.2 * K * 0.3, S0[1] + 0.15 * K], h0 - 0.6, S0, h0, 4); add(lead.pts.map(p => [p[0], p[1], p[2], p[3]]), [0, 0]);
  let shift = [0, 0], report = [];
  glyphs.forEach((G, i) => {
    const P = place(G), end = line[line.length - 1];
    shift = [end[0] - P[0][0], end[1] - P[0][1]];   // the letter goes exactly where the pen arrived (it moves, it never bends)
    add(P, shift);
    if (i < glyphs.length - 1) {
      const Q = place(glyphs[i + 1]), A = line[line.length - 1], Sx = [Q[0][0] + shift[0] * 0.5, Q[0][1] + shift[1] * 0.5];   // half the drift is kept, so the line drifts back to the baseline
      const j = travel([A[0], A[1]], heading(P, true), Sx, heading(Q, false), 2); add(j.pts.map(p => [p[0], p[1], p[2], p[3]]), [0, 0]);
      report.push(G.ch + '>' + glyphs[i + 1].ch + (j.arrived ? '' : ' (close: ' + j.dist.toFixed(2) + ')'));
    }
  });
  // tail: the walk carries on a moment after the last letter
  { const A = line[line.length - 1], st = JSON.parse(JSON.stringify(P0.st)); st.h = heading(place(glyphs[glyphs.length - 1]), true); st.dScale = 0.35; st.t0 = 0; const comps = []; for (let k = 0; k < 4; k++) W.Steer.pulse(o, st, rng, comps);
    const tl = W.Steer.integrate(comps, A[0], A[1], 0, st.t0 + 0.4, o); add(tl.map(p => [p[0], p[1], p[2], p[3]]), [0, 0]); }
  const guide = []; glyphs.forEach(G => place(G).forEach((p, i) => guide.push([p[0], p[1], i === 0 ? 1 : 0])));
  fs.writeFileSync(out, JSON.stringify({ word, K, guide, line: line.filter((p, k) => k % 2 === 0).map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]) }));
  console.log(word, 'K', K.toFixed(1), 'joins:', report.join('  '), ' secs', (T / 1000).toFixed(1));
})();
