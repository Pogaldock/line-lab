// The found alphabet: for each letter, the walk's own best natural versions of it, mined from plain natural walks.
// Each find is converted into the letter's font units (origin on the baseline, 1 = font size) so it can be used as a target.
// Usage: node found_alphabet.js <natDir> <abcDir> <out.json> [letters=abcdefghijklmnopqrstuvwxyz] [keep=4]
//        node found_alphabet.js merge <out.json> <keep> <in1.json> [in2.json ...]     (keep the best finds per letter across runs)
// Each find: pts [x, y, pressure, ms] in font units (origin on the baseline, 1 = font size), d (shape distance), k (walk units per font unit).
const fs = require('fs');
if (process.argv[2] === 'merge') {
  const [, , , out2, keep2, ...ins] = process.argv, all = {};
  for (const f of ins) { const J = JSON.parse(fs.readFileSync(f)); for (const ch in J) all[ch] = (all[ch] || []).concat(J[ch]); }
  for (const ch in all) all[ch] = all[ch].sort((a, b) => a.d - b.d).slice(0, +keep2);
  fs.writeFileSync(out2, JSON.stringify(all)); for (const ch of Object.keys(all).sort()) console.log(ch, all[ch].map(r => r.d.toFixed(2)).join(' '));
  process.exit(0);
}
const [natDir, abcDir, out] = process.argv.slice(2, 5), LET = process.argv[5] || 'abcdefghijklmnopqrstuvwxyz', KEEP = +(process.argv[6] || 4), N = 32;
function resample(P, n) {
  const Lc = [0]; for (let i = 1; i < P.length; i++) Lc.push(Lc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const T = Lc[Lc.length - 1], o = []; let j = 0;
  for (let k = 0; k < n; k++) { const s = T * k / (n - 1); while (j < P.length - 2 && Lc[j + 1] < s) j++; const u = (s - Lc[j]) / Math.max(1e-9, Lc[j + 1] - Lc[j]); o.push([P[j][0] + (P[j + 1][0] - P[j][0]) * u, P[j][1] + (P[j + 1][1] - P[j][1]) * u]); }
  return { pts: o, len: T };
}
function norm(Q) { let cx = 0, cy = 0; Q.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= Q.length; cy /= Q.length; const C = Q.map(p => [p[0] - cx, p[1] - cy]); const r = Math.sqrt(C.reduce((a, p) => a + p[0] * p[0] + p[1] * p[1], 0) / C.length) || 1; return { C: C.map(p => [p[0] / r, p[1] / r]), c: [cx, cy], r }; }
const ROT = []; for (let a = -0.35; a <= 0.351; a += 0.0875) ROT.push([Math.cos(a), Math.sin(a), a]);
function shapeDist(A, B, cap) { let best = cap, ba = null; for (const [c, s, a] of ROT) { let d = 0; const lim = best * N; for (let i = 0; i < N && d < lim; i++) { const x = A[i][0] * c - A[i][1] * s, y = A[i][0] * s + A[i][1] * c; d += Math.hypot(x - B[i][0], y - B[i][1]); } d /= N; if (d < best) { best = d; ba = a; } } return ba == null ? null : [best, ba]; }
const forms = {};
for (const ch of LET) forms[ch] = [0, 1].map(v => { const cap = JSON.parse(fs.readFileSync(`${abcDir}/${ch}_${v}.json`)); const S = cap.strokes.map(a => { const P = []; for (let i = 0; i < a.length; i += 4) P.push([a[i], a[i + 1]]); return P; }).filter(P => P.length > 6); const nm = norm(resample([].concat(...S), N).pts); return { v, C: nm.C, ct: nm.c, rt: nm.r }; });
const files = fs.readdirSync(natDir).filter(f => f.endsWith('.json'));
const top = {}; for (const ch of LET) top[ch] = [];
const push = (ch, c) => { const L = top[ch]; if (L.some(k => k.f === c.f && c.s < k.e && k.s < c.e && k.d <= c.d)) return; for (let i = L.length - 1; i >= 0; i--) if (L[i].f === c.f && c.s < L[i].e && L[i].s < c.e) L.splice(i, 1); L.push(c); L.sort((a, b) => a.d - b.d); if (L.length > KEEP * 3) L.length = KEEP * 3; };
for (const f of files) {
  const P = JSON.parse(fs.readFileSync(natDir + '/' + f));
  for (let s = 0; s < P.length - 40; s += 6) for (let dur = 36; dur <= 360; dur += 12) {
    const e = s + dur; if (e >= P.length) break;
    const Rs = resample(P.slice(s, e + 1), N); if (Rs.len < 1.0) continue; const nm = norm(Rs.pts);
    for (const ch of LET) { const L = top[ch], cap = L.length >= KEEP * 3 ? L[L.length - 1].d : 0.6;
      for (const F of forms[ch]) { const m = shapeDist(nm.C, F.C, cap); if (m) push(ch, { d: m[0], a: m[1], f, s, e, v: F.v, c: nm.c, k: nm.r / F.rt }); } }
  }
  process.stderr.write('.');
}
const res = {};
for (const ch of LET) {
  res[ch] = top[ch].slice(0, KEEP).map(m => {
    const P = JSON.parse(fs.readFileSync(natDir + '/' + m.f)).slice(m.s, m.e + 1), F = forms[ch][m.v], ca = Math.cos(m.a), sa = Math.sin(m.a);
    // into font units: Tf = ct + Rot(a)(P - c)/k  (rt cancels: k = r/rt)
    const t0 = P[0][3], pts = P.map(p => { const x = (p[0] - m.c[0]) / m.k, y = (p[1] - m.c[1]) / m.k; return [+(F.ct[0] + x * ca - y * sa).toFixed(4), +(F.ct[1] + x * sa + y * ca).toFixed(4), +(+p[2]).toFixed(3), Math.round(p[3] - t0)]; });
    return { d: +m.d.toFixed(3), form: m.v ? 'loopy' : 'font', src: (process.env.TAG || '') + m.f + ':' + m.s, k: +m.k.toFixed(2), pts };
  });
  console.log(ch, res[ch].map(r => r.d.toFixed(2)).join(' '));
}
fs.writeFileSync(out, JSON.stringify(res));
