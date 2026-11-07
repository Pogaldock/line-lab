/* Live steered line: the walk plus SMC steering, with a pluggable scorer. Same code in Node (data, validation) and the browser worker.
   Every H seconds each of P particles is scored; weight *= exp(lambda x score gain); resample when the effective sample size < P/2.
   Old points move into a never-copied history chain, so clones share their ancestor's past. emit() hands out the committed line:
   points older than the oldest point any particle still has live are identical for every survivor, so they are final. */
(function (root) {
  function create(W, R, g, seed, opt) {
    opt = opt || {}; let P = opt.P || 8, nextP = P; const H = opt.H || 1.5, lambda = opt.lambda == null ? 2 : opt.lambda;
    const base = Object.assign({}, W.C.walk, { seed, modes: true, K: 6, modeBias: {} });
    for (const k in g) { if (typeof g[k] !== 'number') continue; if (k.startsWith('m_')) base.modeBias[k.slice(2)] = g[k]; else base[k] = g[k]; }
    base.mu = g.absMu; base.gPeriod = Math.round(g.gPeriod); base.jagLeg = Math.round(g.jagLeg);
    const rng = W.LineGen.mulberry(seed * 7 + 3); let sd = seed * 104729;
    const S0 = W.Steer.create(Object.assign({}, base)); S0.o.arena = 7;
    let parts = []; for (let p = 0; p < P; p++) parts.push({ o: S0.o, r: W.LineGen.mulberry(++sd), st: JSON.parse(JSON.stringify(S0.st)), comps: S0.comps.slice(), pts: S0.pts, x: S0.x, y: S0.y, t: S0.t, choices: [], lw: 0, prev: 0, hist: null, id: p });
    let t1 = 0, nid = P;
    // advance all particles by H seconds; returns the windows to score (caller scores them, then calls tell)
    function ask() {
      t1 += H;
      for (const C of parts) {
        while (C.t < t1) { W.Steer.step(C, W.judge); if (C.comps.length > 400) C.comps = C.comps.slice(-200); if (C.choices.length > 50) C.choices = C.choices.slice(-10); }
        const cut = C.t * 1000 - 12000; let k = 0; while (k < C.pts.length && C.pts[k][3] < cut) k++;
        if (k > 0) { C.hist = { prev: C.hist, pts: C.pts.slice(0, k) }; C.pts = C.pts.slice(k); }
      }
      return parts.map(C => R.windowOf(C.pts));
    }
    function tell(scores) {
      parts.forEach((C, i) => { C.lw += lambda * (scores[i] - C.prev); C.prev = scores[i]; });
      if (lambda <= 0) return false;
      const mx = Math.max(...parts.map(C => C.lw)), w = parts.map(C => Math.exp(C.lw - mx)), sw = w.reduce((a, b) => a + b, 0), ess = sw * sw / w.reduce((a, b) => a + b * b, 0);
      if (ess >= P / 2) return false;
      const u0 = rng() / P, pick = []; let c = w[0] / sw, i = 0;
      for (let k = 0; k < P; k++) { const u = u0 + k / P; while (u > c && i < P - 1) { i++; c += w[i] / sw; } pick.push(i); }
      const old = parts.slice();
      parts = pick.map(i2 => { const A = old[i2]; return { o: A.o, r: W.LineGen.mulberry(++sd), st: JSON.parse(JSON.stringify(A.st)), comps: A.comps.slice(), pts: A.pts, x: A.x, y: A.y, t: A.t, choices: [], lw: 0, prev: A.prev, q: A.q, hist: A.hist, id: nid++ }; });
      return true;
    }
    // the whole line of the particle drawn by weight (for offline use), every 2nd point
    function final() {
      const mx = Math.max(...parts.map(C => C.lw)), w = parts.map(C => Math.exp(C.lw - mx)), sw = w.reduce((a, b) => a + b, 0);
      let u = rng() * sw, i = 0; for (; i < P - 1; i++) { u -= w[i]; if (u <= 0) break; }
      const chunks = []; for (let h = parts[i].hist; h; h = h.prev) chunks.unshift(h.pts);
      return [].concat(...chunks, parts[i].pts);
    }
    // committed points (shared by all survivors) newer than tFrom; for live playback
    function committed(tFrom) {
      // common ancestor history: walk each particle's chain; points are committed once every particle's chain contains the same node
      const sets = parts.map(C => { const s = new Set(); for (let h = C.hist; h; h = h.prev) s.add(h); return s; });
      let h = parts[0].hist; while (h && !sets.every(s => s.has(h))) h = h.prev;
      const chunks = []; for (; h; h = h.prev) { if (h.pts[h.pts.length - 1][3] <= tFrom) break; chunks.unshift(h.pts); }
      return [].concat(...chunks).filter(p => p[3] > tFrom);
    }
    // live use: every few checks, draw one survivor by weight, hand out its new points, and restart all particles from it
    let tCommit = -1;
    function drawIndex() {
      const mx = Math.max(...parts.map(C => C.lw)), w = parts.map(C => Math.exp(C.lw - mx)), sw = w.reduce((a, b) => a + b, 0);
      let u = rng() * sw, i = 0; for (; i < parts.length - 1; i++) { u -= w[i]; if (u <= 0) break; } return i;
    }
    function commit() { return commitFrom(parts[drawIndex()]); }
    function commitFrom(A) {
      const chunks = []; for (let h = A.hist; h; h = h.prev) { chunks.unshift(h.pts); if (h.pts[0][3] <= tCommit) break; }
      const out = [].concat(...chunks, A.pts).filter(p => p[3] > tCommit); tCommit = out.length ? out[out.length - 1][3] : tCommit;
      P = nextP; parts = Array.from({ length: P }, () => ({ o: A.o, r: W.LineGen.mulberry(++sd), st: JSON.parse(JSON.stringify(A.st)), comps: A.comps.slice(), pts: A.pts, x: A.x, y: A.y, t: A.t, choices: [], lw: 0, prev: A.prev, hist: null, id: nid++ }));
      return out;
    }
    // ---- best only: redraw a segment from the same start up to K times, keep the attempt the judges like most ----
    // scoreFn(windows) -> [[A, B], ...] (big-judge units). Steering uses min(A, B) as always; the segment's quality is the
    // calibrated mean z-score of the two judges on the kept particle's last window (z >= 1.5 ~ your top 5%, ~85-89% rated good).
    async function segment(scoreFn, o) {
      o = o || {}; const checks = o.checks || 6, K = o.K || 1, thr = o.thr == null ? -Infinity : o.thr, cal = o.cal;
      const zq = (ab) => cal ? ((ab[0] - cal.mA) / cal.sA + (ab[1] - cal.mB) / cal.sB) / 2 : Math.min(ab[0], ab[1]);
      const snap = { parts: parts.map(C => Object.assign({}, C)), t1, tCommit }; let best = null, att = 0;
      for (let a = 0; a < K; a++) {
        if (a > 0) { parts = snap.parts.map(C => Object.assign({}, C, { r: W.LineGen.mulberry(++sd) })); t1 = snap.t1; tCommit = snap.tCommit; }
        for (let k = 0; k < checks; k++) { const w = ask(), ab = await scoreFn(w); parts.forEach((C, i) => { C.q = zq(ab[i]); }); tell(ab.map(v => Math.min(v[0], v[1]))); }
        att++; const i = drawIndex(), C = parts[i];
        if (!best || C.q > best.q) best = { q: C.q, i, parts, t1 };
        if (C.q >= thr) break;
      }
      parts = best.parts; t1 = best.t1; return { pts: commitFrom(parts[best.i]), q: best.q, attempts: att };
    }
    function setP(n) { nextP = Math.max(2, Math.min(8, n)); }   // takes effect at the next commit, when all particles restart from one
    return { ask, tell, final, committed, commit, segment, setP, get P() { return P; }, get t() { return t1; }, get parts() { return parts; } };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LiveSteer = api;
})(this);
