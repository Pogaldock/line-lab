// A Latin calligraffiti alphabet designed for the walk (Nov 7). Each letter is a skeleton: points in a letter frame where the
// baseline is y = 0, the x-height is y = -1 (y grows downwards), ascenders reach -2.4 and descenders +1.4. Narrow letters,
// tall verticals. Point types: 's' smooth (the line curves through it) and 'c' a turnaround (the stroke reverses): drawn either
// as a tight loop (the walk's natural move) or a sharp corner (its corner mood, the Fraktur feel).
// Every letter starts on the baseline at x = 0 and ends with an exit stroke rising to the right, so letters chain into one line.
// 'adv' is how far the next letter starts. Dots (i, j) are separate quick flicks drawn after the word.
(function (root) {
  const L = {
    a: { adv: 0.62, p: [[0, 0, 's'], [0.42, -0.95, 'c'], [0.12, -0.9, 's'], [0.02, -0.4, 's'], [0.18, -0.02, 's'], [0.44, -0.6, 's'], [0.46, -1, 'c'], [0.42, 0, 's'], [0.62, -0.28, 's']] },
    b: { adv: 0.62, p: [[0, 0, 's'], [0.38, -1.6, 's'], [0.34, -2.4, 'c'], [0.12, 0, 's'], [0.3, -0.85, 's'], [0.52, -0.6, 's'], [0.3, -0.02, 's'], [0.1, -0.15, 'c'], [0.62, -0.75, 's']] },
    c: { adv: 0.55, p: [[0, 0, 's'], [0.42, -0.9, 's'], [0.3, -1, 's'], [0.05, -0.55, 's'], [0.15, -0.02, 's'], [0.55, -0.3, 's']] },
    d: { adv: 0.62, p: [[0, 0, 's'], [0.42, -0.95, 'c'], [0.12, -0.9, 's'], [0.02, -0.4, 's'], [0.18, -0.02, 's'], [0.44, -0.7, 's'], [0.56, -2.4, 'c'], [0.42, 0, 's'], [0.62, -0.28, 's']] },
    e: { adv: 0.55, p: [[0, -0.25, 's'], [0.4, -0.7, 's'], [0.3, -1.02, 's'], [0.06, -0.6, 's'], [0.15, -0.02, 's'], [0.55, -0.3, 's']] },
    f: { adv: 0.5, p: [[0, 0, 's'], [0.4, -1.7, 's'], [0.42, -2.4, 'c'], [0.18, -0.4, 's'], [0.12, 1.4, 'c'], [0.36, 0.3, 's'], [0.18, -0.05, 's'], [0.5, -0.3, 's']] },
    g: { adv: 0.6, p: [[0, 0, 's'], [0.42, -0.95, 'c'], [0.12, -0.9, 's'], [0.02, -0.4, 's'], [0.18, -0.02, 's'], [0.44, -0.6, 's'], [0.46, -1, 'c'], [0.36, 1.4, 'c'], [0.1, 0.5, 's'], [0.6, -0.2, 's']] },
    h: { adv: 0.62, p: [[0, 0, 's'], [0.38, -1.6, 's'], [0.34, -2.4, 'c'], [0.1, 0, 'c'], [0.38, -1, 's'], [0.46, -0.3, 's'], [0.5, 0, 's'], [0.62, -0.28, 's']] },
    i: { adv: 0.38, dot: [0.22, -1.5], p: [[0, 0, 's'], [0.18, -1, 'c'], [0.12, -0.1, 's'], [0.38, -0.3, 's']] },
    j: { adv: 0.42, dot: [0.24, -1.5], p: [[0, 0, 's'], [0.2, -1, 'c'], [0.14, 1.4, 'c'], [0.0, 0.6, 's'], [0.42, -0.25, 's']] },
    k: { adv: 0.62, p: [[0, 0, 's'], [0.38, -1.6, 's'], [0.34, -2.4, 'c'], [0.1, 0, 'c'], [0.45, -1, 's'], [0.2, -0.5, 'c'], [0.45, -0.05, 's'], [0.62, -0.28, 's']] },
    l: { adv: 0.42, p: [[0, 0, 's'], [0.38, -1.6, 's'], [0.36, -2.4, 'c'], [0.14, -0.1, 's'], [0.42, -0.3, 's']] },
    m: { adv: 0.88, p: [[0, 0, 's'], [0.12, -1, 'c'], [0.08, 0, 'c'], [0.32, -1, 's'], [0.38, 0, 'c'], [0.6, -1, 's'], [0.66, -0.1, 's'], [0.88, -0.28, 's']] },
    n: { adv: 0.62, p: [[0, 0, 's'], [0.12, -1, 'c'], [0.08, 0, 'c'], [0.34, -1, 's'], [0.42, -0.1, 's'], [0.62, -0.28, 's']] },
    o: { adv: 0.55, p: [[0, 0, 's'], [0.38, -0.98, 's'], [0.1, -0.85, 's'], [0.04, -0.3, 's'], [0.25, -0.02, 's'], [0.42, -0.55, 's'], [0.36, -0.95, 'c'], [0.55, -0.85, 's']] },
    p: { adv: 0.62, p: [[0, 0, 's'], [0.16, -1, 'c'], [0.1, 1.4, 'c'], [0.16, -0.8, 's'], [0.5, -0.8, 's'], [0.4, -0.05, 's'], [0.14, -0.1, 's'], [0.62, -0.3, 's']] },
    q: { adv: 0.6, p: [[0, 0, 's'], [0.42, -0.95, 'c'], [0.12, -0.9, 's'], [0.02, -0.4, 's'], [0.18, -0.02, 's'], [0.44, -0.6, 's'], [0.46, -1, 'c'], [0.38, 1.4, 'c'], [0.6, 0.6, 's']] },
    r: { adv: 0.5, p: [[0, 0, 's'], [0.14, -1, 'c'], [0.12, 0, 'c'], [0.26, -0.8, 's'], [0.5, -0.9, 's']] },
    s: { adv: 0.5, p: [[0, 0, 's'], [0.3, -1.02, 'c'], [0.42, -0.4, 's'], [0.24, -0.02, 's'], [0.04, -0.14, 'c'], [0.5, -0.3, 's']] },
    t: { adv: 0.45, bar: [[0.02, -1.1], [0.42, -1.15]], p: [[0, 0, 's'], [0.3, -1.4, 's'], [0.3, -1.9, 'c'], [0.14, -0.1, 's'], [0.45, -0.3, 's']] },
    u: { adv: 0.62, p: [[0, 0, 's'], [0.12, -1, 'c'], [0.1, -0.2, 's'], [0.24, -0.02, 's'], [0.42, -1, 'c'], [0.42, -0.1, 's'], [0.62, -0.28, 's']] },
    v: { adv: 0.55, p: [[0, 0, 's'], [0.12, -1, 'c'], [0.2, -0.05, 'c'], [0.42, -1, 's'], [0.38, -0.9, 'c'], [0.55, -0.85, 's']] },
    w: { adv: 0.8, p: [[0, 0, 's'], [0.12, -1, 'c'], [0.18, -0.05, 'c'], [0.38, -0.9, 'c'], [0.44, -0.05, 'c'], [0.66, -1, 's'], [0.6, -0.9, 'c'], [0.8, -0.85, 's']] },
    x: { adv: 0.55, bar: [[0.42, -1], [0.08, 0]], p: [[0, 0, 's'], [0.12, -1, 'c'], [0.22, -0.5, 's'], [0.38, -0.05, 's'], [0.55, -0.3, 's']] },
    y: { adv: 0.6, p: [[0, 0, 's'], [0.12, -1, 'c'], [0.1, -0.2, 's'], [0.24, -0.02, 's'], [0.42, -1, 'c'], [0.32, 1.4, 'c'], [0.08, 0.5, 's'], [0.6, -0.2, 's']] },
    z: { adv: 0.55, p: [[0, 0, 's'], [0.1, -0.95, 's'], [0.42, -1, 'c'], [0.06, -0.02, 'c'], [0.4, 0.05, 's'], [0.3, 1.2, 'c'], [0.1, 0.6, 's'], [0.55, -0.2, 's']] },
  };
  // a word -> one continuous skeleton: letters laid end to end, each letter's first point shifted onto the previous exit
  // opt: { slant (radians, lean right), loops (true: turnarounds as tight loops, false: sharp corners), loopR }
  function word(text, opt) {
    opt = Object.assign({ slant: 0.22, loops: true, loopR: 0.11, track: 0.16 }, opt || {});
    let x = 0, pts = [], extras = [];
    for (const ch of text.toLowerCase()) {
      if (ch === ' ') { x += 0.5; continue; }
      const G = L[ch]; if (!G) continue;
      const P = G.p.map(q => [q[0] + x, q[1], q[2]]);
      if (pts.length) P.shift();   // the previous exit already arrives at this letter's start
      pts = pts.concat(P);
      if (G.dot) extras.push({ kind: 'dot', at: [G.dot[0] + x, G.dot[1]] });
      if (G.bar) extras.push({ kind: 'bar', a: [G.bar[0][0] + x, G.bar[0][1]], b: [G.bar[1][0] + x, G.bar[1][1]] });
      x += G.adv + opt.track;
    }
    const line = spline(pts, opt);
    const sl = (p) => [p[0] - p[1] * Math.tan(opt.slant), p[1]];   // lean right: higher points move right
    return { line: line.map(sl), extras: extras.map(e => e.kind === 'dot' ? { kind: 'dot', at: sl(e.at) } : { kind: 'bar', a: sl(e.a), b: sl(e.b) }), width: x };
  }
  // centripetal Catmull-Rom through the skeleton; turnarounds become tight loops or sharp corners
  function spline(P, opt) {
    const runs = [[P[0]]];   // split at corners when loops are off
    const pts = [];
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p[2] === 'c' && opt.loops && i > 0 && i < P.length - 1) {
        // a tight loop around the turnaround: go a little past it, swing round, and come back across the line
        const a = norm(sub(p, P[i - 1])), b = norm(sub(P[i + 1], p)), turn = Math.sign(a[0] * b[1] - a[1] * b[0]) || 1, n = [-a[1] * turn, a[0] * turn], r = opt.loopR;
        pts.push([p[0] - a[0] * r * 0.6, p[1] - a[1] * r * 0.6, 's']);
        pts.push([p[0] + n[0] * r * 0.9 + a[0] * r * 0.5, p[1] + n[1] * r * 0.9 + a[1] * r * 0.5, 's']);
        pts.push([p[0] + n[0] * r * 1.6, p[1] + n[1] * r * 1.6, 's']);
        pts.push([p[0] + n[0] * r * 1.2 - a[0] * r * 0.5, p[1] + n[1] * r * 1.2 - a[1] * r * 0.5, 's']);
      } else pts.push(p);
    }
    const out = []; let seg = [pts[0]];
    for (let i = 1; i < pts.length; i++) { seg.push(pts[i]); if (pts[i][2] === 'c' && !opt.loops) { out.push(seg); seg = [pts[i]]; } }
    out.push(seg);
    const res = [];
    out.forEach((S, k) => { const c = cr(S); if (k) c.shift(); res.push(...c); });
    return res;
  }
  function cr(S) {
    if (S.length < 3) return S.map(p => [p[0], p[1]]);
    const Q = [S[0]].concat(S, [S[S.length - 1]]), out = [];
    for (let i = 1; i < Q.length - 2; i++) {
      const p0 = Q[i - 1], p1 = Q[i], p2 = Q[i + 1], p3 = Q[i + 2], n = 14;
      const t01 = Math.pow(dist(p0, p1) || 1e-4, 0.5), t12 = Math.pow(dist(p1, p2) || 1e-4, 0.5), t23 = Math.pow(dist(p2, p3) || 1e-4, 0.5);
      for (let k = (i === 1 ? 0 : 1); k <= n; k++) { const t = k / n;
        const m1 = [0, 1].map(j => (p2[j] - p1[j] + t12 * ((p1[j] - p0[j]) / t01 - (p2[j] - p0[j]) / (t01 + t12)))), m2 = [0, 1].map(j => (p2[j] - p1[j] + t12 * ((p3[j] - p2[j]) / t23 - (p3[j] - p1[j]) / (t12 + t23))));
        const h00 = 2 * t * t * t - 3 * t * t + 1, h10 = t * t * t - 2 * t * t + t, h01 = -2 * t * t * t + 3 * t * t, h11 = t * t * t - t * t;
        out.push([0, 1].map(j => h00 * p1[j] + h10 * m1[j] + h01 * p2[j] + h11 * m2[j])); }
    }
    return out;
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const api = { L, word, spline };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calligraffiti = api;
})(this);
