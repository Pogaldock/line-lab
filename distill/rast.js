// node rast.js <windows.json[.gz]> <size> <out prefix>  ->  <prefix>.u8 (N images, size×size, 0 = paper, 255 = ink) + <prefix>.json (ids, labels)
const fs = require('fs'), zlib = require('zlib'), R = require('./raster.js');
const [inp, S, out] = [process.argv[2], +process.argv[3], process.argv[4]];
let D = fs.readFileSync(inp); if (inp.endsWith('.gz')) D = zlib.gunzipSync(D); D = JSON.parse(D);
D = D.filter(r => (r.p || r.pts) && (r.p || r.pts).length > 10);
const buf = Buffer.alloc(D.length * S * S);
D.forEach((r, i) => { const im = R.raster(r.p || r.pts, S); for (let k = 0; k < S * S; k++) buf[i * S * S + k] = Math.round(im[k] * 255); });
fs.writeFileSync(out + '.u8', buf); fs.writeFileSync(out + '.json', JSON.stringify(D.map(r => { const m = {}; for (const k in r) if (!['pts', 'p', 'q', 'f'].includes(k)) m[k] = r[k]; m.label = r.label || null; return m; })));
console.log('rasterized', D.length, 'at', S);
