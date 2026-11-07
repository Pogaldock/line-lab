// Letters that emerge from the walk, chosen half a second at a time (beam search over the walk's own natural moves).
// Nothing bends or scripts the walk: every continuation is a plain W.Steer.step (the Endless Line's own choice among its drafts)
// with fresh randomness. We only choose which continuations survive, by how well the line so far reads as the word.
// Targets per letter: found forms (the walk's own best natural version of the letter, from found_alphabet.js) plus the font forms.
// Usage: node emerge_pulse.js <out.json> <seed> <text> <abcDir> <found.json|-> [B=24] [C=6]
const D = __dirname + '/../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js'), ST = require(D + 'live/student.js');
const [out, seed, text, abcDir, foundF] = process.argv.slice(2, 7), B = +(process.argv[7] || 24), C = +(process.argv[8] || 6);
const K0 = +(process.env.K0 || 18), LEAD = +(process.env.LEAD || 1.5), SPACE = 0.9, WT = +(process.env.WT || 0.05);
const SJ = JSON.parse(fs.readFileSync(D + 'live/results/student_weights_b1.json')), TJ = ST.make(SJ);
const top = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB);
const found = foundF && foundF !== '-' ? JSON.parse(fs.readFileSync(foundF)) : {};

// ---- letter forms in font units (origin on the baseline, 1 = font size): polyline + arc length table ----
function poly(P) { const Lc = [0]; for (let i = 1; i < P.length; i++) Lc.push(Lc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return { P, Lc, len: Lc[Lc.length - 1] }; }
function at(F, s) { const { P, Lc } = F; if (s <= 0) return P[0]; if (s >= F.len) return P[P.length - 1]; let lo = 0, hi = Lc.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Lc[m] <= s) lo = m; else hi = m; } const u = (s - Lc[lo]) / Math.max(1e-9, Lc[hi] - Lc[lo]); return [P[lo][0] + (P[hi][0] - P[lo][0]) * u, P[lo][1] + (P[hi][1] - P[lo][1]) * u]; }
function formsFor(ch) {
  const fs2 = [];
  [0, 1].forEach(v => { const cap = JSON.parse(fs.readFileSync(`${abcDir}/${ch}_${v}.json`)); const S = cap.strokes.map(a => { const P = []; for (let i = 0; i < a.length; i += 4) P.push([a[i], a[i + 1]]); return P; }).filter(P => P.length > 6);
    fs2.push(Object.assign(poly([].concat(...S)), { adv: cap.adv, kind: v ? 'loopy' : 'font' })); });
  (found[ch] || []).slice(0, 2).forEach(f => fs2.push(Object.assign(poly(f.pts), { adv: fs2[0].adv, kind: 'found' })));
  return fs2;
}
const letters = [...text].map(ch => ch === ' ' ? null : { ch, forms: formsFor(ch) });

// partial reading of the current letter: the line since the letter started vs the same length of each form, anchored at the start
const ROTS = [-0.2, 0, 0.2].map(a => [Math.cos(a), Math.sin(a)]), KS = [0.85, 1, 1.18];
function partial(cur, k0, lt) {
  const Pc = poly(cur.map(p => [p[0], p[1]])); let best = null;
  for (const F of lt.forms) for (const kf of KS) { const k = k0 * kf, sT = Math.min(F.len, Pc.len / k), n = Math.max(6, Math.min(24, Math.round(sT / F.len * 24)));
    for (const [c, s] of ROTS) { let d = 0; const t0 = F.P[0];
      for (let i = 0; i < n; i++) { const u = i / (n - 1), a = at(Pc, u * Pc.len), t = at(F, u * sT), tx = (t[0] - t0[0]) * k, ty = (t[1] - t0[1]) * k;
        d += Math.hypot(a[0] - (cur[0][0] + tx * c - ty * s), a[1] - (cur[0][1] + tx * s + ty * c)); }
      d = d / n / k; const frac = Math.min(1, Pc.len / (k * F.len));
      const sc = d + 0.25 * Math.abs(Math.log(kf));
      if (!best || sc < best.sc) best = { sc, d, frac, F, k }; } }
  return best;
}

