// Proves spacingFast == spacing (the 4 used fields) on every call the walk makes while drawing real lines, and times both.
const D = __dirname + '/../', fs = require('fs'); let src = fs.readFileSync(D + 'walkmods.js', 'utf8');
const F = require('./spacingfast.js').spacingFast; let calls = 0, bad = 0, tOld = 0, tNew = 0;
global.__chk = (ctx) => { let a = process.hrtime.bigint(); const o = global.__spacing(ctx); tOld += Number(process.hrtime.bigint() - a); a = process.hrtime.bigint(); const n = F(ctx); tNew += Number(process.hrtime.bigint() - a); calls++;
  if (o == null || n == null) { if (o !== n) bad++; return o; } for (const k of ['sp_touch', 'sp_cross', 'sp_cover', 'sp_passGap']) if (o[k] !== n[k]) { bad++; if (bad < 5) console.log('diff', k, o[k], n[k]); break; } return o; };
src = src.replace('var sp = spacing(ctx) || {}', 'var sp = global.__chk(ctx) || {}').replace('function spacing(pts) {', 'global.__spacing = spacing; function spacing(pts) {');
const m = { exports: {} }; new Function('module', 'exports', 'require', 'self', src)(m, m.exports, require, global);
const W = m.exports, R = require(D + 'raster.js'), L = require('./steer.js'), S = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings;
for (let s = 0; s < 6; s++) { const E = L.create(W, R, S[s * 25].g, 11 + s, { lambda: 0 }); for (let k = 0; k < 8; k++) E.ask(); }
console.log('calls', calls, 'mismatches', bad, '| ms per call old', (tOld / calls / 1e6).toFixed(2), 'new', (tNew / calls / 1e6).toFixed(2));
