// The 4-measure spacing formula (fitted on 1,610 labelled lines, code/allfeats.py), as a cheap judge for steering.
//   + share of the line with another strand within 0.1 box widths
//   - total area of enclosed holes
//   + unevenness of the empty space (std of distance to the nearest ink)
//   - median gap to the nearest other strand
// Input: a window [[x, y, w, ms], ...] (as drawn on the card). Output: score in the same units as a logistic model (higher = more like your goods).
const N = 400, S = 96;
const COEF = [[0.75, 0.653, 0.133], [-0.42, 0.041, 0.063], [0.43, 0.107, 0.021], [-0.17, 0.076, 0.020]], B0 = -0.30;
function edt1(f, n) {   // exact 1D squared distance transform (Felzenszwalb & Huttenlocher)
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1); let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) { let s; do { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k]) k--; else break; } while (k >= 0); k++; v[k] = q; z[k] = s; z[k + 1] = Infinity; }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; } return d;
}
function measures(win) {
  let P = win.filter((p, i) => i === 0 || Math.hypot(p[0] - win[i - 1][0], p[1] - win[i - 1][1]) > 1e-9); if (P.length < 10) return null;
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9; P.forEach(p => { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); });
  const ext = Math.max(b - a, d - c, 1e-9), mx = (a + b) / 2, my = (c + d) / 2, X0 = P.map(p => (p[0] - mx) / ext), Y0 = P.map(p => (p[1] - my) / ext), Sc = [0];
  for (let i = 1; i < P.length; i++) Sc.push(Sc[i - 1] + Math.hypot(X0[i] - X0[i - 1], Y0[i] - Y0[i - 1]));
  const L = Sc[Sc.length - 1], x = new Float64Array(N), y = new Float64Array(N); let j = 0;
  for (let i = 0; i < N; i++) { const u = L * i / (N - 1); while (j < Sc.length - 2 && Sc[j + 1] < u) j++; const g = Math.max(0, Math.min(1, (u - Sc[j]) / Math.max(Sc[j + 1] - Sc[j], 1e-12))); x[i] = X0[j] + g * (X0[j + 1] - X0[j]); y[i] = Y0[j] + g * (Y0[j + 1] - Y0[j]); }
  // strands: nearest point at least 0.12 box widths further along the line, within 0.35
  const ds = L / (N - 1), sep = Math.max(8, Math.floor(0.12 / ds)), gaps = []; let near = 0;
  for (let i = 0; i < N; i++) { let best = Infinity; for (let k = 0; k < N; k++) { if (Math.abs(k - i) <= sep) continue; const dd = Math.hypot(x[k] - x[i], y[k] - y[i]); if (dd < best) best = dd; } if (best <= 0.35) { gaps.push(best); if (best < 0.1) near++; } }
  gaps.sort((p, q) => p - q); const gmed = gaps.length ? (gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2) : 0.35;
  // raster of the line in the box, 96 x 96
  const img = new Uint8Array(S * S), px = i => Math.min(S - 1, Math.max(0, Math.round((x[i] + 0.5) * (S - 1)))), py = i => Math.min(S - 1, Math.max(0, Math.round((y[i] + 0.5) * (S - 1))));
  for (let i = 0; i < N - 1; i++) { const x0 = px(i), y0 = py(i), x1 = px(i + 1), y1 = py(i + 1), m = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let q = 0; q <= m; q++) img[Math.round(y0 + (y1 - y0) * q / m) * S + Math.round(x0 + (x1 - x0) * q / m)] = 1; }
  // distance from every pixel to the nearest ink, spread of it
  const INF = 1e12, D2 = new Float64Array(S * S);
  for (let r = 0; r < S; r++) { const f = new Float64Array(S); for (let q = 0; q < S; q++) f[q] = img[r * S + q] ? 0 : INF; const o = edt1(f, S); for (let q = 0; q < S; q++) D2[r * S + q] = o[q]; }
  for (let q = 0; q < S; q++) { const f = new Float64Array(S); for (let r = 0; r < S; r++) f[r] = D2[r * S + q]; const o = edt1(f, S); for (let r = 0; r < S; r++) D2[r * S + q] = o[r]; }
  let m1 = 0, m2 = 0; for (let k = 0; k < S * S; k++) { const v = Math.sqrt(D2[k]) / S; m1 += v; m2 += v * v; } m1 /= S * S; const dstd = Math.sqrt(Math.max(0, m2 / (S * S) - m1 * m1));
  // enclosed holes: empty regions not touching the border (4-connected), bigger than 6 pixels
  const lab = new Int32Array(S * S).fill(-1); let holes = 0; const st = [];
  for (let s0 = 0; s0 < S * S; s0++) { if (img[s0] || lab[s0] >= 0) continue; let size = 0, border = false; st.push(s0); lab[s0] = 1;
    while (st.length) { const k = st.pop(); size++; const r = (k / S) | 0, q = k % S; if (r === 0 || q === 0 || r === S - 1 || q === S - 1) border = true;
      if (q > 0 && !img[k - 1] && lab[k - 1] < 0) { lab[k - 1] = 1; st.push(k - 1); } if (q < S - 1 && !img[k + 1] && lab[k + 1] < 0) { lab[k + 1] = 1; st.push(k + 1); }
      if (r > 0 && !img[k - S] && lab[k - S] < 0) { lab[k - S] = 1; st.push(k - S); } if (r < S - 1 && !img[k + S] && lab[k + S] < 0) { lab[k + S] = 1; st.push(k + S); } }
    if (!border && size > 6) holes += size / (S * S); }
  return [near / N, holes, dstd, gmed];
}
function score(win) { const m = measures(win); if (!m) return -5; let s = B0; for (let i = 0; i < 4; i++) s += COEF[i][0] * (m[i] - COEF[i][1]) / COEF[i][2]; return s; }
module.exports = { measures, score };
