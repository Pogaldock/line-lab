// Write a word with letters made of the walk's own pulses (letters.js), free walk between letter groups.
// Usage: node run_letters.js <capture.json> <seed> <out.json> [height=14] [gap=3] [jitter=1]
const D = __dirname + '/../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js'), ST = require(D + 'live/student.js'), LT = require('./letters.js');
const cap = JSON.parse(fs.readFileSync(process.argv[2])), seed = +process.argv[3], out = process.argv[4];
const height = +(process.argv[5] || 14), gap = +(process.argv[6] || 3), jit = +(process.argv[7] || 1);
const SJ = JSON.parse(fs.readFileSync(D + 'live/results/student_weights_b1.json')), F = ST.make(SJ);
const top = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB);
const groups = LT.buildScript(cap, height, gap), SC = LT.makeScript(groups, { jD: 0.07 * jit, jA: 0.05 * jit, gFree: +(process.env.GFREE || 0.35), minFree: +(process.env.MINFREE || 0), curlMode: !!process.env.CURL });
const E = L.create(W, R, top[0].g, seed, { lambda: 2 });
const o = E.parts[0].o; o.arena = 1e4; o.script = SC.script; o.sense = SC.sense;
const nP = groups.reduce((a, G) => a + G.pulses.length, 0);
(async () => {
  // taste (tiny judge) plus progress through the letters, minus distance still to travel when between groups
  const score = async (wins) => wins.map((w, i) => {
    const o2 = F(R.raster(w, SJ.size)), st = E.parts[i].st, sc = st.sc || { done: 0 };
    let b = 0.15 * sc.done;
    if (sc.phase === 'free') { const T = SC.target(sc.g); b -= 0.1 * Math.hypot(T[0] - st.ex, T[1] - st.ey); }
    return [o2[1] + b, o2[2] + b];
  });
  let line = [], segs = 0, tEnd = null;
  while (segs < 40) {
    const r = await E.segment(score, { K: 1, checks: 6 }); line = line.concat(r.pts); segs++;
    const sc = E.parts[0].st.sc; if (sc && sc.phase === 'done') { tEnd = sc.tEnd; break; }
  }
  if (tEnd != null) line = line.filter(p => p[3] <= tEnd * 1000 + 450);
  const guide = []; groups.forEach(G => G.pts.forEach((p, i) => guide.push([p[0], p[1], i === 0 ? 1 : 0])));
  fs.writeFileSync(out, JSON.stringify({ guide, pulses: nP, line: line.filter((p, k) => k % 2 === 0).map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]), secs: line.length ? line[line.length - 1][3] / 1000 : 0, done: tEnd != null }));
  console.log('seed', seed, nP, 'letter pulses,', tEnd != null ? 'finished' : 'NOT finished', 'in', (line[line.length - 1][3] / 1000).toFixed(0), 's');
})();
