const D = __dirname + '/../'; process.chdir(D); const N = require(D + 'night.js'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require('./steer.js'), fs = require('fs');
(async () => { await N.load(); const g = JSON.parse(fs.readFileSync('night_results/final.json')).settings[0].g; const S = L.create(W, R, g, 5, { lambda: 2 });
  let tw = 0, tj = 0, n = 0; for (let k = 0; k < 10; k++) { let a = Date.now(); const wins = S.ask(); tw += Date.now() - a; a = Date.now(); const o = await N.judge(wins); tj += Date.now() - a; n += wins.length; S.tell(o.map(v => Math.min(v[1], v[2]))); }
  const t0 = Date.now(); for (let i = 0; i < 64; i++) R.raster(R.windowOf(S.parts[0].pts), 96); const tr = (Date.now() - t0) / 64;
  console.log('walk ms per 1.5s step (8 particles)', (tw / 10).toFixed(0), '| judge ms per image', (tj / n).toFixed(1), '| raster96 ms', tr.toFixed(2), '| committed pts', S.committed(-1).length); })();
