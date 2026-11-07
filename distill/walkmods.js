// walk modules copied from the talk page build (same code the feed uses)
module.exports = (function (require, module) {
var self=globalThis;var window=self;
/* Line generator built on the sigma-lognormal model of handwriting (Plamondon's Kinematic Theory).
   A line is a chain of overlapping movement pulses. Each pulse has a lognormal speed profile and
   turns smoothly from a start angle to an end angle. Pulse rate, overlap, turning, roughness,
   stretch and pressure swell are the "taste" parameters; their starting ranges come from your data. */
(function (root) {
  var PARAMS = [
    // name, mean, sd, min, max, log-scaled?
    ['dur',        Math.log(0.9), 0.5,  Math.log(0.25), Math.log(4.0), true],   // seconds of movement
    ['rate',       6.0,  2.0,  2.0,  14.0, false],  // movement pulses per second (your speed bursts ~7/s)
    ['span',       2.2,  0.6,  0.8,  4.0,  false],  // how much pulses overlap: low = staccato, high = flowing
    ['sigma',      0.30, 0.08, 0.12, 0.55, false],  // shape of each pulse's speed curve (lognormal spread)
    ['turnBias',   0.0,  0.6, -2.2,  2.2,  false],  // steady turning per pulse: loops, and their direction
    ['turnSpread', 0.9,  0.4,  0.05, 2.6,  false],  // how much each pulse's turn varies: calm vs wild curves
    ['dirChange',  0.3,  0.3,  0.0,  1.8,  false],  // jump in direction between pulses: smooth vs angular
    ['ampVar',     0.35, 0.2,  0.0,  1.0,  false],  // how unequal the pulse sizes are
    ['axis',       1.75, 0.6, -1.0,  4.5,  false],  // preferred direction (radians; ~100 deg in your data)
    ['elong',      Math.log(2.0), 0.5, 0.0, Math.log(8), true], // stretch along that direction
    ['pStart',     0.44, 0.14, 0.05, 0.95, false],  // pressure at the start
    ['pMid',       0.59, 0.16, 0.05, 1.0,  false],  // pressure in the middle
    ['pEnd',       0.44, 0.15, 0.05, 0.95, false],  // pressure at the end
    ['pJitter',    0.032, 0.016, 0.0, 0.12, false], // pressure wobble
    ['weight',     1.0,  0.35, 0.3,  2.6,  false],  // ink thickness
    ['pDown',      0.0,  0.5, -1.0,  1.0,  false],  // brush logic: + heavier on downstrokes, - heavier on upstrokes
    ['pTurn',      0.0,  0.5, -1.0,  1.0,  false]   // brush logic: + press into turns, - press on the straights
  ];
  var NAMES = PARAMS.map(function (p) { return p[0]; });

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function erf(x) { // Abramowitz-Stegun 7.1.26
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  // z-scores (one per parameter) -> real parameter values, clamped to their range
  function fromZ(z) {
    var P = {};
    PARAMS.forEach(function (d, i) {
      var v = d[1] + d[2] * (z[i] || 0);
      v = Math.max(d[3], Math.min(d[4], v));
      P[d[0]] = d[5] ? Math.exp(v) : v;
    });
    return P;
  }

  function makeLine(P, seed) {
    var r = mulberry(seed);
    var n = Math.max(2, Math.min(30, Math.round(P.dur * P.rate)));
    var spacing = 1 / P.rate;
    var comps = [], t0 = 0, h = P.axis + gauss(r) * 0.6;
    for (var i = 0; i < n; i++) {
      var sg = P.sigma * (0.85 + 0.3 * r());
      var mu = Math.log(spacing * P.span * 0.5) + sg * sg;          // places each pulse's speed peak
      var D = Math.exp(gauss(r) * P.ampVar);
      var dth = P.turnBias + gauss(r) * P.turnSpread;
      comps.push({ t0: t0, mu: mu, sg: sg, D: D, ts: h, te: h + dth });
      h = h + dth + gauss(r) * P.dirChange;
      t0 += spacing * (0.7 + 0.6 * r());
    }
    var last = comps[comps.length - 1];
    var tEnd = last.t0 + Math.exp(last.mu + 2.5 * last.sg);
    var dt = 1 / 120, x = 0, y = 0, pts = [];
    for (var t = 0; t <= tEnd; t += dt) {
      var vx = 0, vy = 0;
      for (var k = 0; k < comps.length; k++) {
        var c = comps[k], tau = t - c.t0;
        if (tau <= 0) continue;
        var lv = (Math.log(tau) - c.mu) / c.sg;
        if (lv > 4.5) continue;
        var sp = c.D / (c.sg * Math.sqrt(2 * Math.PI) * tau) * Math.exp(-lv * lv / 2);
        var ph = c.ts + (c.te - c.ts) * 0.5 * (1 + erf(lv / Math.SQRT2));
        vx += sp * Math.cos(ph); vy += sp * Math.sin(ph);
      }
      x += vx * dt; y += vy * dt;
      pts.push([x, y, 0, t * 1000]);
    }
    // stretch along the preferred axis
    var ca = Math.cos(P.axis), sa = Math.sin(P.axis), e = Math.sqrt(P.elong);
    pts.forEach(function (p) {
      var u = p[0] * ca + p[1] * sa, w = -p[0] * sa + p[1] * ca;
      u *= e; w /= e;
      p[0] = u * ca - w * sa; p[1] = u * sa + w * ca;
    });
    // pressure: start -> middle -> end swell, plus smooth wobble
    var m = pts.length, wob = 0, wv = 0;
    for (var j = 0; j < m; j++) {
      var q = j / Math.max(1, m - 1);
      var base = q < 0.5 ? P.pStart + (P.pMid - P.pStart) * (0.5 - 0.5 * Math.cos(Math.PI * q * 2))
                         : P.pMid + (P.pEnd - P.pMid) * (0.5 - 0.5 * Math.cos(Math.PI * (q - 0.5) * 2));
      wv = wv * 0.9 + gauss(r) * 0.1; wob = wob * 0.85 + wv;
      pts[j][2] = base + wob * P.pJitter * 3;
    }
    // brush logic: pressure tied to stroke direction and to turning (zero by default, so older lines are unchanged)
    if (P.pDown || P.pTurn) {
      var turn = [], mt = 0;
      for (var b = 0; b < m; b++) {
        var A = pts[Math.max(0, b - 3)], B = pts[Math.min(m - 1, b + 3)], Cc = pts[Math.min(m - 1, b + 6)];
        var hx = B[0] - A[0], hy = B[1] - A[1], hl = Math.hypot(hx, hy) || 1;
        var a1 = Math.atan2(hy, hx), a2 = Math.atan2(Cc[1] - B[1], Cc[0] - B[0]), da = Math.abs(((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        turn.push(da); mt += da;
        pts[b][4] = hy / hl;                            // +1 = moving down the page
      }
      mt = mt / m || 1;
      for (var b2 = 0; b2 < m; b2++) {
        pts[b2][2] += 0.22 * P.pDown * pts[b2][4] + 0.22 * P.pTurn * Math.max(-1, Math.min(1, (turn[b2] - mt) / mt));
        pts[b2].length = 4;
      }
    }
    for (var c3 = 0; c3 < m; c3++) pts[c3][2] = Math.max(0.02, Math.min(1, pts[c3][2]));
    // fit into a unit box, centred
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    pts.forEach(function (p) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
    var sc = 1 / Math.max(1e-6, mxx - mnx, mxy - mny), cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    pts.forEach(function (p) { p[0] = (p[0] - cx) * sc; p[1] = (p[1] - cy) * sc; });
    return pts;
  }


  /* Mathematical mutations, applied to a finished line. Each keeps it one continuous, smooth stroke.
     m = { op, s (strength 0..1, 'a touch' is ~0.2-0.5), r (seed for the op's own choices) } */
  var OPS = ['mirror', 'rotate', 'warp', 'ripple', 'twist', 'fourier'];
  function refit(P) {
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    P.forEach(function (p) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
    var sc = 1 / Math.max(1e-6, mxx - mnx, mxy - mny), cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    P.forEach(function (p) { p[0] = (p[0] - cx) * sc; p[1] = (p[1] - cy) * sc; });
    return P;
  }
  function mutate(pts, m) {
    if (!m || !m.op) return pts;
    var r = mulberry(m.r || 1), s = Math.max(0, Math.min(1, m.s)), n = pts.length, P = pts.map(function (p) { return p.slice(0, 4); }), T = P[n - 1][3];
    if (m.op === 'mirror' || m.op === 'rotate') {
      // continue the stroke from its end as its own reflection (mirror) or half-turn (point symmetry); the joint stays tangent-smooth
      var E = P[n - 1], k = Math.max(2, Math.round(n * 0.04)), tx = E[0] - P[n - 1 - k][0], ty = E[1] - P[n - 1 - k][1], tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      var start = Math.floor((1 - (0.25 + 0.75 * s)) * (n - 1));
      for (var i = n - 2; i >= start; i--) {
        var q = P[i], nx, ny;
        if (m.op === 'mirror') { var d = (q[0] - E[0]) * tx + (q[1] - E[1]) * ty; nx = q[0] - 2 * d * tx; ny = q[1] - 2 * d * ty; }
        else { nx = 2 * E[0] - q[0]; ny = 2 * E[1] - q[1]; }
        P.push([nx, ny, q[2], 2 * T - q[3]]);
      }
      var app = P.length - n;   // taper the new end so it finishes soft, like a drawn end
      for (var e = 0; e < app; e++) { var fromEnd = (app - 1 - e) / Math.max(1, app * 0.22); P[n + e][2] *= 0.3 + 0.7 * Math.min(1, fromEnd); }
    } else if (m.op === 'warp') {
      // conformal map z -> z + a z^2 + b z^3 (complex plane): bends the line but preserves every angle
      var ang = r() * 2 * Math.PI, a = 0.55 * s, b = 0.4 * s * (r() - 0.5), ar = a * Math.cos(ang), ai = a * Math.sin(ang);
      P.forEach(function (p) { var x = p[0], y = p[1], x2 = x * x - y * y, y2 = 2 * x * y, x3 = x2 * x - y2 * y, y3 = x2 * y + y2 * x;
        p[0] = x + ar * x2 - ai * y2 + b * x3; p[1] = y + ar * y2 + ai * x2 + b * y3; });
    } else if (m.op === 'ripple') {
      // harmonic wobble added to the heading: k waves along the length, zero at the start
      var kw = [2, 3, 5][Math.floor(r() * 3)], amp = 0.55 * s, ph = r() * 2 * Math.PI, L = 0, sl = [0];
      for (var i2 = 1; i2 < n; i2++) { L += Math.hypot(P[i2][0] - P[i2 - 1][0], P[i2][1] - P[i2 - 1][1]); sl.push(L); }
      var out = [P[0].slice()];
      for (var j = 1; j < n; j++) {
        var dx = P[j][0] - P[j - 1][0], dy = P[j][1] - P[j - 1][1], seg = Math.hypot(dx, dy);
        var hd = Math.atan2(dy, dx) + amp * (Math.sin(2 * Math.PI * kw * sl[j] / (L || 1) + ph) - Math.sin(ph)), o = out[j - 1];
        out.push([o[0] + seg * Math.cos(hd), o[1] + seg * Math.sin(hd), P[j][2], P[j][3]]);
      }
      P = out;
    } else if (m.op === 'twist') {
      // spiral twist: rotate each point by an angle proportional to its distance from the centre
      var tw = (r() < 0.5 ? -1 : 1) * 2.4 * s;
      P.forEach(function (p) { var th = tw * Math.hypot(p[0], p[1]), c = Math.cos(th), sn = Math.sin(th), x = p[0], y = p[1]; p[0] = x * c - y * sn; p[1] = x * sn + y * c; });
    } else if (m.op === 'fourier') {
      // pull toward its own simplest form: run the path forward and back (so it is periodic), keep the lowest K harmonics, blend
      var N2 = 2 * n - 2, re = [], im = [];
      for (var i3 = 0; i3 < N2; i3++) { var qq = i3 < n ? P[i3] : P[N2 - i3]; re.push(qq[0]); im.push(qq[1]); }
      var K = Math.max(4, Math.round(11 - 7 * s)), C = [];
      for (var kk = -K; kk <= K; kk++) { var cr = 0, ci = 0; for (var i4 = 0; i4 < N2; i4++) { var a1 = -2 * Math.PI * kk * i4 / N2, ca = Math.cos(a1), sa = Math.sin(a1); cr += re[i4] * ca - im[i4] * sa; ci += re[i4] * sa + im[i4] * ca; } C.push([kk, cr / N2, ci / N2]); }
      var bl0 = 0.25 + 0.6 * s;
      for (var i5 = 0; i5 < n; i5++) {
        var u5 = i5 / (n - 1), win = Math.min(1, Math.min(u5, 1 - u5) / 0.22), bl = bl0 * win * win * (3 - 2 * win); /* ends stay as drawn, the middle is idealised */ var x5 = 0, y5 = 0; C.forEach(function (c) { var a2 = 2 * Math.PI * c[0] * i5 / N2, ca2 = Math.cos(a2), sa2 = Math.sin(a2); x5 += c[1] * ca2 - c[2] * sa2; y5 += c[1] * sa2 + c[2] * ca2; }); P[i5][0] += bl * (x5 - P[i5][0]); P[i5][1] += bl * (y5 - P[i5][1]); }
    }
    return refit(P);
  }
  var api = { PARAMS: PARAMS, NAMES: NAMES, fromZ: fromZ, makeLine: makeLine, mulberry: mulberry, gauss: gauss, OPS: OPS, mutate: mutate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LineGen = api;
})(this);

/* Endless path by model-predictive steering (receding horizon).
   A momentum walk grows chunk by chunk. At each step K candidate continuations are drawn from the walk's own dynamics
   (so every join is smooth), each is scored by a judge on the trailing window plus path terms, one is chosen at random
   weighted toward the best (temperature = variety), and only that chunk is committed. Repeat forever.
   judge(windowPts, weight) -> logit of "keep" for that window; supplied by the page (the live model) or by node. */
(function (root) {
  var G = (typeof require !== 'undefined') ? require('./gen.js') : root.LineGen;
  function erf(x) { var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
  /* Behaviour modes (you, Nov 4: "large variability in speed and behaviour, alternating between different speeds, movements
     and patterns, remaining smooth in the transitions"). Each mode scales the walk's own settings; a switch blends in over a few
     pulses, so the line never jerks. sweep = long fast gentle arcs; curl = a few roomy loops; wave = S-shapes; glide = slow, small,
     careful; corner = one sharp turn into a long tapering sweep. */
  var MODES = {
    sweep: { D: 1.7, rate: 0.8, tau: 0.25, sigma: 0.6, gAmp: 0.5, jag: 0 },
    curl:  { D: 1.05, rate: 1.0, tau: 1.0, sigma: 0.8, gAmp: 0.6, jag: 0, curl: 0.75 },
    wave:  { D: 1.2, rate: 1.0, tau: 0.55, sigma: 0.7, gAmp: 1.6, gPeriod: 6, gFlip: 1, jag: 0 },
    glide: { D: 0.6, rate: 0.75, tau: 0.45, sigma: 0.5, gAmp: 0.5, jag: 0 },
    corner:{ D: 1.3, rate: 0.9, tau: 0.35, sigma: 0.6, gAmp: 0.4, jag: 1 }
  };
  var MODE_NAMES = Object.keys(MODES);
  function create(o) {
    o = Object.assign({ rate: 8, span: 2.8, pulseSigma: 0.3, rho: 0.75, sigma: 0.3, pull: 0.3, keepCurl: 0.85, beta: 0.25, speedRho: 0.6, speedSigma: 0.25, mu: 0.4,
      gAmp: 0.45, gPeriod: 12, gFlip: 0.65, jagRate: 0.03, jagAngle: 2.2, jagLeg: 6, jagTaper: 0.8, pMid: 0.65, weight: 1, chunk: 4, look: 4, K: 16, temp: 0.25, window: 1200, seed: 1 }, o || {});
    if (o.modes == null) o.modes = true;   /* modes off = one steady behaviour throughout (the comparison for your variety rule) */
    var r = G.mulberry(o.seed), st = { mode: o.modes ? (o.startMode || 'sweep') : null, prev: o.modes ? 'sweep' : null, blend: 1, modeT: 0, h: r() * 6.283, tau: o.mu + G.gauss(r) * 0.4, dtau: 0, lD: 0, t0: 0, gpos: 0, glen: o.gPeriod, gsign: r() < 0.5 ? -1 : 1, legLeft: 0, legN: 0, sweep: 0, gap: 0, jSign: 1 };
    if (o.arena == null) o.arena = 7;   /* the page: a disc the path should fill, in pulse lengths (one pulse moves about one unit) */
    return { o: o, r: r, st: st, comps: [], pts: [[0, 0, 0, 0]], x: 0, y: 0, t: 0, choices: [] };
  }
  /* one pulse from the walk's dynamics; mutates a copy of the state */
  function mval(st, k, base){   /* a mode's setting, blended from the previous mode while a switch settles */
    if (!st.mode || !MODES[st.mode]) return base;
    var a = MODES[st.mode][k], b = MODES[st.prev] ? MODES[st.prev][k] : undefined, f = st.blend == null ? 1 : st.blend;
    if (a === undefined) a = (k === 'gAmp' || k === 'gPeriod' || k === 'gFlip' || k === 'curl') ? base : 1;
    if (b === undefined) b = (k === 'gAmp' || k === 'gPeriod' || k === 'gFlip' || k === 'curl') ? base : 1;
    return b + (a - b) * f;
  }
  function pulse(o, st, r, comps) {
    if (st.blend < 1) st.blend = Math.min(1, st.blend + 0.34);
    var mD = mval(st, 'D', 1), mRate = mval(st, 'rate', 1), mTau = mval(st, 'tau', 1), mSig = mval(st, 'sigma', 1);
    var gA = st.mode ? o.gAmp * mval(st, 'gAmp', 1) : o.gAmp, gP = MODES[st.mode] && MODES[st.mode].gPeriod ? MODES[st.mode].gPeriod : o.gPeriod, gF = MODES[st.mode] && MODES[st.mode].gFlip != null ? MODES[st.mode].gFlip : o.gFlip;
    var muC = MODES[st.mode] && MODES[st.mode].curl ? (o.mu >= 0 ? 1 : -1) * MODES[st.mode].curl : o.mu;
    var spacing = 1 / (o.rate * mRate), sg = o.pulseSigma * (0.9 + 0.2 * r()), mu = Math.log(spacing * o.span * 0.5) + sg * sg;
    var gturn = gA * st.gsign * Math.pow(Math.sin(Math.PI * st.gpos / st.glen), 2);
    st.gpos++; if (st.gpos >= st.glen) { st.gpos = 0; st.glen = gP * (0.7 + 0.6 * r()); if (r() < gF) st.gsign = -st.gsign; }
    /* script (Nov 7, writing words): may hand the walk its next pulse (length D, direction from ts to te), e.g. a letter
       written in the walk's own pulses. Timing, overlap and pressure stay the walk's; returning nothing lets the walk run free. */
    if (o.script && st.ex != null) { var sp = o.script(st, r); if (sp) {
      comps.push({ t0: st.t0, mu: mu, sg: sg, D: sp.D, ts: sp.ts, te: sp.te, pw: sp.pw == null ? 1 : sp.pw });
      st.ex += sp.D * Math.cos((sp.ts + sp.te) / 2); st.ey += sp.D * Math.sin((sp.ts + sp.te) / 2);
      st.h = sp.te; st.tau = Math.max(-1.6, Math.min(1.6, sp.te - sp.ts)); st.legLeft = 0; st.t0 += spacing * Math.sqrt(sp.D) * (0.85 + 0.3 * r()); return; } }
    if (st.legLeft > 0) {
      var qL = (st.legN - st.legLeft) / Math.max(1, st.legN - 1), D0 = Math.exp(st.lD) * 1.35 * mD * (st.dScale || 1);
      comps.push({ t0: st.t0, mu: mu, sg: sg, D: D0, ts: st.h, te: st.h + st.sweep, pw: 1.3 - qL * (0.3 + 0.95 * o.jagTaper) });
      if (st.ex != null) { st.ex += D0 * Math.cos(st.h + st.sweep / 2); st.ey += D0 * Math.sin(st.h + st.sweep / 2); }
      st.h += st.sweep; st.t0 += spacing * Math.sqrt(D0) * (0.85 + 0.3 * r()); st.legLeft--; if (!st.legLeft) st.gap = Math.max(2, Math.round(o.jagLeg * 0.8)); return;
    }
    if (st.gap > 0) st.gap--;
    else if ((MODES[st.mode] && MODES[st.mode].jag && st.blend >= 1 && !st.cornered) || r() < o.jagRate) { st.cornered = true; st.jSign = -st.jSign; st.h += st.jSign * o.jagAngle * (0.9 + 0.2 * r()); st.t0 += spacing * o.span * 0.5 * 1.3; st.legN = st.legLeft = o.jagLeg; st.sweep = -st.jSign * (0.05 + 0.1 * r()); return pulse(o, st, r, comps); }
    st.dtau = o.rho * st.dtau + o.sigma * mSig * Math.sqrt(1 - o.rho * o.rho) * G.gauss(r);
    var nt = st.tau + st.dtau - o.pull * (st.tau - muC);
    if (o.keepCurl && Math.sign(nt) !== Math.sign(st.tau) && Math.abs(st.tau) > 0.05) nt = st.tau + (nt - st.tau) * (1 - o.keepCurl);
    st.tau = Math.max(-1.6, Math.min(1.6, nt));
    var tauAll = Math.max(-1.6, Math.min(1.6, st.tau * mTau + gturn));
    /* senses (optional, Nov 4 night): the walk proposes a turn, the senses may bend or override it (see senses.js) */
    if (o.sense && st.ex != null) tauAll = Math.max(-1.6, Math.min(1.6, o.sense(st, tauAll)));
    st.lD = o.speedRho * st.lD + o.speedSigma * Math.sqrt(1 - o.speedRho * o.speedRho) * G.gauss(r);
    var D = Math.exp(st.lD) * mD * Math.max(0.55, Math.pow(1 + Math.abs(tauAll), -o.beta * 3)) * (st.dScale || 1);   /* dScale: draw the free walk bigger (same shape, larger scale) */
    var pwG = st.gap > 0 ? 0.35 + 0.65 * (1 - st.gap / Math.max(2, Math.round(o.jagLeg * 0.8))) : 1;
    comps.push({ t0: st.t0, mu: mu, sg: sg, D: D, ts: st.h, te: st.h + tauAll, pw: pwG });
    if (st.ex != null) { st.ex += D * Math.cos(st.h + tauAll / 2); st.ey += D * Math.sin(st.h + tauAll / 2); st.turns = (st.turns || []).concat([tauAll]).slice(-12); }
    st.h += tauAll; st.t0 += spacing * Math.sqrt(D) * (0.85 + 0.3 * r());
  }
  /* integrate the path from time t to t1 (seconds) with the given pulses; returns new points (x, y, pressure, ms) */
  function integrate(comps, x, y, t, t1, o) {
    var out = [], dt = 1 / 120, act = comps.filter(function (c) { return c.t0 + Math.exp(c.mu + 2.5 * c.sg) > t; });
    for (var tt = t + dt; tt <= t1 + 1e-9; tt += dt) {
      var vx = 0, vy = 0, w2 = 0, pw = 0;
      for (var j = 0; j < act.length; j++) {
        var c = act[j], tau = tt - c.t0; if (tau <= 0) continue; var lv = (Math.log(tau) - c.mu) / c.sg; if (lv > 4.5) continue;
        var sp = c.D / (c.sg * Math.sqrt(2 * Math.PI) * tau) * Math.exp(-lv * lv / 2), a = c.ts + (c.te - c.ts) * 0.5 * (1 + erf(lv / Math.SQRT2));
        vx += sp * Math.cos(a); vy += sp * Math.sin(a); w2 += sp * sp; pw += sp * sp * (c.pw == null ? 1 : c.pw);
      }
      x += vx * dt; y += vy * dt; out.push([x, y, Math.max(0.03, Math.min(1, o.pMid * (w2 > 0 ? pw / w2 : 1))), tt * 1000]);
    }
    return out;
  }
  function trailing(pts, ms) { var T = pts[pts.length - 1][3], i = pts.length - 1; while (i > 0 && pts[i - 1][3] >= T - ms) i--; return pts.slice(i); }
  /* path terms: how close the new stretch comes to older parts of the path, relative to the recent scale of the drawing */
  function crowding(pts, fresh) {
    var T = fresh[0][3], old = []; for (var i = 0; i < pts.length; i += 3) if (pts[i][3] < T - 1500) old.push(pts[i]);
    if (!old.length) return 0;
    var rec = trailing(pts, 3000), mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    rec.forEach(function (p) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
    var ext = Math.max(1e-6, mxx - mnx, mxy - mny), pen = 0, n = 0;
    for (var a = 0; a < fresh.length; a += 4) { var d = Infinity; for (var b = 0; b < old.length; b++) d = Math.min(d, Math.hypot(fresh[a][0] - old[b][0], fresh[a][1] - old[b][1])); pen += Math.max(0, 1 - d / (0.12 * ext)); n++; }
    return pen / Math.max(1, n);
  }
  /* your rules for the whole path (Nov 4): no loops piled in one area, none too tight, no recrossing clutter; fill the space. */
  function pathTerms(pts, fresh, o) {
    var T = fresh[0][3], old = []; for (var i = 0; i < pts.length; i += 2) if (pts[i][3] < T - 800) old.push(pts[i]);
    var R = o.arena, rr = 0.09 * R, dens = 0, gapS = 0, n = 0, out = 0;
    for (var a = 0; a < fresh.length; a += 3) {
      var p = fresh[a], cnt = 0, dmin = Infinity;
      for (var b = 0; b < old.length; b++) { var d = Math.hypot(p[0] - old[b][0], p[1] - old[b][1]); if (d < rr) cnt++; if (d < dmin) dmin = d; }
      dens += Math.min(1, cnt / 5); gapS += Math.min(1, (dmin === Infinity ? 0.25 * R : dmin) / (0.25 * R)); n++;
      var rad = Math.hypot(p[0] / (o.arenaAspect || 1), p[1]) / R;   /* arenaAspect: a wider page (Nov 7, words in the walk) */ if (rad > 1) out += (rad - 1) * (rad - 1);
    }
    /* recrossings: the new stretch cutting through older line */
    var cross = 0, oldSeg = []; for (var k = 0; k < pts.length - 2; k += 2) if (pts[k + 2][3] < T - 500) oldSeg.push([pts[k], pts[k + 2]]);
    for (var a2 = 0; a2 + 3 < fresh.length; a2 += 3) { var P1 = fresh[a2], P2 = fresh[a2 + 3];
      for (var s2 = 0; s2 < oldSeg.length; s2++) { var Q1 = oldSeg[s2][0], Q2 = oldSeg[s2][1];
        var d1 = (P2[0] - P1[0]) * (Q1[1] - P1[1]) - (P2[1] - P1[1]) * (Q1[0] - P1[0]), d2 = (P2[0] - P1[0]) * (Q2[1] - P1[1]) - (P2[1] - P1[1]) * (Q2[0] - P1[0]);
        var d3 = (Q2[0] - Q1[0]) * (P1[1] - Q1[1]) - (Q2[1] - Q1[1]) * (P1[0] - Q1[0]), d4 = (Q2[0] - Q1[0]) * (P2[1] - Q1[1]) - (Q2[1] - Q1[1]) * (P2[0] - Q1[0]);
        if (d1 * d2 < 0 && d3 * d4 < 0) cross++; } }
    /* tight loops: a full turn completed within a short length of line */
    var tight = 0, th = [], len = [0];
    for (var q = 1; q < fresh.length; q++) { th.push(Math.atan2(fresh[q][1] - fresh[q - 1][1], fresh[q][0] - fresh[q - 1][0])); len.push(len[q - 1] + Math.hypot(fresh[q][0] - fresh[q - 1][0], fresh[q][1] - fresh[q - 1][1])); }
    for (var q2 = 1; q2 < th.length; q2++) { while (th[q2] - th[q2 - 1] > Math.PI) th[q2] -= 2 * Math.PI; while (th[q2] - th[q2 - 1] < -Math.PI) th[q2] += 2 * Math.PI; }
    for (var a3 = 0, b3 = 0; a3 < th.length; a3++) { while (b3 < th.length - 1 && len[b3 + 1] - len[a3 + 1] < 0.35 * R) b3++; if (Math.abs(th[b3] - th[a3]) > 5.5) { tight = 1; break; } }
    return { dens: dens / Math.max(1, n), space: gapS / Math.max(1, n), out: out / Math.max(1, n), cross: cross, tight: tight };
  }
  /* Curls that overlap (talk sessions, Nov 4-5: "the curl overlap behaviour seems to be the only real problem").
     Finds loops (the line crossing itself) in the recent stretch plus this candidate, and scores how much ink from earlier
     (1.5 to 7 s old, the part still visible) lies inside or on each loop, plus a cost when two loops come close together. 0 = clean. */
  function loopClash(pts, fresh) {
    var T = fresh[0][3], rec = []; for (var i = pts.length - 1; i >= 0 && pts[i][3] >= T - 1200; i -= 2) rec.unshift(pts[i]);
    var w = rec.concat(fresh.filter(function (p, k) { return k % 2 === 0; })); if (w.length < 8) return 0;
    var loops = [];
    for (var a = 0; a < w.length - 3; a++) for (var b = a + 3; b < w.length - 1; b++) {
      var P1 = w[a], P2 = w[a + 1], Q1 = w[b], Q2 = w[b + 1];
      var d1 = (P2[0] - P1[0]) * (Q1[1] - P1[1]) - (P2[1] - P1[1]) * (Q1[0] - P1[0]), d2 = (P2[0] - P1[0]) * (Q2[1] - P1[1]) - (P2[1] - P1[1]) * (Q2[0] - P1[0]);
      var d3 = (Q2[0] - Q1[0]) * (P1[1] - Q1[1]) - (Q2[1] - Q1[1]) * (P1[0] - Q1[0]), d4 = (Q2[0] - Q1[0]) * (P2[1] - Q1[1]) - (Q2[1] - Q1[1]) * (P2[0] - Q1[0]);
      if (d1 * d2 < 0 && d3 * d4 < 0) { var cx = 0, cy = 0, n = 0; for (var k = a; k <= b; k++) { cx += w[k][0]; cy += w[k][1]; n++; } cx /= n; cy /= n; var r = 0; for (var k2 = a; k2 <= b; k2++) r = Math.max(r, Math.hypot(w[k2][0] - cx, w[k2][1] - cy)); loops.push([cx, cy, r]); a = b; break; }
    }
    if (!loops.length) return 0;
    var pen = 0, old = []; for (var j = 0; j < pts.length; j += 3) { var age = T - pts[j][3]; if (age > 1500 && age < 7000) old.push([pts[j][0], pts[j][1], Math.min(1, (7000 - age) / 2500)]); }
    loops.forEach(function (L) { var inside = 0; old.forEach(function (q) { if (Math.hypot(q[0] - L[0], q[1] - L[1]) < L[2] * 1.25) inside += q[2]; }); pen += Math.min(1, inside / 8); });
    for (var u = 0; u < loops.length; u++) for (var v = u + 1; v < loops.length; v++) if (Math.hypot(loops[u][0] - loops[v][0], loops[u][1] - loops[v][1]) < (loops[u][2] + loops[v][2]) * 1.5) pen += 1;
    return pen;
  }
  function normWin(seg) {
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, t0 = seg[0][3];
    seg.forEach(function (p) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
    var sc = 1 / Math.max(1e-6, mxx - mnx, mxy - mny), cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    return seg.map(function (p) { return [(p[0] - cx) * sc, (p[1] - cy) * sc, p[2], p[3] - t0]; });
  }
  /* grow the path by one chunk; judge(winPts, weight) -> logit; lambda weights crowding */
  function step(S, judge, lambda) {
    var o = S.o, best = [], lam = lambda == null ? 2.5 : lambda;
    if (o.sense) {   /* where the pen will be once the pulses already scheduled have run out: the senses look from there */
      var ex = S.x, ey = S.y; S.comps.forEach(function (c) { var tau = S.t - c.t0, done = tau <= 0 ? 0 : 0.5 * (1 + erf((Math.log(tau) - c.mu) / (c.sg * Math.SQRT2))), a = (c.ts + c.te) / 2; ex += c.D * (1 - done) * Math.cos(a); ey += c.D * (1 - done) * Math.sin(a); });
      S.st.ex = ex; S.st.ey = ey; o.senseS = S;
    }
    for (var k = 0; k < o.K; k++) {
      var st = JSON.parse(JSON.stringify(S.st)), comps = S.comps.slice(), n0 = comps.length;
      if (o.modes && k % 2 === 1){ var others = MODE_NAMES.filter(function (m) { return m !== st.mode; }); st.prev = st.mode; st.mode = others[Math.floor(S.r() * others.length)]; st.blend = 0; st.modeT = 0; st.cornered = false; }
      st.modeT += o.chunk;
      for (var q = 0; q < o.chunk; q++) pulse(o, st, S.r, comps);
      var tc = comps[comps.length - 1].t0, nc = comps.length, fresh = integrate(comps, S.x, S.y, S.t, tc, o);
      if (!fresh.length) continue;
      /* look ahead: where does this continuation lead? a few more pulses are drawn and judged, but only the chunk is kept */
      var stL = JSON.parse(JSON.stringify(st)), compsL = comps.slice(); for (var q2 = 0; q2 < (o.look || 0); q2++) pulse(o, stL, S.r, compsL);
      var ahead = o.look ? integrate(compsL, fresh[fresh.length - 1][0], fresh[fresh.length - 1][1], tc, compsL[compsL.length - 1].t0, o) : [];
      var all = S.pts.concat(fresh, ahead), win = normWin(trailing(all, o.window));
      var u = judge(win, o.weight, all), pt = pathTerms(S.pts, fresh.concat(ahead), o);
      var c = 3 * pt.dens + 0.8 * pt.cross + 2.5 * pt.tight + 12 * pt.out - 1.5 * pt.space;
      if (o.curlVeto) c += o.curlVeto * loopClash(S.pts, fresh.concat(ahead));   /* Nov 5: your one remaining problem, curls that overlap old ink or each other */
      /* variety: changing behaviour is rewarded once the current one has run a while, never in quick flicker */
      var switched = st.mode !== S.st.mode, vb = !o.modes ? 0 : switched ? (S.st.modeT > 14 ? 0.8 : -1.5) : (S.st.modeT > 30 ? -0.6 : 0);
      best.push({ st: st, comps: comps.slice(n0, nc), tc: tc, fresh: fresh, u: u, c: c, pt: pt, mode: st.mode, score: u - lam * c + vb + (o.modeBias && st.mode ? (o.modeBias[st.mode] || 0) : 0) });   /* modeBias: learned from which ways on you pick */
    }
    var mx = Math.max.apply(null, best.map(function (b) { return b.score; })), ws = best.map(function (b) { return Math.exp((b.score - mx) / o.temp); }), tot = ws.reduce(function (a, b) { return a + b; }, 0), pick = S.r() * tot, i = 0;
    for (; i < best.length - 1; i++) { pick -= ws[i]; if (pick <= 0) break; }
    var ch = best[i]; S.st = ch.st; S.comps = S.comps.concat(ch.comps); S.pts = S.pts.concat(ch.fresh); S.t = ch.tc;
    var lp = S.pts[S.pts.length - 1]; S.x = lp[0]; S.y = lp[1];
    S.choices.push({ t: S.t, u: ch.u, c: ch.c, mode: ch.mode, mean: best.reduce(function (a, b) { return a + b.u; }, 0) / best.length });
    if (S.comps.length > 400) S.comps = S.comps.slice(-200);
    return ch;
  }
  /* a finished, drawable copy: taper in over the first 0.3 s and out over the last 0.4 s, centred in a unit box */
  function finish(pts) {
    var T = pts[pts.length - 1][3], P = pts.map(function (p) { var a = Math.min(1, p[3] / 300), b = Math.min(1, (T - p[3]) / 400); return [p[0], p[1], Math.max(0.03, p[2] * Math.min(a, b) * (0.35 + 0.65 * Math.min(a, b))), p[3]]; });
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity; P.forEach(function (p) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
    var sc = 1 / Math.max(1e-6, mxx - mnx, mxy - mny), cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    return P.map(function (p) { return [(p[0] - cx) * sc, (p[1] - cy) * sc, p[2], p[3]]; });
  }
  var api = { MODES: MODES, create: create, step: step, finish: finish, normWin: normWin, trailing: trailing, pulse: pulse, integrate: integrate, MODE_NAMES: MODE_NAMES };   /* pulse/integrate: for writing (choosing among the walk's own pulses) */
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Steer = api;
})(this);

/* Spacing and negative space, measured several ways so the data can say which (if any) matters.
   strands: where the line passes near another part of itself, how close, and how evenly spaced those passes are.
   crossings: how many, and how evenly spread along the line. holes: enclosed regions and how equal their sizes are.
   empty space: pockets of blank space inside the figure and how equal they are; how evenly ink covers the figure. */
function spacing(pts) {
  const n0 = pts.length; if (n0 < 10) return null;
  // arclength resample to 300
  const d = [0]; for (let i = 1; i < n0; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = d[n0 - 1]; if (!(L > 1e-6)) return null; const N = 300, P = []; let j = 0;
  for (let k = 0; k < N; k++) { const s = L * k / (N - 1); while (j < n0 - 2 && d[j + 1] < s) j++; const u = (s - d[j]) / ((d[j + 1] - d[j]) || 1); P.push([pts[j][0] + u * (pts[j + 1][0] - pts[j][0]), pts[j][1] + u * (pts[j + 1][1] - pts[j][1])]); }
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; P.forEach(p => { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
  const size = Math.max(mxx - mnx, mxy - mny) || 1;
  // strands: nearest non-adjacent point (more than 8% of the length away along the line, and the path must leave and come back)
  const skip = Math.round(0.08 * N), gap = [];
  for (let a = 0; a < N; a++) { let best = Infinity; for (let b = 0; b < N; b++) { if (Math.abs(a - b) <= skip) continue; const dd = Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]); if (dd < best) best = dd; } gap.push(best / size); }
  const near = gap.filter(g => g < 0.12), mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1), cv = a => { const m = mean(a); return a.length > 3 && m > 0 ? Math.sqrt(mean(a.map(x => (x - m) ** 2))) / m : 0; };
  const sg = gap.slice().sort((x, y) => x - y);
  // crossings with segment intersection; arclength positions
  const cross = [], cxy = [];
  for (let a = 0; a < N - 1; a++) for (let b = a + 2; b < N - 1; b++) {
    const p = P[a], q = P[a + 1], r = P[b], s = P[b + 1];
    const d1 = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]), d2 = (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
    const d3 = (s[0] - r[0]) * (p[1] - r[1]) - (s[1] - r[1]) * (p[0] - r[0]), d4 = (s[0] - r[0]) * (q[1] - r[1]) - (s[1] - r[1]) * (q[0] - r[0]);
    if (d1 * d2 < 0 && d3 * d4 < 0) { cross.push(a / N, b / N); cxy.push([(P[a][0] + P[a + 1][0]) / 2, (P[a][1] + P[a + 1][1]) / 2]); }
  }
  cross.sort((x, y) => x - y);
  // where crossings sit in the figure: spread around their centre, and how bunched they are (nearest-neighbour distance)
  let cSpread = 0, cBunch = 0;
  if (cxy.length >= 2) { const gx = mean(cxy.map(c => c[0])), gy = mean(cxy.map(c => c[1])); cSpread = mean(cxy.map(c => Math.hypot(c[0] - gx, c[1] - gy))) / size;
    cBunch = mean(cxy.map((c, i) => { let b = Infinity; cxy.forEach((e, k) => { if (k !== i) b = Math.min(b, Math.hypot(c[0] - e[0], c[1] - e[1])); }); return b; })) / size; } const cgaps = []; for (let i = 1; i < cross.length; i++) cgaps.push(cross[i] - cross[i - 1]);
  // raster 80x80 inside the figure's box
  const R = 80, ink = new Uint8Array(R * R), mx = v => Math.min(R - 1, Math.max(0, Math.floor((v - mnx) / size * (R - 1)))), my = v => Math.min(R - 1, Math.max(0, Math.floor((v - mny) / size * (R - 1))));
  for (let a = 0; a < N - 1; a++) for (let t = 0; t <= 4; t++) { const x = P[a][0] + (P[a + 1][0] - P[a][0]) * t / 4, y = P[a][1] + (P[a + 1][1] - P[a][1]) * t / 4; ink[my(y) * R + mx(x)] = 1; }
  const W = Math.ceil((mxx - mnx) / size * (R - 1)) + 1, H = Math.ceil((mxy - mny) / size * (R - 1)) + 1;
  // holes: blank regions not connected to the border of the box
  const lab = new Int32Array(R * R).fill(-1), areas = [];
  let id = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i0 = y * R + x; if (ink[i0] || lab[i0] >= 0) continue;
    const st = [i0]; lab[i0] = id; let area = 0, border = false;
    while (st.length) { const c = st.pop(), cx = c % R, cy = (c - cx) / R; area++; if (cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) border = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * R + nx; if (!ink[ni] && lab[ni] < 0) { lab[ni] = id; st.push(ni); } } }
    if (!border && area >= 4) areas.push(area / (W * H)); id++;
  }
  // distance to ink (chamfer) inside the box; empty pockets = local maxima
  const D = new Float32Array(R * R).fill(1e9);
  for (let i = 0; i < R * R; i++) if (ink[i]) D[i] = 0;
  for (let pass = 0; pass < 2; pass++) {
    const ys = pass ? [...Array(H).keys()].reverse() : [...Array(H).keys()], xs = pass ? [...Array(W).keys()].reverse() : [...Array(W).keys()];
    for (const y of ys) for (const x of xs) { const i = y * R + x; for (const [dx, dy, c] of [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414], [1, 0, 1], [0, 1, 1], [1, 1, 1.414], [-1, 1, 1.414]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const v = D[ny * R + nx] + c; if (v < D[i]) D[i] = v; } }
  }
  const pockets = []; let inside = 0, filled = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * R + x, v = D[i]; inside++; if (v <= 4) filled++; if (v < 2) continue; let peak = true; for (let dy = -1; dy <= 1 && peak; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && D[(y + dy) * R + x + dx] > v) { peak = false; break; } if (peak) pockets.push(v / R); }
  // ink evenness over a 4x4 grid of the box
  const cells = new Array(16).fill(0); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * R + x]) cells[Math.min(3, Math.floor(y / H * 4)) * 4 + Math.min(3, Math.floor(x / W * 4))]++;
  return {
    sp_passShare: near.length / N,                       // share of the line running near another strand
    sp_passGap: near.length ? mean(near) : 0.12,          // how close those strands are (relative to figure size)
    sp_passEven: near.length > 5 ? cv(near) : 0,         // unevenness of those gaps (0 = equally spaced strands)
    sp_touch: gap.filter(g => g < 0.025).length / N,     // near-collisions
    sp_gapMed: sg[Math.floor(N / 2)],                    // typical distance to the rest of the line
    sp_cross: cross.length / 2,                          // crossings
    sp_crossEven: cgaps.length > 2 ? cv(cgaps) : 0,      // unevenness of crossing positions along the line
    sp_crossSpread: cSpread,                             // crossings spread over the figure (high) or piled in one spot (low)
    sp_crossApart: cBunch,                               // typical distance from a crossing to the nearest other crossing
    sp_holes: areas.length,                              // enclosed regions
    sp_holeEven: areas.length > 1 ? cv(areas) : 0,       // unevenness of their sizes
    sp_pocketEven: pockets.length > 2 ? cv(pockets) : 0, // unevenness of blank pockets
    sp_pocketMax: pockets.length ? Math.max(...pockets) : 0,
    sp_cover: inside ? filled / inside : 0,              // share of the figure's box within reach of ink
    sp_inkEven: cv(cells)                                // unevenness of ink over the box
  };
}

/* Your stated rules (Nov 4, 14:33), as measures that can be checked against his ratings:
   loops piled in one area / too tight / overlapping; recrossing clutter; filling space; variety of speed and behaviour over time. */
function rules(pts) {
  const n = pts.length; if (n < 12) return null;
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; pts.forEach(p => { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
  const size = Math.max(mxx - mnx, mxy - mny) || 1e-6;
  // arclength resample (300) keeping time
  const d = [0]; for (let i = 1; i < n; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const Ltot = d[n - 1]; if (!(Ltot > 1e-9)) return null;
  const N = 300, P = []; let j = 0;
  for (let k = 0; k < N; k++) { const s = Ltot * k / (N - 1); while (j < n - 2 && d[j + 1] < s) j++; const u = (s - d[j]) / ((d[j + 1] - d[j]) || 1); P.push([pts[j][0] + u * (pts[j + 1][0] - pts[j][0]), pts[j][1] + u * (pts[j + 1][1] - pts[j][1]), pts[j][3] + u * (pts[j + 1][3] - pts[j][3])]); }
  const th = []; for (let k = 1; k < N; k++) th.push(Math.atan2(P[k][1] - P[k - 1][1], P[k][0] - P[k - 1][0]));
  for (let k = 1; k < th.length; k++) { while (th[k] - th[k - 1] > Math.PI) th[k] -= 2 * Math.PI; while (th[k] - th[k - 1] < -Math.PI) th[k] += 2 * Math.PI; }
  const ds = Ltot / (N - 1);
  // loops: shortest stretches that turn a full circle; their size (diameter ~ length / pi) and centre
  const loops = []; let a = 0;
  while (a < th.length - 2) { let b = a + 1; while (b < th.length && Math.abs(th[b] - th[a]) < 2 * Math.PI) b++; if (b >= th.length) break;
    const len = (b - a) * ds; let cx = 0, cy = 0; for (let k = a; k <= b; k++) { cx += P[k][0]; cy += P[k][1]; } const m = b - a + 1;
    loops.push({ dia: len / Math.PI / size, cx: cx / m, cy: cy / m }); a = b; }
  const tight = loops.filter(l => l.dia < 0.12).length;
  let piled = 0; loops.forEach((l, i) => { if (loops.some((q, k) => k !== i && Math.hypot(l.cx - q.cx, l.cy - q.cy) < 0.15 * size)) piled++; });
  // crossings and clustered recrossings
  const cr = [];
  for (let p = 0; p < N - 1; p += 1) for (let q = p + 3; q < N - 1; q++) { const A = P[p], B = P[p + 1], C = P[q], D = P[q + 1];
    const d1 = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]), d2 = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]);
    const d3 = (D[0] - C[0]) * (A[1] - C[1]) - (D[1] - C[1]) * (A[0] - C[0]), d4 = (D[0] - C[0]) * (B[1] - C[1]) - (D[1] - C[1]) * (B[0] - C[0]);
    if (d1 * d2 < 0 && d3 * d4 < 0) cr.push([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]); }
  let clustered = 0; cr.forEach((c, i) => { if (cr.some((q, k) => k !== i && Math.hypot(c[0] - q[0], c[1] - q[1]) < 0.1 * size)) clustered++; });
  // space filling: share of a 12x12 grid over the figure's box that the line passes within one cell of
  const G = 12, occ = new Set(); P.forEach(p => { const gx = Math.min(G - 1, Math.floor((p[0] - mnx) / size * G)), gy = Math.min(G - 1, Math.floor((p[1] - mny) / size * G)); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) occ.add((gx + dx) + ',' + (gy + dy)); });
  const W = Math.max(1, Math.ceil((mxx - mnx) / size * G)), H = Math.max(1, Math.ceil((mxy - mny) / size * G)); let cov = 0; occ.forEach(k => { const [x, y] = k.split(',').map(Number); if (x >= 0 && y >= 0 && x < W && y < H) cov++; });
  // variety over time: split the line into 0.4 s stretches; how much speed and turning differ between stretches, and how often the behaviour changes
  const T = P[N - 1][2] - P[0][2], seg = []; const step = 400;
  for (let t0 = P[0][2]; t0 + step <= P[N - 1][2] + 1; t0 += step) { const ix = P.map((p, k) => k).filter(k => P[k][2] >= t0 && P[k][2] < t0 + step); if (ix.length < 3) continue;
    const len = (ix.length - 1) * ds, turn = Math.abs(th[Math.min(th.length - 1, ix[ix.length - 1])] - th[Math.min(th.length - 1, ix[0])]); seg.push({ sp: len / step * 1000, tu: turn / Math.max(1e-6, len / size) }); }
  const cv = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return m > 0 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m : 0; };
  let changes = 0; for (let k = 1; k < seg.length; k++) { const r1 = Math.log((seg[k].sp + 1e-6) / (seg[k - 1].sp + 1e-6)), r2 = Math.log((seg[k].tu + 0.3) / (seg[k - 1].tu + 0.3)); if (Math.abs(r1) > 0.5 || Math.abs(r2) > 0.7) changes++; }
  return {
    r_loops: loops.length, r_tightLoops: tight, r_piledLoops: piled, r_crossings: cr.length, r_clusteredCross: clustered,
    r_fill: cov / (W * H), r_speedVar: seg.length > 2 ? cv(seg.map(s => s.sp)) : 0, r_behaviourVar: seg.length > 2 ? cv(seg.map(s => s.tu + 0.3)) : 0,
    r_changesPerSec: seg.length > 2 ? changes / (T / 1000) : 0, r_dur: T / 1000
  };
}

/* Path measures from your notes (Nov 4, 19:20), shared by the analysis and the live steering.
   Everything is measured on a fixed 50 ms grid, and old ink counts only as much as it is still visible on screen
   (the page shows the last 7 s, fading over its oldest 2.5 s), so a crossing over a faded line weighs less.
     coil:    net full turns and turning rate over the last 1.5 s (what you cut most)
     mono:    how much width and speed change over the last 1.5 s, and the sharpest turn (low = monotonous)
     variety: over the last 6 s, in 0.5 s pieces: spread of turning rate (tight vs wide), spread of speed (fast vs slow),
              share of the pieces that are curls vs angled/straight, and how often the behaviour changes
     cross:   crossings of the last 1.5 s with visible older ink: how many (visibility-weighted), their angle (|sin|, 1 = square),
              how busy the spot already is, and how close the new stretch runs alongside old ink without crossing */
(function (root) {
  function grid(q0, dt) {
    dt = dt || 50; var out = [], t0 = q0[0][3], t1 = q0[q0.length - 1][3], j = 0;
    for (var t = t0; t <= t1 + 1e-6; t += dt) { while (j < q0.length - 2 && q0[j + 1][3] < t) j++; var a = q0[j], b = q0[Math.min(j + 1, q0.length - 1)], u = Math.max(0, Math.min(1, (t - a[3]) / ((b[3] - a[3]) || 1))); out.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2]), t]); }
    return out.length >= 3 ? out : q0;
  }
  function wrap(d) { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  function since(seg, ms) { var T = seg[seg.length - 1][3], i = seg.length - 1; while (i > 0 && seg[i - 1][3] >= T - ms) i--; return seg.slice(i); }
  function coil(seg) {
    var q0 = since(seg, 1500); if (q0.length < 4) return [0, 0]; var q = grid(q0), tot = 0, ab = 0;
    for (var i = 2; i < q.length; i++) { var d = wrap(Math.atan2(q[i][1] - q[i - 1][1], q[i][0] - q[i - 1][0]) - Math.atan2(q[i - 1][1] - q[i - 2][1], q[i - 1][0] - q[i - 2][0])); tot += d; ab += Math.abs(d); }
    var dur = (q[q.length - 1][3] - q[0][3]) / 1000 || 1; return [Math.abs(tot) / (2 * Math.PI), ab / dur];
  }
  function mono(seg) {
    var q0 = since(seg, 1500); if (q0.length < 4) return [0, 0, 0]; var q = grid(q0), v = [], th = [], wj = 0;
    for (var i = 1; i < q.length; i++) { v.push(Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]) / 0.05); wj += Math.abs(q[i][2] - q[i - 1][2]); th.push(Math.atan2(q[i][1] - q[i - 1][1], q[i][0] - q[i - 1][0])); }
    var mv = 0; v.forEach(function (x) { mv += x; }); mv = mv / v.length || 1e-9; var vj = 0; for (var k = 1; k < v.length; k++) vj += Math.abs(v[k] - v[k - 1]); vj /= Math.max(1, v.length - 1) * mv;
    var mt = 0; for (var m = 1; m < th.length; m++) mt = Math.max(mt, Math.abs(wrap(th[m] - th[m - 1])) / 0.05);
    return [wj / Math.max(1, q.length - 1), vj, Math.log(1 + mt)];
  }
  function variety(seg) {
    var q0 = since(seg, 6000); if (q0.length < 8) return [0, 0, 0, 0]; var q = grid(q0), P = 10, tr = [], sp = [], curl = 0, n = 0, prev = null, ch = 0;
    for (var s = 0; s + P < q.length; s += P) {
      var tot = 0, ab = 0, L = 0; for (var i = s + 2; i <= s + P; i++) { var d = wrap(Math.atan2(q[i][1] - q[i - 1][1], q[i][0] - q[i - 1][0]) - Math.atan2(q[i - 1][1] - q[i - 2][1], q[i - 1][0] - q[i - 2][0])); tot += d; ab += Math.abs(d); }
      for (var k = s + 1; k <= s + P; k++) L += Math.hypot(q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]);
      tr.push(Math.log(0.2 + ab / 0.5)); sp.push(Math.log(1e-3 + L / 0.5)); n++;
      var kind = Math.abs(tot) > 0.8 * ab && ab > 2.5 ? 'curl' : ab < 0.6 ? 'straight' : 'angled'; if (kind === 'curl') curl++; if (prev && kind !== prev) ch++; prev = kind;
    }
    if (n < 3) return [0, 0, 0, 0];
    function sd(a) { var m = 0; a.forEach(function (x) { m += x; }); m /= a.length; var v = 0; a.forEach(function (x) { v += (x - m) * (x - m); }); return Math.sqrt(v / a.length); }
    return [sd(tr), sd(sp), curl / n, ch / (n - 1)];
  }
  function segX(a, b, c, d) {   /* do segments ab and cd cross? returns [u along ab, |sin angle|] or null */
    var r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1], den = r0 * s1 - r1 * s0; if (Math.abs(den) < 1e-12) return null;
    var u = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den, w = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
    if (u < 0 || u > 1 || w < 0 || w > 1) return null; return [u, Math.abs(den) / (Math.hypot(r0, r1) * Math.hypot(s0, s1) + 1e-12)];
  }
  function cross(seg) {
    var T = seg[seg.length - 1][3], vis = grid(since(seg, 7000)), fresh = vis.filter(function (p) { return p[3] >= T - 1500; }), old = vis.filter(function (p) { return p[3] < T - 1800; });
    if (fresh.length < 3 || old.length < 3) return [0, 0.5, 0, 0];
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity; vis.forEach(function (p) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
    var scale = Math.max(mxx - mnx, mxy - mny, 1e-6), fade = function (p) { return Math.max(0, Math.min(1, (p[3] - (T - 7000)) / 2500)); };
    var xn = 0, xa = 0, xb = 0;
    for (var i = 1; i < fresh.length; i++) for (var j = 1; j < old.length; j++) {
      var hit = segX(fresh[i - 1], fresh[i], old[j - 1], old[j]); if (!hit) continue; var w = fade(old[j]); if (w <= 0) continue;
      var cx = fresh[i - 1][0] + hit[0] * (fresh[i][0] - fresh[i - 1][0]), cy = fresh[i - 1][1] + hit[0] * (fresh[i][1] - fresh[i - 1][1]), busy = 0;
      for (var k = 0; k < old.length; k++) if (Math.hypot(old[k][0] - cx, old[k][1] - cy) < 0.08 * scale) busy += fade(old[k]);
      xn += w; xa += w * hit[1]; xb += w * busy;
    }
    var along = 0; fresh.forEach(function (p) { var md = Infinity, wv = 0; old.forEach(function (o) { var d = Math.hypot(o[0] - p[0], o[1] - p[1]); if (d < md) { md = d; wv = fade(o); } }); along += wv * Math.exp(-(md / scale) / 0.04); }); along /= fresh.length;
    return [xn, xn > 0 ? xa / xn : 0.5, xn > 0 ? xb / xn : 0, along];
  }
  function all(seg) {
    var c = coil(seg), m = mono(seg), v = variety(seg), x = cross(seg);
    return { netTurn: c[0], turnRate: c[1], wJit: m[0], vJit: m[1], maxTurn: m[2], vTurn: v[0], vSpeed: v[1], curlShare: v[2], kindChanges: v[3], xVis: x[0], xAngle: x[1], xBusy: x[2], alongVis: x[3] };
  }
  var api = { all: all, grid: grid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PathFeat = api;
})(this);