const E = L.create(W, R, top[0].g, +seed, { lambda: 2 }), P0 = E.parts[0], o = P0.o; o.arena = 1e4;
let rs = +seed * 7919;
const clone = (S) => ({ o, r: W.LineGen.mulberry(++rs), st: JSON.parse(JSON.stringify(S.st)), comps: S.comps.slice(), pts: S.pts, x: S.x, y: S.y, t: S.t, choices: [] });
const trim = (pts, ms) => { const T = pts[pts.length - 1][3]; let i = 0; while (i < pts.length && pts[i][3] < T - ms) i++; return i ? pts.slice(i) : pts; };
const taste = (pts) => { const o2 = TJ(R.raster(R.windowOf(pts), SJ.size)); return Math.min(o2[1], o2[2]); };

// a beam: walk state + where we are in the text
// shape is in font units (a letter is ~0.3 across; 0.03 reads well): shape dominates, progress only breaks ties between good lines
const WSH = +(process.env.WSH || 25), WPR = +(process.env.WPR || 3), WG = +(process.env.WG || 1.5);
// progress is worth WPR per letter; shape error costs WSH per unit, counted over the part drawn so far. So drawing more only pays
// while the shape reads (error below WPR/WSH ~ 0.12 font units), and stalling never wins. Between letters: get to where the next one starts.
function score(b) { const fr = b.part ? b.part.frac : 0;
  return WPR * (b.done + fr) - WSH * (b.cost + (b.part ? b.part.sc * fr : 0)) - WG * (b.phase === 'free' && b.gap != null ? b.gap : 0) - 0.6 * Math.max(0, b.freeT - LEAD) + WT * b.taste; }

function advance(b, fresh) {   // feed new points to a beam's text state (mutates b); may finish a letter and start the next free stretch
  let i = 0;
  while (i < fresh.length && b.li < letters.length) {
    const lt = letters[b.li];
    if (!lt) { b.li++; if (b.Oexp) b.Oexp = [b.Oexp[0] + b.k0 * SPACE, b.Oexp[1]]; continue; }
    if (b.phase === 'free') {
      // start the letter at the point in this chunk nearest where its first stroke should begin (or anywhere, for the first letter)
      let j = -1;
      if (!b.Oexp) j = i;
      else { const F = lt.forms[0], ex = [b.Oexp[0] + b.k0 * F.P[0][0], b.Oexp[1] + b.k0 * F.P[0][1]]; let bd = 1e9;
        for (let q = i; q < fresh.length; q += 3) { const d = Math.hypot(fresh[q][0] - ex[0], fresh[q][1] - ex[1]); if (d < bd) { bd = d; j = q; } }
        const tol = b.k0 * 0.1; b.gap = bd / b.k0; if (bd > tol) { b.freeT += (fresh[fresh.length - 1][3] - fresh[i][3]) / 1000; return; }   // not there yet: keep flowing (too long costs)
      }
      b.phase = 'letter'; b.cur = [fresh[j]]; i = j + 1; b.freeT = 0; b.gap = null; continue;
    }
    b.cur.push(fresh[i]); i++;
    if (i % 4 === 0 || i === fresh.length) {
      b.part = partial(b.cur, b.k0 || K0, lt);
      if (b.part.frac >= 1) {   // letter complete
        const p = b.part; b.cost += p.sc; b.done++; b.placed.push({ ch: lt.ch, d: p.d, k: p.k, kind: p.F.kind, start: b.cur[0], n: b.cur.length });
        const O = [b.cur[0][0] - p.k * p.F.P[0][0], b.cur[0][1] - p.k * p.F.P[0][1]];
        b.k0 = b.k0 ? 0.75 * b.k0 + 0.25 * p.k : p.k; b.Oexp = [O[0] + b.k0 * p.F.adv, O[1]];
        b.li++; b.phase = 'free'; b.cur = null; b.part = null;
      }
    }
  }
}

