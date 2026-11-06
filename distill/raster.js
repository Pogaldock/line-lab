/* One rasterizer for everything: training images, the image-model teacher, and the browser judge.
   Draws the 8 s window (points [x, y, width, t]) fitted into an S×S square, older ink lighter, as in the feed thumbnails.
   Returns ink amount per pixel, 0 = paper, 1 = full ink (row-major Float32Array). */
(function (root) {
  function raster(P, S) {
    var img = new Float32Array(S * S); if (!P || P.length < 2) return img;
    var a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (var i = 0; i < P.length; i++) { var p = P[i]; if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; if (p[1] < c) c = p[1]; if (p[1] > d) d = p[1]; }
    var s = S * 0.86 / Math.max(b - a, d - c, 1e-6), mx = (a + b) / 2, my = (c + d) / 2, t0 = P[0][3], t1 = P[P.length - 1][3], h = S / 2, wsc = S / 224;
    for (var k = 1; k < P.length; k++) {
      var q0 = P[k - 1], q1 = P[k], x0 = h + (q0[0] - mx) * s, y0 = h + (q0[1] - my) * s, x1 = h + (q1[0] - mx) * s, y1 = h + (q1[1] - my) * s;
      var ink = 1 - (200 * (1 - (0.3 + 0.7 * (q1[3] - t0) / ((t1 - t0) || 1)))) / 255;
      var hw = Math.max(0.5, 3.2 * (0.25 + q1[2]) * wsc / 2), dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
      var ix0 = Math.max(0, Math.floor(Math.min(x0, x1) - hw - 1)), ix1 = Math.min(S - 1, Math.ceil(Math.max(x0, x1) + hw + 1)), iy0 = Math.max(0, Math.floor(Math.min(y0, y1) - hw - 1)), iy1 = Math.min(S - 1, Math.ceil(Math.max(y0, y1) + hw + 1));
      for (var y = iy0; y <= iy1; y++) for (var x = ix0; x <= ix1; x++) {
        var px = x + 0.5, py = y + 0.5, u = ((px - x0) * dx + (py - y0) * dy) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
        var ex = px - x0 - u * dx, ey = py - y0 - u * dy, cov = hw + 0.5 - Math.sqrt(ex * ex + ey * ey); if (cov <= 0) continue; if (cov > 1) cov = 1;
        var v = ink * cov, o = y * S + x; if (v > img[o]) img[o] = v;
      }
    }
    return img;
  }
  /* the window the judge looks at: last 8 s, every 2nd point (same as what the feed stores) */
  function windowOf(pts, T) { T = T == null ? pts[pts.length - 1][3] : T; var V = []; for (var i = 0; i < pts.length; i++) if (pts[i][3] <= T && pts[i][3] >= T - 8000) V.push(pts[i]); return V.filter(function (p, k) { return k % 2 === 0; }); }
  var api = { raster: raster, windowOf: windowOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Raster = api;
})(this);
