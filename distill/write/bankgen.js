// Path bank for the photo-to-line videos: the Endless Line walk (taste-judge steered) run once per picked good setting.
// Usage: node bankgen.js <qd_pick index> <seconds> <out.json>
const D = __dirname + '/../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js'), ST = require(D + 'live/student.js');
const [idx, secs, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const SJ = JSON.parse(fs.readFileSync(D + 'live/results/student_weights_b1.json')), F = ST.make(SJ);
const picks = JSON.parse(fs.readFileSync(D + 'qd_pick.json'));
const g = picks[idx % picks.length].g;
const E = L.create(W, R, g, 1000 + idx, { lambda: 2 });
(async () => { let line = []; while (!line.length || line[line.length - 1][3] < secs * 1000) { const r = await E.segment(async ws => ws.map(w => { const o = F(R.raster(w, SJ.size)); return [o[1], o[2]]; }), { K: 1, checks: 6 }); line = line.concat(r.pts); }
  fs.writeFileSync(out, JSON.stringify(line.map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]))); console.log(idx, line.length, 'points'); })();
