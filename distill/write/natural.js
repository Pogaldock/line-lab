// Plain natural walk (the Endless Line: walk + taste judge steering, nothing else). Usage: node natural.js <seed> <seconds> <out.json>
const D = __dirname + '/../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js'), ST = require(D + 'live/student.js');
const [seed, secs, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const SJ = JSON.parse(fs.readFileSync(D + 'live/results/student_weights_b1.json')), F = ST.make(SJ);
const top = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB);
const E = L.create(W, R, top[0].g, seed, { lambda: 2 }); if (process.env.ASPECT) E.parts.forEach(p => { p.o.arenaAspect = +process.env.ASPECT; });   // a wider page (shared o)
(async () => { let line = []; while (!line.length || line[line.length - 1][3] < secs * 1000) { const r = await E.segment(async ws => ws.map(w => { const o = F(R.raster(w, SJ.size)); return [o[1], o[2]]; }), { K: 1, checks: 6 }); line = line.concat(r.pts); }
  fs.writeFileSync(out, JSON.stringify(line.map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]))); console.log(seed, line.length, 'points'); })();