/* The path is steered here, a few seconds ahead of what you see, and streamed to the page.
   Reward = path reward v4 (Nov 4): learned from your holds and rewind episodes (coiling, monotony, crossings, crowding,
   speed relative to recently) plus your stated rules (variety, not only curls, no busy crossings, no running alongside ink).
   The raw-line term is left out here (too heavy for a phone); its weight was small. */
var PR = {"F":["r","crowd","relSpeed","sp_touch","sp_cross","sp_cover","sp_passGap","r_piled","r_tight","r_cross","r_clust","r_speedVar","r_behVar","r_changes","netTurn","turnRate","wJit","vJit","maxTurn","vTurn","vSpeed","curlShare","kindChanges","xVis","xAngle","xBusy","alongVis"],"mu":[-2.691865095755274,0.1145295891835674,-0.010685907436297458,0.1281209915063269,6.456058242329693,0.4020923202608688,0.06029530211371916,1.3244929797191887,1.0858034321372856,6.335413416536661,4.1383255330213204,0.31711576736133934,0.8348582071482726,1.4561981732099654,1.0385630944691817,6.77082573548423,0.02540062033102531,0.16250590507546667,3.2661865557539675,0.6987117018609245,0.29013800237720455,0.4376139631239194,0.5915015169386223,0.5054642059252065,0.6191234563701188,2.091546575700844,0.09947318787022481],"sd":[1.2043974603014522,0.12640729931903696,0.2119666119168455,0.08573404411019188,5.127852474892702,0.09326439511133361,0.012752608336806462,2.0449341779778725,1.625787131246239,4.942869574282126,4.933420757218378,0.0821816346700332,0.20505676483708454,0.3614318215413325,0.8132767685199004,3.1547426305584962,0.025583783249669898,0.05040767581825103,0.5865367788287756,0.19062877386428653,0.09515594216978798,0.18055059608906157,0.19722791515121485,0.8519630455576134,0.19070244096284714,3.6847064849044817,0.10301769717362834],"coef":[0.09222876024336449,-0.6,0.11172065606185407,-0.5,-0.1625334793599257,0.027485042196513234,0.4351466197732863,-0.6,-0.4,-0.0640111116341182,-0.5,-0.6476925172279484,-0.09286821718358994,0.0106772799957558,-0.8,-0.8,0.3848896135981388,0.2730106714051367,0.46095835678746455,0.5,0.51,-0.9,0.4,0.060314048804080436,0.3,-0.8,-0.8],"icpt":1.0119170242882347};
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

