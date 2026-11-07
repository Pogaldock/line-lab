// Do letters exist in the walk's natural motion? Search plain natural walks for the stretches that best match each letter's shape
// (any size and position, tilt within +-20 degrees, same writing direction). Usage: node emerge_probe.js <natDir> <tplDir> <out.json> letters...
const fs = require('fs');
const [natDir, tplDir, out, ...letters] = process.argv.slice(2);
const N = 32;
function resample(P, n) {
  const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const T = L[L.length - 1], out = []; let j = 0;
  for (let k = 0; k < n; k++) { const s = T * k / (n - 1); while (j < P.length - 2 && L[j + 1] < s) j++; const u = (s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]); out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * u, P[j][1] + (P[j + 1][1] - P[j][1]) * u]); }
  return { pts: out, len: T };
}
function norm(Q) { let cx = 0, cy = 0; Q.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= Q.length; cy /= Q.length; const C = Q.map(p => [p[0] - cx, p[1] - cy]); const r = Math.sqrt(C.reduce((a, p) => a + p[0] * p[0] + p[1] * p[1], 0) / C.length) || 1; return { C: C.map(p => [p[0] / r, p[1] / r]), r }; }
const ROT = []; for (let a = -0.35; a <= 0.351; a += 0.0875) ROT.push([Math.cos(a), Math.sin(a), a]);
function dist(A, B) { let best = 1e9, ba = 0; for (const [c, s, a] of ROT) { let d = 0; for (let i = 0; i < N; i++) { const x = A[i][0] * c - A[i][1] * s, y = A[i][0] * s + A[i][1] * c; d += Math.hypot(x - B[i][0], y - B[i][1]); } if (d < best) { best = d; ba = a; } } return [best / N, ba]; }
const tpl = {}; letters.forEach(ch => { const cap = JSON.parse(fs.readFileSync(tplDir + '/' + ch + '.json')); const S = cap.strokes.map(a => { const P = []; for (let i = 0; i < a.length; i += 4) P.push([a[i], a[i + 1]]); return P; }).filter(P => P.length > 6); const P = [].concat(...S); tpl[ch] = norm(resample(P, N).pts).C; });
const nat = fs.readdirSync(natDir).filter(f => f.endsWith('.json')).map(f => ({ f, P: JSON.parse(fs.readFileSync(natDir + '/' + f)) }));
const res = {}; letters.forEach(ch => res[ch] = []);
for (const { f, P } of nat) {
  for (let s = 0; s < P.length - 40; s += 6) for (let dur = 36; dur <= 360; dur += 12) {
    const e = s + dur; if (e >= P.length) break;
    const R = resample(P.slice(s, e + 1), N); if (R.len < 1.0) continue;
    const { C, r } = norm(R.pts);
    for (const ch of letters) { const [d, a] = dist(C, tpl[ch]); res[ch].push({ d, a, f, s, e, r }); }
  }
}
const pick = {};
for (const ch of letters) {   // best 4 that don't overlap each other
  const L = res[ch].sort((x, y) => x.d - y.d), keep = [];
  for (const c of L) { if (keep.some(k => k.f === c.f && c.s < k.e && k.s < c.e)) continue; keep.push(c); if (keep.length >= 4) break; }
  pick[ch] = keep.map(c => ({ d: +c.d.toFixed(3), a: +c.a.toFixed(2), f: c.f, s: c.s, e: c.e, pts: nat.find(n => n.f === c.f).P.slice(c.s, c.e + 1).filter((_, k) => k % 2 === 0) }));
  const all = res[ch].length; console.log(ch, 'best', keep.map(k => k.d.toFixed(2)).join(' '), ' (median of', all, 'stretches', res[ch][Math.floor(all / 2)].d.toFixed(2) + ')');
}
fs.writeFileSync(out, JSON.stringify({ tpl, pick }));
