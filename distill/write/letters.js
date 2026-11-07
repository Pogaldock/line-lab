// Letters in the walk's own language. The walk is a chain of overlapping pulses (each moves D units along a circular arc
// turning from direction ts to te, with a lognormal speed profile). Handwriting is modelled the same way (Plamondon's
// sigma-lognormal theory), so a letter can be cut into pulse-sized arcs and played back by the walk with its own timing,
// overlap and pressure. Between letter groups the walk runs free, pulled gently towards the next group's start.
//
// fitPulses(points): a polyline (pen units) -> [{D, ts, te}]   (cut at sharp corners, then into arcs of ~1 unit / <=1 rad)
// buildScript(cap, height, gap): a font capture -> groups [{x, y, pulses}] placed along the line, with `gap` extra units between groups
// makeScript(groups, opt): -> { script(st, r), sense(st, tau) } to plug into the walk (o.script, o.sense)

function resample(P, step) {
  const out = [P[0]];
  let carry = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = step - carry;
    while (s <= d) { out.push([a[0] + (b[0] - a[0]) * s / d, a[1] + (b[1] - a[1]) * s / d]); s += step; }
    carry = d - (s - step);
  }
  const L = P[P.length - 1]; if (Math.hypot(L[0] - out[out.length - 1][0], L[1] - out[out.length - 1][1]) > step * 0.3) out.push(L);
  return out;
}
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function fitPulses(P, opt) {
  opt = Object.assign({ step: 0.05, Dt: 1.0, maxTurn: 1.0, minD: 0.25 }, opt || {});
  const Q = resample(P, opt.step), n = Q.length;
  if (n < 3) return [];
  // tangent at each point, from a short symmetric window
  const w = 3, th = Q.map((_, i) => { const a = Q[Math.max(0, i - w)], b = Q[Math.min(n - 1, i + w)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); });
  for (let i = 1; i < n; i++) th[i] = th[i - 1] + wrap(th[i] - th[i - 1]);   // unwrap so turns accumulate
  // sharp corners: where the direction changes by more than 1.4 rad within 0.3 units, the pen restarts its direction
  const cut = new Set(), W = Math.round(0.15 / opt.step);
  for (let i = W; i < n - W; i++) { const d = Math.abs(th[i + W] - th[i - W]); if (d > 1.4) { let j = i; while (j + 1 < n - W && Math.abs(th[j + 1 + W] - th[j + 1 - W]) > d) j++; cut.add(j); i = j + W; } }
  const pulses = []; let s = 0, len = 0;
  for (let i = 1; i < n; i++) {
    len += opt.step;
    const turn = th[i] - th[s], corner = cut.has(i), last = i === n - 1;
    if ((len >= opt.Dt || Math.abs(turn) >= opt.maxTurn || corner || last) && (len >= opt.minD || last || corner)) {
      // a corner: the incoming pulse ends heading into the corner, the next one leaves along the new direction
      const te = corner ? Math.atan2(Q[i][1] - Q[Math.max(s, i - 2)][1], Q[i][0] - Q[Math.max(s, i - 2)][0]) : th[i];
      const ts = th[s], dte = ts + wrap(te - ts);
      // a circular arc of length D turning by (te - ts) ends at the chord; size D so the chord matches the piece's chord
      const chord = Math.hypot(Q[i][0] - Q[s][0], Q[i][1] - Q[s][1]), half = Math.abs(dte - ts) / 2, sinc = half < 1e-3 ? 1 : Math.sin(half) / half;
      const ca = Math.atan2(Q[i][1] - Q[s][1], Q[i][0] - Q[s][0]);   // aim the arc so its chord points where the piece goes
      const mid = (ts + dte) / 2, fix = wrap(ca - mid);
      pulses.push({ D: Math.max(0.05, chord / sinc), ts: ts + fix, te: dte + fix });
      if (corner) { const nx = Math.min(n - 1, i + 2); th[i] = Math.atan2(Q[nx][1] - Q[i][1], Q[nx][0] - Q[i][0]); for (let k = i + 1; k < n; k++) th[k] = th[k - 1] + wrap(th[k] - th[k - 1]); }
      s = i; len = 0;
    }
  }
  return pulses;
}

function buildScript(cap, height, gap) {
  const S = cap.strokes.map(a => { const P = []; for (let i = 0; i < a.length; i += 4) P.push([a[i], a[i + 1]]); return P; }).filter(P => P.length > 1);
  const ys = S.flat().map(p => p[1]), k = height / (Math.max(...ys) - Math.min(...ys)), x0 = S[0][0][0], y0 = S[0][0][1];
  return S.map((P, gi) => {
    const Q = P.map(p => [(p[0] - x0) * k + gi * gap, (p[1] - y0) * k]);
    return { x: Q[0][0], y: Q[0][1], pts: Q, pulses: fitPulses(Q) };
  });
}