function normBox(seg){ var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity; seg.forEach(function(p){ mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); }); var sc = 1 / Math.max(1e-6, mxx - mnx, mxy - mny), cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, t0 = seg[0][3]; return seg.map(function(p){ return [(p[0] - cx) * sc, (p[1] - cy) * sc, p[2], p[3] - t0]; }); }
function pathLen(a){ var s = 0; for (var i = 1; i < a.length; i++) s += Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]); return s; }
function judge(win, weight, all){
  var T = all[all.length - 1][3], ctx = normBox(all.filter(function(p){ return p[3] >= T - 6000; })), tc = ctx[ctx.length - 1][3];
  var sp = spacingFast(ctx) || {}, ru = rules(ctx) || {};
  var fresh = ctx.filter(function(p){ return p[3] >= tc - 1200; }), old = ctx.filter(function(p){ return p[3] < tc - 1500; }), crowd = 0;
  if (old.length && fresh.length){ fresh.forEach(function(p){ var md = 9; for (var i = 0; i < old.length; i += 2) md = Math.min(md, Math.hypot(p[0] - old[i][0], p[1] - old[i][1])); crowd += Math.exp(-md / 0.05); }); crowd /= fresh.length; }
  var sp1 = fresh.length > 2 ? pathLen(fresh) / ((fresh[fresh.length - 1][3] - fresh[0][3]) || 1) : 0, spc = ctx.length > 2 ? pathLen(ctx) / ((tc - ctx[0][3]) || 1) : 1;
  var f = { crowd: crowd, relSpeed: Math.log((sp1 + 1e-6) / (spc + 1e-6)), sp_touch: sp.sp_touch, sp_cross: sp.sp_cross, sp_cover: sp.sp_cover, sp_passGap: sp.sp_passGap, r_piled: ru.r_piledLoops, r_tight: ru.r_tightLoops, r_cross: ru.r_crossings, r_clust: ru.r_clusteredCross, r_speedVar: ru.r_speedVar, r_behVar: ru.r_behaviourVar, r_changes: ru.r_changesPerSec };
  var pf = self.PathFeat.all(all); for (var k0 in pf) f[k0] = pf[k0];
  var u = PR.icpt; for (var k = 0; k < PR.F.length; k++){ var v = f[PR.F[k]]; if (v == null || !isFinite(v)) v = PR.mu[k]; var z = (v - PR.mu[k]) / PR.sd[k]; z = Math.max(-3, Math.min(PR.F[k] === 'relSpeed' ? 1.5 : 3, z)); u += PR.coef[k] * z; }
  return u;
}
var S = null, limit = 10, sent = 0;
function loop(){
  if (!S) return; var t1 = Date.now();
  while (S.t < limit && Date.now() - t1 < 40){ if (STY) { var si = STY.order[Math.floor(S.t / STY.len) % STY.order.length]; if (si !== STY.cur) { for (var sk in STY.opts[si]) S.o[sk] = STY.opts[si][sk]; STY.cur = si; } } if (SN && BLOCKS) { var bi = Math.floor(S.t / BLOCKS.len); SN.off = !BLOCKS.on[bi % BLOCKS.on.length]; S.o.curlVeto = SN.off ? 0 : VETO; } self.Steer.step(S, judge); if (S.comps.length > 400) S.comps = S.comps.slice(-200); }
  if (S.pts.length > sent){ var chunk = S.pts.slice(sent).map(function(q){ return [q[0], q[1], q[2], q[3]]; }); var mode = S.st.mode || null; postMessage({ chunk: chunk, t: S.t, mode: mode }); sent = S.pts.length; }
  if (S.pts.length > 6000){ var drop = S.pts.length - 4000; S.pts = S.pts.slice(drop); sent -= drop; }   /* keep memory bounded on long sessions */
  setTimeout(loop, S.t < limit ? 0 : 60);
}
var SN = null, BLOCKS = null, VETO = 0, STY = null;

