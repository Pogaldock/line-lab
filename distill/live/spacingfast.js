/* Exact fast version of spacing() for the four numbers the walk's judge uses (sp_touch, sp_cross, sp_cover, sp_passGap).
   Same resampling and arithmetic; the O(N^2) loops become grid lookups:
   - strand gaps only matter below 0.12 x size, so each point checks only its 3x3 grid neighbourhood (cell = 0.12 x size);
   - two segments can only cross if their boxes overlap, so each segment checks segments registered in the cells its box touches. */
function spacingFast(pts) {
  const n0 = pts.length; if (n0 < 10) return null;
  const d = [0]; for (let i = 1; i < n0; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = d[n0 - 1]; if (!(L > 1e-6)) return null; const N = 300, P = []; let j = 0;
  for (let k = 0; k < N; k++) { const s = L * k / (N - 1); while (j < n0 - 2 && d[j + 1] < s) j++; const u = (s - d[j]) / ((d[j + 1] - d[j]) || 1); P.push([pts[j][0] + u * (pts[j + 1][0] - pts[j][0]), pts[j][1] + u * (pts[j + 1][1] - pts[j][1])]); }
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; P.forEach(p => { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
  const size = Math.max(mxx - mnx, mxy - mny) || 1, skip = Math.round(0.08 * N);
  // strand gaps below 0.12 (exact), via grid
  const cs = 0.12 * size, G = new Map(), key = (i, j2) => i * 100003 + j2, ci = v => Math.floor((v - mnx) / cs), cj = v => Math.floor((v - mny) / cs);
  for (let a = 0; a < N; a++) { const k = key(ci(P[a][0]), cj(P[a][1])); let l = G.get(k); if (!l) G.set(k, l = []); l.push(a); }
  const near = []; let touch = 0;
  for (let a = 0; a < N; a++) { const x0 = ci(P[a][0]), y0 = cj(P[a][1]); let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const l = G.get(key(x0 + dx, y0 + dy)); if (!l) continue; for (const b of l) { if (Math.abs(a - b) <= skip) continue; const dd = Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]); if (dd < best) best = dd; } }
    const gp = best / size; if (gp < 0.12) near.push(gp); if (gp < 0.025) touch++; }
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  // crossings (exact predicate), via grid of segment boxes
  let seg = 0; for (let a = 0; a < N - 1; a++) seg = Math.max(seg, Math.abs(P[a + 1][0] - P[a][0]), Math.abs(P[a + 1][1] - P[a][1]));
  const cs2 = Math.max(seg, size / 64) || 1, G2 = new Map(), cx2 = v => Math.floor((v - mnx) / cs2), cy2 = v => Math.floor((v - mny) / cs2);
  for (let a = 0; a < N - 1; a++) { const x0 = cx2(Math.min(P[a][0], P[a + 1][0])), x1 = cx2(Math.max(P[a][0], P[a + 1][0])), y0 = cy2(Math.min(P[a][1], P[a + 1][1])), y1 = cy2(Math.max(P[a][1], P[a + 1][1]));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = key(x, y); let l = G2.get(k); if (!l) G2.set(k, l = []); l.push(a); } }
  const seen = new Set(); let nc = 0;
  for (const l of G2.values()) for (let u = 0; u < l.length; u++) for (let v = 0; v < l.length; v++) { const a = l[u], b = l[v]; if (b < a + 2) continue; const pk = a * N + b; if (seen.has(pk)) continue; seen.add(pk);
    const p = P[a], q = P[a + 1], r = P[b], s = P[b + 1];
    const d1 = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]), d2 = (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
    const d3 = (s[0] - r[0]) * (p[1] - r[1]) - (s[1] - r[1]) * (p[0] - r[0]), d4 = (s[0] - r[0]) * (q[1] - r[1]) - (s[1] - r[1]) * (q[0] - r[0]);
    if (d1 * d2 < 0 && d3 * d4 < 0) nc++; }
  // cover: identical raster + chamfer (only what sp_cover needs)
  const R = 80, ink = new Uint8Array(R * R), mx = v => Math.min(R - 1, Math.max(0, Math.floor((v - mnx) / size * (R - 1)))), my = v => Math.min(R - 1, Math.max(0, Math.floor((v - mny) / size * (R - 1))));
  for (let a = 0; a < N - 1; a++) for (let t = 0; t <= 4; t++) { const x = P[a][0] + (P[a + 1][0] - P[a][0]) * t / 4, y = P[a][1] + (P[a + 1][1] - P[a][1]) * t / 4; ink[my(y) * R + mx(x)] = 1; }
  const W = Math.ceil((mxx - mnx) / size * (R - 1)) + 1, H = Math.ceil((mxy - mny) / size * (R - 1)) + 1, D = new Float32Array(R * R).fill(1e9);
  for (let i = 0; i < R * R; i++) if (ink[i]) D[i] = 0;
  const NB = [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414], [1, 0, 1], [0, 1, 1], [1, 1, 1.414], [-1, 1, 1.414]];
  for (let pass = 0; pass < 2; pass++) for (let yy = 0; yy < H; yy++) { const y = pass ? H - 1 - yy : yy; for (let xx = 0; xx < W; xx++) { const x = pass ? W - 1 - xx : xx, i = y * R + x;
    for (let n = 0; n < 8; n++) { const nx = x + NB[n][0], ny = y + NB[n][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const v = D[ny * R + nx] + NB[n][2]; if (v < D[i]) D[i] = v; } } }
  let inside = 0, filled = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { inside++; if (D[y * R + x] <= 4) filled++; }
  return { sp_touch: touch / N, sp_cross: nc, sp_cover: inside ? filled / inside : 0, sp_passGap: near.length ? mean(near) : 0.12 };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { spacingFast };
