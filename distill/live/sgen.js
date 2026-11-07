// Training data for the student judge: the live procedure (SMC, commit every SEG checks) steered by the big judges at a random
// pressure; every particle window the judges see is saved as 64 px and 96 px images (uint8) with all five judge outputs.
// Usage: node live/sgen.js <part> <minutes> <outdir>
const D = __dirname + '/../'; process.chdir(D);
const fs = require('fs'), zlib = require('zlib'), N = require(D + 'night.js'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require('./steer.js');
const [part, minutes, out] = [+process.argv[2], +process.argv[3], process.argv[4]], SEG = 6, LINE_CHECKS = 40;
(async () => { await N.load(); fs.mkdirSync(out, { recursive: true });
  const S = JSON.parse(fs.readFileSync('night_results/final.json')).settings.map(s => s.g).concat(JSON.parse(fs.readFileSync('path_pool.json')).map(N.clean));
  const rnd = W.LineGen.mulberry(1000 + part), x64 = [], x96 = [], y = [], meta = []; const t0 = Date.now(); let line = 0;
  while (Date.now() - t0 < minutes * 60000) {
    const gi = Math.floor(rnd() * S.length), lam = [0, 1, 2, 2, 3][Math.floor(rnd() * 5)], seed = part * 100000 + line, E = L.create(W, R, S[gi], seed, { lambda: lam });
    for (let k = 1; k <= LINE_CHECKS && Date.now() - t0 < minutes * 60000; k++) {
      const wins = E.ask(), o = await N.judge(wins);
      wins.forEach((w, i) => { const a = R.raster(w, 64), b = R.raster(w, 96); x64.push(Buffer.from(a.map(v => Math.round(v * 255)))); x96.push(Buffer.from(b.map(v => Math.round(v * 255)))); y.push(o[i]); meta.push([part, line, k, i, gi, lam]); });
      E.tell(o.map(v => Math.min(v[1], v[2]))); if (k % SEG === 0) E.commit();
    }
    line++; if (line % 5 === 0) console.log('part', part, 'lines', line, 'samples', y.length, ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  fs.writeFileSync(out + '/x64.u8.gz', zlib.gzipSync(Buffer.concat(x64))); fs.writeFileSync(out + '/x96.u8.gz', zlib.gzipSync(Buffer.concat(x96)));
  fs.writeFileSync(out + '/y.json', JSON.stringify(y.map(v => v.map(z => +z.toFixed(4))))); fs.writeFileSync(out + '/meta.json', JSON.stringify(meta));
  console.log('done part', part, 'samples', y.length);
})();
