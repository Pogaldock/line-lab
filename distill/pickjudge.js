/* Pick judge (Nov 5 2026): a judge trained on your Path Picks (best and worst of 8).
   It looks at what would be on screen (the last 8 s of the path, including the candidate continuation) and scores it with
   measures that separated your bests from your worsts: how spread out vs cramped it is, its loops and their size, ink-width
   variation, sharpest turns, how much is near-straight, how long turns last, crossings and their angles.
   score = sum of weight × (measure − its average) / its spread; the weights come from a choice model fitted on your sets. */
(function (root) {
  var NAMES = ['extent', 'aspect', 'density', 'loops', 'loopR', 'wSd', 'om90', 'straight', 'runT', 'xn', 'xAngle'];
  function feats(all) {
    var T = all[all.length - 1][3], P = []; for (var i = all.length - 1; i >= 0 && all[i][3] >= T - 8000; i -= 2) P.unshift(all[i]);
    if (P.length < 10) return null;
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, len = 0, wm = 0;
    for (var a = 0; a < P.length; a++) { var p = P[a]; mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); wm += p[2]; if (a) len += Math.hypot(p[0] - P[a - 1][0], p[1] - P[a - 1][1]); }
    var ext = Math.max(mxx - mnx, mxy - mny, 1e-6); wm /= P.length; var wv = 0; P.forEach(function (p) { wv += (p[2] - wm) * (p[2] - wm); });
    // turning rate per step (rad/s), on the subsampled path
    var om = [], th = []; for (var b = 1; b < P.length; b++) th.push(Math.atan2(P[b][1] - P[b - 1][1], P[b][0] - P[b - 1][0]));
    for (var c = 1; c < th.length; c++) { var d = th[c] - th[c - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; om.push(d / Math.max(0.001, (P[c + 1][3] - P[c][3]) / 1000)); }
    var ab = om.map(Math.abs).sort(function (x, y) { return x - y; }), om90 = ab[Math.floor(ab.length * 0.9)] || 0, straight = ab.filter(function (x) { return x < 1; }).length / (ab.length || 1);
    var runs = [], cur = 0, sg = 0; om.forEach(function (o, k) { var s = Math.abs(o) > 1.5 ? (o > 0 ? 1 : -1) : 0; var dt = (P[k + 2][3] - P[k + 1][3]) / 1000; if (s && s === sg) cur += dt; else { if (sg) runs.push(cur); sg = s; cur = s ? dt : 0; } }); if (sg) runs.push(cur);
    var runT = runs.length ? runs.reduce(function (x, y) { return x + y; }, 0) / runs.length : 0;
    // self-crossings: loops (crossing within 1.5 s) and other crossings (with their angle)
    var loops = 0, loopR = 0, xn = 0, xa = 0;
    for (var i2 = 0; i2 < P.length - 3; i2++) for (var j2 = i2 + 2; j2 < P.length - 1; j2++) {
      var A1 = P[i2], A2 = P[i2 + 1], B1 = P[j2], B2 = P[j2 + 1], r0 = A2[0] - A1[0], r1 = A2[1] - A1[1], s0 = B2[0] - B1[0], s1 = B2[1] - B1[1], den = r0 * s1 - r1 * s0; if (Math.abs(den) < 1e-12) continue;
      var u = ((B1[0] - A1[0]) * s1 - (B1[1] - A1[1]) * s0) / den, w = ((B1[0] - A1[0]) * r1 - (B1[1] - A1[1]) * r0) / den; if (u < 0 || u > 1 || w < 0 || w > 1) continue;
      if (B1[3] - A1[3] < 1500) { var cx = 0, cy = 0, n = 0; for (var q = i2; q <= j2; q++) { cx += P[q][0]; cy += P[q][1]; n++; } cx /= n; cy /= n; var rr = 0; for (var q2 = i2; q2 <= j2; q2++) rr = Math.max(rr, Math.hypot(P[q2][0] - cx, P[q2][1] - cy)); loops++; loopR += rr / ext; }
      else { xn++; xa += Math.abs(den) / (Math.hypot(r0, r1) * Math.hypot(s0, s1) + 1e-12); }
    }
    return [ext, Math.min(mxx - mnx, mxy - mny) / ext, len / (ext * ext), loops, loops ? loopR / loops : 0, Math.sqrt(wv / P.length), Math.log(1 + om90), straight, runT, xn, xn ? xa / xn : 0.5];
  }
  function make(W) {
    var judge = function (win, weight, all) { var f = feats(all); if (!f) return 0; var s = 0; for (var k = 0; k < f.length; k++) s += W.w[k] * (f[k] - W.mu[k]) / W.sd[k]; return s * (W.scale || 1); };
    judge.W = W; return judge;
  }
  var api = { NAMES: NAMES, feats: feats, make: make };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PickJudge = api;
})(this);