// ---- pulse by pulse: every candidate line is continued by C fresh pulses from the walk's own dynamics (W.Steer.pulse: its
// turning, speed and mood changes), and the best B lines are kept. ----
const rng = W.LineGen.mulberry(+seed * 31 + 7), MODEP = +(process.env.MODEP || 0.06);
function grow(p) {
  const st = JSON.parse(JSON.stringify(p.st)), comps = p.comps.slice();
  if (o.modes && rng() < MODEP) { const others = W.Steer.MODE_NAMES.filter(m => m !== st.mode); st.prev = st.mode; st.mode = others[Math.floor(rng() * others.length)]; st.blend = 0; st.modeT = 0; st.cornered = false; }
  st.modeT = (st.modeT || 0) + 1;
  W.Steer.pulse(o, st, rng, comps);
  const t1 = comps[comps.length - 1].t0, fresh = W.Steer.integrate(comps, p.x, p.y, p.t, t1, o);
  const live = comps.filter(c => c.t0 + Math.exp(c.mu + 2.5 * c.sg) > t1);
  return { st, comps: live, fresh, t: t1 };
}
(async () => {
  for (let i = 0; i < 4; i++) W.Steer.step(P0, W.judge);
  const s0 = P0.st, lp = P0.pts[P0.pts.length - 1];
  let beams = [{ st: JSON.parse(JSON.stringify(s0)), comps: P0.comps.slice(-12), x: lp[0], y: lp[1], t: P0.t, recent: P0.pts.slice(-150), li: 0, phase: 'free', freeT: 0, cur: null, part: null, done: 0, cost: 0, pos: 0, taste: 0, k0: null, Oexp: null, placed: [], hist: { prev: null, pts: P0.pts.slice() } }];
  let n = 0;
  while (beams.some(b => b.li < letters.length) && n < 900) {
    const kids = [];
    for (const b of beams) for (let c = 0; c < (b.li >= letters.length ? 1 : C); c++) {
      const g = grow(b); if (!g.fresh.length) continue; const lf = g.fresh[g.fresh.length - 1];
      const k = { st: g.st, comps: g.comps, x: lf[0], y: lf[1], t: g.t, recent: b.recent.concat(g.fresh).slice(-150), li: b.li, phase: b.phase, freeT: b.freeT, cur: b.cur ? b.cur.slice() : null, part: b.part, done: b.done, cost: b.cost, pos: b.pos, taste: b.taste, k0: b.k0, Oexp: b.Oexp, placed: b.placed.slice(), hist: { prev: b.hist, pts: g.fresh } };
      advance(k, g.fresh); kids.push(k);
    }
    kids.sort((a, b2) => score(b2) - score(a)); beams = kids.slice(0, B); n++;
    if (WT && n % 8 === 0) beams.forEach(b => { b.taste = 0.6 * b.taste + 0.4 * taste(b.recent); });   // your taste, on the survivors
    if (n % 40 === 0) { const t = beams[0]; console.log('pulse', n, ' t', t.t.toFixed(1), 's  letters', t.done + '/' + letters.filter(Boolean).length, ' cost', t.cost.toFixed(3), ' part', t.part ? t.part.sc.toFixed(3) : '-'); }
  }
  const best = beams[0];
  const chunks = []; for (let h = best.hist; h; h = h.prev) chunks.unshift(h.pts); const line = [].concat(...chunks);
  const guide = []; best.placed.forEach(p => { const lt = letters.find(l => l && l.ch === p.ch), F = lt.forms.find(f => f.kind === p.kind) || lt.forms[0]; F.P.forEach((q, i) => guide.push([p.start[0] + p.k * (q[0] - F.P[0][0]), p.start[1] + p.k * (q[1] - F.P[0][1]), i === 0 ? 1 : 0])); });
  fs.writeFileSync(out, JSON.stringify({ text, guide, placed: best.placed.map(p => ({ ch: p.ch, d: +p.d.toFixed(3), k: +p.k.toFixed(1), kind: p.kind })), line: line.filter((p, k) => k % 2 === 0).map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]) }));
  console.log('done after', n, 'pulses:', best.placed.map(p => p.ch + ':' + p.d.toFixed(3) + '(' + p.kind + ')').join(' '));
})();
