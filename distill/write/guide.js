// Turn a Hand Bank capture into a guide path for the pen, and the pull that bends the pen towards it.
// Strokes are flat arrays [x, y, pressure, ms, ...] in page units; they are scaled so the word's height is `height` pen units, joined
// in writing order (pen lifts become 'air' stretches), and resampled every 0.05 units of arc length.
function guideFrom(cap, height) {
  const S = cap.strokes.map(a => { const P = []; for (let i = 0; i < a.length; i += 4) P.push([a[i], a[i + 1]]); return P; }).filter(P => P.length > 1);
  const all = S.flat(), ys = all.map(p => p[1]), xs = all.map(p => p[0]), k = height / (Math.max(...ys) - Math.min(...ys)), x0 = S[0][0][0], y0 = S[0][0][1];
  const raw = []; S.forEach((P, si) => { if (si) raw.push({ x: (P[0][0] - x0) * k, y: (P[0][1] - y0) * k, air: true }); P.forEach((p, i) => raw.push({ x: (p[0] - x0) * k, y: (p[1] - y0) * k, air: false })); });
  const G = [raw[0]]; for (let i = 1; i < raw.length; i++) { const a = G[G.length - 1], b = raw[i], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 0.05); for (let j = 1; j <= n; j++) G.push({ x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n, air: b.air }); }
  for (let i = 0; i < G.length; i++) G[i].s = i * 0.05;   // approx arc length
  return { G, width: (Math.max(...xs) - Math.min(...xs)) * k, len: G.length * 0.05 };
}
// The pull: before each pulse, find where the pen is along the word (nearest guide point a little behind to well ahead of the cursor),
// move the cursor forward, aim at a point `lead` units ahead and bend the proposed turn towards it with strength g (air: g/3).
function makeSense(guide, g, lead) {
  const G = guide.G;
  return function (st, tau) {
    const x = st.ex, y = st.ey; let c = st.gc || 0, best = c, bd = 1e9;
    // the cursor can move at most 2.5 units along the word per pulse (no jumping to a later letter that loops nearby)
    for (let i = Math.max(0, c - 10); i < Math.min(G.length, c + 50); i++) { const d = (G[i].x - x) ** 2 + (G[i].y - y) ** 2; if (d < bd) { bd = d; best = i; } }
    c = Math.max(c, best); st.gc = c; st.gdev = Math.sqrt(bd);
    if (c >= G.length - 2) return tau;
    const T = G[Math.min(G.length - 1, c + Math.round(lead / 0.05))], want = Math.atan2(T.y - y, T.x - x), have = st.h + tau / 2;
    let d = want - have; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const gg = G[c].air ? g / 3 : g; return tau + gg * d * 2;
  };
}
module.exports = { guideFrom, makeSense };
