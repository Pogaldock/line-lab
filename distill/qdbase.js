// Baseline for the QD archive: the old settings pool scored the same way as the re-evaluated elites (8 fresh seeds, plain walk)
const Q = require('./qd.js'), fs = require('fs'), POOL = JSON.parse(fs.readFileSync('path_pool.json'));
(async () => { await Q.load(); const out = [];
  for (let i = 0; i < POOL.length; i++) { const e = await Q.evaluate(Q.clean(POOL[i]), Array.from({ length: 8 }, (_, k) => 7e8 + i * 101 + k * 31)); out.push(e); console.log(i, e.score.toFixed(3), e.cell); }
  fs.writeFileSync('qd_baseline.json', JSON.stringify(out)); })();
