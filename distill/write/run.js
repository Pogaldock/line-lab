// Mockup: write a Hand Bank word with the live engine. Pull g bends each pulse towards the word; the drafts are scored every 1.5 s on
// taste (tiny judge, min of A and B) plus progress along the word minus distance from it. Usage: node run.js <capture.json> <g> <seed> <out.json>
const D = __dirname + '/../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js'), ST = require(D + 'live/student.js'), { guideFrom, makeSense } = require('./guide.js');
const [cap, g, seed, out] = [JSON.parse(fs.readFileSync(process.argv[2])), +process.argv[3], +process.argv[4], process.argv[5]];
const SJ = JSON.parse(fs.readFileSync(D + 'live/results/student_weights_b1.json')), F = ST.make(SJ);
const top = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB);
const guide = guideFrom(cap, +(process.argv[7] || 14), +(process.argv[8] || 1)), E = L.create(W, R, top[+(process.argv[6] || 0)].g, seed, { lambda: 2 });
E.parts[0].o.arena = 1e4; const ADAPT = +(process.env.ADAPT || 0), DEVP = +(process.env.DEVP || 0.8);
E.parts[0].o.sense = makeSense(guide, g, 1.5, ADAPT);
(async () => {
  const score = async (wins) => wins.map((w, i) => { const o = F(R.raster(w, SJ.size)), st = E.parts[i].st, bonus = 0.15 * (st.gc || 0) * 0.05 - DEVP * (st.gdev || 0); return [o[1] + bonus, o[2] + bonus]; });
  let line = [], segs = 0; while (segs < 60) { const r = await E.segment(score, { K: 1, checks: 6 }); line = line.concat(r.pts); segs++; if ((E.parts[0].st.gc || 0) >= guide.G.length - 3) break; }
  { const e = guide.G[guide.G.length - 1]; let bi = line.length - 1, bd = 1e9; for (let k = Math.floor(line.length * 0.66); k < line.length; k++) { const d = (line[k][0] - e.x) ** 2 + (line[k][1] - e.y) ** 2; if (d < bd) { bd = d; bi = k; } } line = line.slice(0, bi + 1); }
  const ends = E.parts[0].st.gc || 0; const devs = []; for (let k = 0; k < line.length; k += 8) { const p = line[k]; let bd = 1e9; for (const q of guide.G) { const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2; if (d < bd) bd = d; } devs.push(Math.sqrt(bd)); }
  const stray = devs.reduce((a, b) => a + b, 0) / devs.length;   // mean distance from your letters, in pen units (lower = more legible)
  fs.writeFileSync(out, JSON.stringify({ stray, g, guide: guide.G.map(p => [p.x, p.y, p.air ? 1 : 0]), line: line.filter((p, k) => k % 2 === 0).map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]), done: ends / guide.G.length, secs: line.length ? line[line.length - 1][3] / 1000 : 0 }));
  console.log('g', g, 'reached', (100 * ends / guide.G.length).toFixed(0) + '% of the word in', (line[line.length - 1][3] / 1000).toFixed(0), 's of drawing');
})();
