// Infinite graffiti, first build: the plain walk runs free, and every so often throws a calligraffiti tag, then runs on.
// Tag letters are the designed skeletons (alphabet.js, sharp corners) played as the walk's own pulses: same timing, overlap and
// pressure, and at each sharp corner the pen nearly stops (a short pause) so the corner stays sharp. Between tags the walk is free:
// it leaves the last letter in its own way, wanders, and drifts towards where the next tag begins.
// Usage: node tagwalk.js <out.json> <seed> "<tag1>|<tag2>|..."   env: K (letter size), FREE (free pulses between tags)
const D = __dirname + '/../../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js'), ST = require(D + 'live/student.js');
const LT = require('../letters.js'), CG = require('./alphabet.js');
const [out, seed, tagsS] = process.argv.slice(2), tags = tagsS.split('|');
const K = +(process.env.K || 3.6), FREE = +(process.env.FREE || 22), PAUSE = +(process.env.PAUSE || 0.16);
const SJ = JSON.parse(fs.readFileSync(D + 'live/results/student_weights_b1.json')), F = ST.make(SJ);
const top = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB);
let rs = +seed * 977 + 3; const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280;

// lay the tags out along a wall: each a little higher or lower, a little bigger or smaller, with room for the walk in between
const plan = [], guide = []; let x = 0;
const free = (T, n, last) => plan.push({ type: 'free', T, arrive: last ? 0 : 3.5, gFar: 0.06, gNear: 0.35, minPulses: n, maxPulses: n + 14, last });
free([-6, -4], 10);
tags.forEach((tag, ti) => {
  const k = K * (0.85 + 0.35 * rnd()), y0 = (rnd() - 0.5) * 7, G = CG.word(tag);
  const runs = G.runs.map(Rn => Rn.map(p => [x + p[0] * k, y0 + p[1] * k]));
  const start = runs[0][0];
  // approach: arrive just before the first stroke, heading into it
  const r0 = runs[0], h0 = Math.atan2(r0[Math.min(4, r0.length - 1)][1] - r0[0][1], r0[Math.min(4, r0.length - 1)][0] - r0[0][0]);
  plan.push({ type: 'free', T: [start[0] - 1.0 * Math.cos(h0), start[1] - 1.0 * Math.sin(h0)], S: start, arrive: 0.8, gFar: 0.3, gNear: 0.9, minPulses: 0, maxPulses: 16, approach: true });
  const pulses = []; runs.forEach((Rn, i) => { const ps = LT.fitPulses(Rn, { Dt: 0.9, maxTurn: 0.9, minD: 0.2 }); if (i && ps.length) ps[0].pause = PAUSE; pulses.push(...ps); });
  plan.push({ type: 'group', pulses, pts: runs.flat() });
  runs.forEach(Rn => Rn.forEach((p, i) => guide.push([p[0], p[1], i === 0 ? 1 : 0])));
  // dots and crossbars: a quick flick each, after the word
  G.extras.forEach(e => { const a = e.kind === 'dot' ? [x + e.at[0] * k - 0.25, y0 + e.at[1] * k + 0.1] : [x + e.a[0] * k, y0 + e.a[1] * k], b = e.kind === 'dot' ? [x + e.at[0] * k + 0.2, y0 + e.at[1] * k - 0.1] : [x + e.b[0] * k, y0 + e.b[1] * k];
    const h = Math.atan2(b[1] - a[1], b[0] - a[0]);
    plan.push({ type: 'free', T: [a[0] - 0.8 * Math.cos(h), a[1] - 0.8 * Math.sin(h)], S: a, arrive: 0.7, gFar: 0.35, gNear: 1.0, minPulses: 0, maxPulses: 14, approach: true, air: true });   // pen nearly lifted
    plan.push({ type: 'group', pulses: LT.fitPulses([a, b], { Dt: 1, maxTurn: 1, minD: 0.05 }).map((p, i) => Object.assign(p, i ? {} : { pause: 0.08 })), pts: [a, b] }); });
  const end = runs[runs.length - 1][runs[runs.length - 1].length - 1];
  if (G.extras.length) plan.push({ type: 'free', T: [end[0] + 2, end[1] - 0.5], arrive: 1.5, gFar: 0.35, gNear: 0.9, minPulses: 0, maxPulses: 14, approach: true, air: true });   // pen lifted back to where the word ended
  x = end[0] + 14 + 6 * rnd();
  if (ti < tags.length - 1) free([(end[0] + x) / 2, (rnd() < 0.5 ? -1 : 1) * (6 + 4 * rnd())], FREE);   // the walk's own stretch between tags
});
free([x + 6, (rnd() - 0.5) * 8], 12, true);

const SC = LT.makePlanScript(plan, { jD: 0.06, jA: 0.04, zoneScale: 1 });
const E = L.create(W, R, top[0].g, +seed, { lambda: 2 }), o = E.parts[0].o; o.arena = 1e4; o.script = SC.script; o.sense = SC.sense;
(async () => {
  const score = async (wins) => wins.map((w, i) => { const o2 = F(R.raster(w, SJ.size)), pr = SC.progress(E.parts[i].st), b = 0.15 * pr.pulses + 0.6 * pr.legs - (pr.approach ? 0.1 : 0) * pr.dist; return [o2[1] + b, o2[2] + b]; });
  let line = [], segs = 0, tEnd = null;
  while (segs < 120) { const r = await E.segment(score, { K: 1, checks: 6 }); line = line.concat(r.pts); segs++; const st = E.parts[0].st; if (st.sc && st.sc.tEnd != null) { tEnd = st.sc.tEnd; break; } }
  if (tEnd != null) line = line.filter(p => p[3] <= tEnd * 1000 + 450);
  fs.writeFileSync(out, JSON.stringify({ tags, guide, line: line.filter((p, k) => k % 2 === 0).map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]) }));
  console.log('seed', seed, tEnd != null ? 'finished' : 'NOT finished', 'in', (line[line.length - 1][3] / 1000).toFixed(0), 's of drawing');
})();
