// Letters that emerge from the walk (Nov 7: "the letter primitives could emerge from the natural flow of the walk rather than
// constrain the walk to the letters"). Nothing bends the walk. From the current point we run many natural futures of the plain
// walk (the Endless Line's own dynamics), look in each for the stretch that best reads as the next letter (its shape at any size,
// slight tilt allowed, about the size of the letters so far, about where the next letter should sit), and keep the best future
// up to the end of that letter. The walk before the letter (up to LEAD seconds) is free flow between letters.
// Usage: node emerge_write.js <out.json> <seed> <word(s)> <abcDir> [M=60]
const D = __dirname + '/../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js'), ST = require(D + 'live/student.js');
const [out, seed, text, abcDir] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5]], M = +(process.argv[6] || 60);
const WS = +(process.env.WS || 0.9), WP = +(process.env.WP || 0.3), LEAD = +(process.env.LEAD || 1.5), HZ = 120, N = 32, SPACE = 1.4;
const SJ = JSON.parse(fs.readFileSync(D + 'live/results/student_weights_b1.json')), TJ = ST.make(SJ);
const top = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB);

function resample(P, n) {
  const Lc = [0]; for (let i = 1; i < P.length; i++) Lc.push(Lc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const T = Lc[Lc.length - 1], o = []; let j = 0;
  for (let k = 0; k < n; k++) { const s = T * k / (n - 1); while (j < P.length - 2 && Lc[j + 1] < s) j++; const u = (s - Lc[j]) / Math.max(1e-9, Lc[j + 1] - Lc[j]); o.push([P[j][0] + (P[j + 1][0] - P[j][0]) * u, P[j][1] + (P[j + 1][1] - P[j][1]) * u]); }
  return { pts: o, len: T };
}
function norm(Q) { let cx = 0, cy = 0; Q.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= Q.length; cy /= Q.length; const C = Q.map(p => [p[0] - cx, p[1] - cy]); const r = Math.sqrt(C.reduce((a, p) => a + p[0] * p[0] + p[1] * p[1], 0) / C.length) || 1; return { C: C.map(p => [p[0] / r, p[1] / r]), c: [cx, cy], r }; }
const ROT = []; for (let a = -0.35; a <= 0.351; a += 0.0875) ROT.push([Math.cos(a), Math.sin(a), a]);
function shapeDist(A, B) { let best = 1e9, ba = 0; for (const [c, s, a] of ROT) { let d = 0; for (let i = 0; i < N; i++) { const x = A[i][0] * c - A[i][1] * s, y = A[i][0] * s + A[i][1] * c; d += Math.hypot(x - B[i][0], y - B[i][1]); if (d > best * N) break; } d /= N; if (d < best) { best = d; ba = a; } } return [best, ba]; }

// the letter forms: font form and a loopier form (cusps become loops, the way the walk turns), in font units on a shared baseline
function letterForms(ch) {
  return [0, 1].map(v => { const cap = JSON.parse(fs.readFileSync(`${abcDir}/${ch}_${v}.json`));
    const S = cap.strokes.map(a => { const P = []; for (let i = 0; i < a.length; i += 4) P.push([a[i], a[i + 1]]); return P; }).filter(P => P.length > 6);   // no dots
    const P = [].concat(...S), nm = norm(resample(P, N).pts);
    return { ch, v, C: nm.C, ct: nm.c, rt: nm.r, adv: cap.adv, raw: P };
  });
}

const E = L.create(W, R, top[0].g, seed, { lambda: 2 }), P0 = E.parts[0], o = P0.o; o.arena = 1e4;   // writing travels: no page circle
let rs = seed * 7919;
const snap = (S) => ({ st: JSON.parse(JSON.stringify(S.st)), comps: S.comps.slice(), pts: S.pts, x: S.x, y: S.y, t: S.t });
const resume = (sn) => ({ o, r: W.LineGen.mulberry(++rs), st: JSON.parse(JSON.stringify(sn.st)), comps: sn.comps.slice(), pts: sn.pts, x: sn.x, y: sn.y, t: sn.t, choices: [] });
function rollout(sn, secs) {
  const S = resume(sn), n0 = S.pts.length, bounds = [];
  while (S.t < sn.t + secs) { W.Steer.step(S, W.judge); if (S.comps.length > 400) S.comps = S.comps.slice(-200); bounds.push(Object.assign(snap(S), { n: S.pts.length })); }
  return { pts: S.pts, n0, bounds };
}
const taste = (pts) => { const o2 = TJ(R.raster(R.windowOf(pts), SJ.size)); return Math.min(o2[1], o2[2]); };

// find the best letter stretch in one future
function bestIn(fut, forms, ctx) {
  const P = fut.pts, n0 = fut.n0, end = P.length; let best = null;
  for (let s = n0; s <= Math.min(end - 40, n0 + LEAD * HZ); s += 6) for (let dur = 36; dur <= 360; dur += 12) {
    const e = s + dur; if (e >= end) break;
    const Rs = resample(P.slice(s, e + 1), N); if (Rs.len < 1.0) continue;
    const nm = norm(Rs.pts);
    for (const F of forms) {
      const [d, a] = shapeDist(nm.C, F.C); if (d > 0.6) continue;
      const k = nm.r / F.rt, ca = Math.cos(-a), sa = Math.sin(-a);
      const O = [nm.c[0] - k * (F.ct[0] * ca - F.ct[1] * sa), nm.c[1] - k * (F.ct[0] * sa + F.ct[1] * ca)];   // where the letter's origin lands
      let pen = 0.12 * (s - n0) / HZ;   // a little preference for letters that come soon
      if (ctx.k0) { pen += WS * Math.abs(Math.log(k / ctx.k0)); const ex = ctx.Oexp, er = Math.hypot(O[0] - ex[0], (O[1] - ex[1]) * 1.6) / (ctx.k0 * 0.35); pen += WP * er * er; }
      else if (k < 2.5) pen += 0.3 * (2.5 - k);   // first letter: not tiny
      const sc = d + pen;
      if (!best || sc < best.sc) best = { sc, d, a, k, O, s, e, form: F.v };
    }
  }
  return best;
}

(async () => {
  let sn = snap(P0); for (let i = 0; i < 4; i++) W.Steer.step(P0, W.judge); sn = snap(P0);   // a short run-in
  let line = P0.pts.slice(), ctx = { k0: null, Oexp: null }, placed = [];
  const keep12 = (pts) => { const T = pts[pts.length - 1][3]; let i = 0; while (i < pts.length && pts[i][3] < T - 12000) i++; return pts.slice(i); };
  for (const ch of text) {
    if (ch === ' ') { if (ctx.Oexp) ctx.Oexp = [ctx.Oexp[0] + ctx.k0 * SPACE, ctx.Oexp[1]]; continue; }
    const forms = letterForms(ch); let best = null, tries = 0;
    for (let round = 0; round < 3 && (!best || best.sc > 0.28); round++) {
      for (let m = 0; m < M; m++) { const fut = rollout(sn, LEAD + 3.5); tries++; const b = bestIn(fut, forms, ctx); if (!b) continue;
        const bi = fut.bounds.findIndex(B => B.n >= b.e + 1); if (bi < 0) continue; b.fut = fut; b.bound = fut.bounds[bi];
        b.sc -= 0.04 * taste(fut.pts.slice(0, b.bound.n));   // your taste as a tie-breaker
        if (!best || b.sc < best.sc) best = b; }
    }
    if (!best) { console.log(ch, 'no match'); continue; }
    line = line.concat(best.fut.pts.slice(best.fut.n0, best.bound.n));
    const B = best.bound; sn = { st: B.st, comps: B.comps, pts: keep12(B.pts), x: B.x, y: B.y, t: B.t };
    const F = forms[best.form]; if (!ctx.k0) ctx.k0 = best.k; else ctx.k0 = 0.7 * ctx.k0 + 0.3 * best.k;
    ctx.Oexp = [best.O[0] + ctx.k0 * F.adv, best.O[1]];
    placed.push({ ch, O: best.O, k: best.k, a: best.a, d: best.d, form: best.form, raw: F.raw, s: best.s - best.fut.n0, n: best.e - best.s });
    console.log(ch, 'shape', best.d.toFixed(2), 'score', best.sc.toFixed(2), 'size', best.k.toFixed(1), 'form', best.form ? 'loopy' : 'font', 'from', tries, 'futures');
  }
  const guide = []; placed.forEach(p => { const c = Math.cos(-p.a), s = Math.sin(-p.a); p.raw.forEach((q, i) => guide.push([p.O[0] + p.k * (q[0] * c - q[1] * s), p.O[1] + p.k * (q[0] * s + q[1] * c), i === 0 ? 1 : 0])); });
  fs.writeFileSync(out, JSON.stringify({ text, guide, placed: placed.map(p => ({ ch: p.ch, d: p.d, k: p.k, form: p.form })), line: line.filter((p, k) => k % 2 === 0).map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]) }));
})();