function makeScript(groups, opt) {
  opt = Object.assign({ jD: 0.07, jA: 0.05, arrive: 1.0, gFree: 0.35, gNear: 0.9, lead: 1.2, minFree: 0, curlMode: false }, opt || {});   // minFree: free pulses the walk must take before each group (room to curl into it)
  const gauss = (r) => { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  function target(g) {   // aim a little before the group's start, back along its first pulse, so the pen arrives heading the right way
    const G = groups[g], p0 = G.pulses[0];
    return [G.x - opt.lead * Math.cos(p0.ts), G.y - opt.lead * Math.sin(p0.ts)];
  }
  function script(st, r) {
    const sc = st.sc || (st.sc = { g: 0, k: 0, phase: 'letter', done: 0 });
    if (sc.phase === 'done') return null;
    if (sc.phase === 'free') {
      const T = target(sc.g), G = groups[sc.g], dT = Math.hypot(T[0] - st.ex, T[1] - st.ey), dS = Math.hypot(G.x - st.ex, G.y - st.ey);
      sc.free = (sc.free || 0) + 1;
      if ((dT > opt.arrive && dS > opt.arrive) || sc.free <= opt.minFree) return null;   // still travelling: the walk moves freely
      sc.phase = 'letter'; sc.k = 0; sc.free = 0;
    }
    const G = groups[sc.g], p = G.pulses[sc.k];
    sc.k++; sc.done++;
    if (sc.k >= G.pulses.length) { sc.g++; sc.phase = sc.g >= groups.length ? 'done' : 'free'; if (sc.phase === 'done') sc.tEnd = st.t0;
      else if (opt.curlMode && st.mode) { st.prev = st.mode; st.mode = 'curl'; st.blend = 1; st.modeT = 0; } }   // leave each group in the walk's curl mood
    const dA = opt.jA * gauss(r);
    return { D: p.D * Math.exp(opt.jD * gauss(r)), ts: p.ts + dA, te: p.te + dA + opt.jA * 0.5 * gauss(r) };
  }
  function sense(st, tau) {   // between groups: pull towards the next group, gently far away, harder close in
    const sc = st.sc; if (!sc || sc.phase !== 'free') return tau;
    if ((sc.free || 0) < opt.minFree) return tau;   // the first free pulses are the walk's own, unpulled
    const T = target(sc.g), d = Math.hypot(T[0] - st.ex, T[1] - st.ey);
    const want = Math.atan2(T[1] - st.ey, T[0] - st.ex), have = st.h + tau / 2, g = opt.gFree + (opt.gNear - opt.gFree) * Math.max(0, Math.min(1, 1 - (d - 1) / 4));
    return tau + g * wrap(want - have) * 2;
  }
  return { script, sense, target };
}

module.exports = { fitPulses, buildScript, makeScript, resample };

// ---- phrases: words far apart, free walk around them (Nov 7: "free stretches outside the word ... words spaced far apart") ----
// A plan is a list of legs: free legs and letter groups (played pulse by pulse). A free leg is a wandering zone: the walk runs
// on its own, only weakly pulled towards a point above or below the line, for at least minPulses (circling a point under a weak
// pull is what makes it loop); after maxPulses the pull ramps up and brings it back. Zones: a lead-in before the first word, one
// between words, optional ones between letter groups, and a tail after the last word. Each letter group is reached through an
// approach leg (aim just before its first stroke, so the pen arrives heading the right way).
// caps: one font capture per word. Returns { plan, guide } in pen units (y grows downwards; letters span roughly -9..+9).
function buildPlan(caps, opt) {
  opt = Object.assign({ height: 14, groupGap: 4, wordGap: 30, excursions: 1, up: 17, zone: 10, seed: 1 }, opt || {});
  let s = opt.seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const plan = [], guide = []; let side = rnd() < 0.5 ? -1 : 1, prevEnd = [0, 0], x = 14;
  const zone = (cx, n) => { plan.push({ type: 'free', T: [cx, side * opt.up], arrive: 4, gFar: 0.12, gNear: 0.3, minPulses: n, maxPulses: n + 10 }); side = -side; };
  zone(6, opt.zone);                                                   // lead-in
  caps.forEach((cap, wi) => {
    const groups = buildScript(cap, opt.height, opt.groupGap);
    const exAt = new Set(); const nEx = Math.min(opt.excursions, Math.max(0, groups.length - 1));
    while (exAt.size < nEx) exAt.add(1 + Math.floor(rnd() * (groups.length - 1)));
    const wx0 = x - groups[0].pts[0][0];
    groups.forEach((G, gi) => {
      const pts = G.pts.map(p => [p[0] + wx0, p[1]]), start = pts[0];
      if (gi === 0 && wi > 0) zone((prevEnd[0] + start[0]) / 2, Math.round(opt.zone * 1.4));   // between words
      if (gi > 0 && exAt.has(gi)) zone((prevEnd[0] + start[0]) / 2, Math.round(opt.zone * 0.7));   // above/below the line inside a word
      const p0 = G.pulses[0];
      plan.push({ type: 'free', T: [start[0] - 1.2 * Math.cos(p0.ts), start[1] - 1.2 * Math.sin(p0.ts)], S: start, arrive: 1.0, gFar: 0.35, gNear: 0.9, minPulses: 0, maxPulses: 12, approach: true });
      plan.push({ type: 'group', pulses: G.pulses, pts });
      pts.forEach((p, i) => guide.push([p[0], p[1], i === 0 ? 1 : 0]));
      prevEnd = pts[pts.length - 1];
    });
    x = prevEnd[0] + opt.wordGap;
  });
  plan.push({ type: 'free', T: [prevEnd[0] + 10, side * opt.up], arrive: 0, gFar: 0.1, gNear: 0.2, minPulses: opt.zone, maxPulses: opt.zone, last: true });   // tail: ends after its pulses
  return { plan, guide };
}

function makePlanScript(plan, opt) {
  opt = Object.assign({ jD: 0.07, jA: 0.05 }, opt || {});
  const gauss = (r) => { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  function script(st, r) {
    const sc = st.sc || (st.sc = { i: 0, k: 0, free: 0, done: 0 });
    while (sc.i < plan.length) {
      const L = plan[sc.i];
      if (L.type === 'free') {
        const dT = Math.hypot(L.T[0] - st.ex, L.T[1] - st.ey), dS = L.S ? Math.hypot(L.S[0] - st.ex, L.S[1] - st.ey) : 1e9;
        const over = sc.free >= (L.maxPulses == null ? 1e9 : L.maxPulses);
        if (!(L.last && over) && ((dT > L.arrive && dS > L.arrive) || sc.free < L.minPulses)) { sc.free++; st.dScale = L.approach ? 1 : (opt.zoneScale || 1); st.pwScale = L.air ? 0.04 : 1; return null; }   // the walk's own pulse (bigger inside zones)
        sc.i++; sc.free = 0; if (L.last) sc.tEnd = st.t0; continue;
      }
      if (sc.k === 0 && L.tag != null) (sc.log = sc.log || []).push([L.tag, st.t0]);   // when each tag starts (for colouring layers)
      st.dScale = 1; st.pwScale = 1; const p = L.pulses[sc.k]; sc.k++; sc.done++;
      if (sc.k >= L.pulses.length) { sc.i++; sc.k = 0; }
      const dA = opt.jA * gauss(r);
      return { D: p.D * Math.exp(opt.jD * gauss(r)), ts: p.ts + dA, te: p.te + dA + opt.jA * 0.5 * gauss(r), pause: p.pause };
    }
    if (sc.tEnd == null) sc.tEnd = st.t0;
    return null;
  }
  function sense(st, tau) {
    const sc = st.sc; if (!sc || sc.i >= plan.length) return tau; const L = plan[sc.i]; if (L.type !== 'free') return tau;
    const d = Math.hypot(L.T[0] - st.ex, L.T[1] - st.ey), want = Math.atan2(L.T[1] - st.ey, L.T[0] - st.ex), have = st.h + tau / 2;
    let g = L.gFar + (L.gNear - L.gFar) * Math.max(0, Math.min(1, 1 - (d - 1) / 5));
    if (L.maxPulses != null && sc.free > L.maxPulses && !L.last) g = Math.min(1.2, g + 0.1 * (sc.free - L.maxPulses));   // overtime: come back
    else if (sc.free < (L.minPulses || 0) && d < 3) g = 0;   // circling the zone: let it loop freely close in
    return tau + g * wrap(want - have) * 2;
  }
  // how far along the plan a particle is, and how far it still has to go on its current free leg (for the draft scoring)
  function progress(st) {
    const sc = st.sc || { i: 0, done: 0 }, L = plan[Math.min(sc.i, plan.length - 1)];
    const dist = sc.i < plan.length && L.type === 'free' ? Math.hypot(L.T[0] - st.ex, L.T[1] - st.ey) : 0;
    return { legs: sc.i, pulses: sc.done, dist, approach: !!(L && L.approach), finished: sc.tEnd != null };
  }
  return { script, sense, progress };
}

module.exports.buildPlan = buildPlan; module.exports.makePlanScript = makePlanScript;