var C = {"walk":{"absMu":0.688068433434603,"beta":0.6863206776529586,"gAmp":0.015192399752514858,"gFlip":0.181262981030847,"gPeriod":9.697233527720469,"jagAngle":2.601193888280665,"jagLeg":5.52018333803497,"jagTaper":0.9106590772622307,"keepCurl":0.26591825451076656,"pMid":0.7977615289451313,"pull":0.0028496862845011905,"pulseSigma":0.48206323204582235,"rate":11.672823924403119,"rho":0.709620395571018,"sigma":0.2465706917827987,"span":2.1828625610827244,"speedRho":0.9,"speedSigma":0.3740769900610618,"weight":0.4649583042090754,"curlVeto":4},"modes":{"glide":[63,17],"corner":[24,5],"sweep":[35,10],"curl":[27,9],"wave":[15,0]},"modeOverride":{"corner":-1.966306838006116,"curl":-1.4965276766689957,"glide":0.14708586199598656,"sweep":1.3422357202054525,"wave":-2.2490549613118818},"lang":"en-GB","version":"talk2-favA-guard-styles","styles":[{"rate":11.6728,"span":2.1829,"pulseSigma":0.4821,"rho":0.7096,"sigma":0.2466,"keepCurl":0.2659,"beta":0.6863,"speedRho":0.9,"speedSigma":0.3741,"absMu":0.6881,"gAmp":0.0152,"gPeriod":9.6972,"gFlip":0.1813,"jagRate":0.0493,"jagAngle":2.6012,"jagLeg":5.5202,"jagTaper":0.9107,"pMid":0.7978,"weight":0.465,"m_glide":0.1471,"m_sweep":1.3422,"m_curl":-1.4965,"m_wave":-2.2491,"m_corner":-1.9663},{"rate":10.7891,"span":2.0619,"pulseSigma":0.4821,"rho":0.7247,"sigma":0.3192,"keepCurl":0.3993,"beta":0.6997,"speedRho":0.8136,"speedSigma":0.3902,"absMu":0.6001,"gAmp":0.021,"gPeriod":8.8496,"gFlip":0.2325,"jagRate":0.0762,"jagAngle":2.8137,"jagLeg":7.032,"jagTaper":0.9203,"pMid":0.8199,"weight":0.2653,"m_glide":0.1471,"m_sweep":1.1251,"m_curl":-0.3505,"m_wave":-1.6981,"m_corner":-0.5428},{"rate":11.2279,"span":2.1829,"pulseSigma":0.4267,"rho":0.7096,"sigma":0.3329,"keepCurl":0.4463,"beta":0.5405,"speedRho":0.6754,"speedSigma":0.346,"absMu":0.5589,"gAmp":0.0706,"gPeriod":10.0223,"gFlip":0.1487,"jagRate":0.0448,"jagAngle":2.7815,"jagLeg":5.0373,"jagTaper":1.0,"pMid":0.7978,"weight":0.4982,"m_glide":0.1471,"m_sweep":1.4707,"m_curl":-1.8454,"m_wave":-1.3731,"m_corner":-0.7761},{"rate":11.6728,"span":2.1829,"pulseSigma":0.4821,"rho":0.7096,"sigma":0.2466,"keepCurl":0.1854,"beta":0.8,"speedRho":0.9,"speedSigma":0.3741,"absMu":0.6881,"gAmp":0.0,"gPeriod":10.6494,"gFlip":0.0,"jagRate":0.0404,"jagAngle":2.6012,"jagLeg":4.3636,"jagTaper":0.9107,"pMid":0.7978,"weight":0.7808,"m_glide":0.6009,"m_sweep":1.3422,"m_curl":0.2057,"m_wave":-1.6598,"m_corner":-1.9663},{"rate":11.1823,"span":2.31,"pulseSigma":0.4911,"rho":0.6616,"sigma":0.2133,"keepCurl":0.3296,"beta":0.6014,"speedRho":0.6484,"speedSigma":0.3942,"absMu":0.6446,"gAmp":0.0,"gPeriod":10.5978,"gFlip":0.1371,"jagRate":0.042,"jagAngle":2.5515,"jagLeg":5.8974,"jagTaper":0.9165,"pMid":0.7825,"weight":0.4241,"m_glide":-0.2031,"m_sweep":1.9116,"m_curl":-1.8438,"m_wave":-2.5,"m_corner":-1.6521},{"rate":11.4472,"span":2.4505,"pulseSigma":0.4375,"rho":0.703,"sigma":0.2466,"keepCurl":0.2498,"beta":0.6417,"speedRho":0.8754,"speedSigma":0.3616,"absMu":0.6504,"gAmp":0.0152,"gPeriod":8.3291,"gFlip":0.0807,"jagRate":0.0469,"jagAngle":2.6012,"jagLeg":5.2291,"jagTaper":0.9107,"pMid":0.7823,"weight":0.4528,"m_glide":0.1471,"m_sweep":1.5,"m_curl":-1.3078,"m_wave":-1.5766,"m_corner":-1.381},{"rate":11.6728,"span":2.1829,"pulseSigma":0.4821,"rho":0.6333,"sigma":0.2984,"keepCurl":0.5241,"beta":0.3297,"speedRho":0.9,"speedSigma":0.1129,"absMu":0.4293,"gAmp":0.0,"gPeriod":12.9333,"gFlip":0.2065,"jagRate":0.0449,"jagAngle":2.9559,"jagLeg":7.3815,"jagTaper":0.9107,"pMid":0.8573,"weight":0.2637,"m_glide":-0.8899,"m_sweep":0.9914,"m_curl":0.0043,"m_wave":-2.5,"m_corner":-2.5},{"rate":12.2217,"span":1.5737,"pulseSigma":0.5078,"rho":0.6246,"sigma":0.1881,"keepCurl":0.2659,"beta":0.6863,"speedRho":0.9477,"speedSigma":0.3021,"absMu":0.9971,"gAmp":0.0,"gPeriod":8.6937,"gFlip":0.1727,"jagRate":0.0175,"jagAngle":2.5188,"jagLeg":7.4519,"jagTaper":0.9107,"pMid":0.7574,"weight":0.3177,"m_glide":-0.1058,"m_sweep":1.6202,"m_curl":-1.2046,"m_wave":-2.071,"m_corner":0.533},{"rate":10.7891,"span":1.6097,"pulseSigma":0.5739,"rho":0.7707,"sigma":0.1016,"keepCurl":0.3993,"beta":0.7526,"speedRho":0.8136,"speedSigma":0.3852,"absMu":0.5525,"gAmp":0.0551,"gPeriod":7.9813,"gFlip":0.2905,"jagRate":0.0754,"jagAngle":2.7508,"jagLeg":3.3157,"jagTaper":0.6506,"pMid":0.8534,"weight":0.4589,"m_glide":0.2108,"m_sweep":0.7219,"m_curl":-0.8045,"m_wave":-1.7594,"m_corner":-0.5428},{"rate":11.6728,"span":2.1829,"pulseSigma":0.4579,"rho":0.7096,"sigma":0.238,"keepCurl":0.5241,"beta":0.4014,"speedRho":0.9,"speedSigma":0.3741,"absMu":0.5478,"gAmp":0.0672,"gPeriod":8.3668,"gFlip":0.293,"jagRate":0.04,"jagAngle":2.9189,"jagLeg":6.4303,"jagTaper":0.9106,"pMid":0.8963,"weight":0.3816,"m_glide":0.5465,"m_sweep":1.8547,"m_curl":-1.8593,"m_wave":-2.0368,"m_corner":-0.343},{"rate":10.961,"span":2.1356,"pulseSigma":0.4439,"rho":0.5927,"sigma":0.1834,"keepCurl":0.486,"beta":0.6876,"speedRho":0.6494,"speedSigma":0.3371,"absMu":0.4894,"gAmp":0.0,"gPeriod":8.8363,"gFlip":0.1236,"jagRate":0.0641,"jagAngle":2.63,"jagLeg":5.3342,"jagTaper":0.9195,"pMid":0.7405,"weight":0.514,"m_glide":0.352,"m_sweep":1.0894,"m_curl":-1.1317,"m_wave":-1.932,"m_corner":-0.4804},{"rate":11.6728,"span":2.153,"pulseSigma":0.4821,"rho":0.7096,"sigma":0.2466,"keepCurl":0.2659,"beta":0.6498,"speedRho":0.9,"speedSigma":0.39,"absMu":0.6881,"gAmp":0.0152,"gPeriod":9.6972,"gFlip":0.1813,"jagRate":0.0493,"jagAngle":2.6012,"jagLeg":5.5202,"jagTaper":0.9107,"pMid":0.77,"weight":0.465,"m_glide":0.1471,"m_sweep":1.3422,"m_curl":-1.4965,"m_wave":-2.2491,"m_corner":-1.8383},{"rate":11.377,"span":2.2008,"pulseSigma":0.47,"rho":0.7,"sigma":0.2466,"keepCurl":0.1207,"beta":0.4862,"speedRho":0.6413,"speedSigma":0.3992,"absMu":0.7551,"gAmp":0.0152,"gPeriod":8.8641,"gFlip":0.1813,"jagRate":0.0457,"jagAngle":2.7496,"jagLeg":5.4941,"jagTaper":0.9656,"pMid":0.7862,"weight":0.4419,"m_glide":0.3094,"m_sweep":1.3422,"m_curl":-1.3914,"m_wave":-1.6938,"m_corner":-0.2312}],"senses":null,"guard":{"strength":1,"radius":2,"busy":4}};
return { Steer: self.Steer, LineGen: self.LineGen, judge: judge, C: C };
})(undefined, undefined);
