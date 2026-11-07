// Write a phrase: words in the walk's own pulses, spaced far apart, with free walk before, between, around and after them.
// Usage: node run_phrase.js <out.json> <seed> <capture1.json> [capture2.json ...]
const D = __dirname + '/../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js'), ST = require(D + 'live/student.js'), LT = require('./letters.js');
const out = process.argv[2], seed = +process.argv[3], caps = process.argv.slice(4).map(f => JSON.parse(fs.readFileSync(f)));
const SJ = JSON.parse(fs.readFileSync(D + 'live/results/student_weights_b1.json')), F = ST.make(SJ);
const top = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB);
const { plan, guide } = LT.buildPlan(caps, { seed, height: +(process.env.H || 14), groupGap: +(process.env.GG || 4), up: +(process.env.UP || 17), excursions: +(process.env.EX || 1), wordGap: +(process.env.WGAP || 30), zone: +(process.env.ZONE || 10) }), SC = LT.makePlanScript(plan, { jD: 0.1, jA: 0.075, zoneScale: +(process.env.ZS || 3) });
const E = L.create(W, R, top[0].g, seed, { lambda: 2 });
const o = E.parts[0].o; o.arena = 1e4; o.script = SC.script; o.sense = SC.sense;
(async () => {
  // taste first; progress through the plan; on free legs only a light cost for distance left (heavier on the last approach to a letter)
  const score = async (wins) => wins.map((w, i) => {
    const o2 = F(R.raster(w, SJ.size)), pr = SC.progress(E.parts[i].st);
    const b = 0.15 * pr.pulses + 0.6 * pr.legs - (pr.approach ? 0.1 : 0) * pr.dist;   // free zones: no distance cost at all, taste decides
    return [o2[1] + b, o2[2] + b];
  });
  let line = [], segs = 0, tEnd = null;
  while (segs < 80) { const r = await E.segment(score, { K: 1, checks: 6 }); line = line.concat(r.pts); segs++; const st = E.parts[0].st; if (st.sc && st.sc.tEnd != null) { tEnd = st.sc.tEnd; break; } }
  if (tEnd != null) line = line.filter(p => p[3] <= tEnd * 1000 + 450);
  fs.writeFileSync(out, JSON.stringify({ guide, line: line.filter((p, k) => k % 2 === 0).map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]), secs: line[line.length - 1][3] / 1000, done: tEnd != null }));
  console.log('seed', seed, tEnd != null ? 'finished' : 'NOT finished', 'in', (line[line.length - 1][3] / 1000).toFixed(0), 's of drawing');
})();
