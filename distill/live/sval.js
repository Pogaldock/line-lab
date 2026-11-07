// Validation: lines drawn by the live procedure under three conditions on the same settings and seeds
//   plain (no steering), teacher (big judges steer), student (tiny judge steers), all at pressure 2, commit every 6 checks.
// Every finished line is graded by the big judges on 8 s windows every 6 s. Usage: node live/sval.js <part> <parts> <out.json> [nSettings] [secs]
const D = __dirname + '/../'; process.chdir(D);
const fs = require('fs'), N = require(D + 'night.js'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require('./steer.js'), ort = require('onnxruntime-node');
const [part, parts, out] = [+process.argv[2], +process.argv[3], process.argv[4]], NS = +(process.argv[5] || 20), SECS = +(process.argv[6] || 60), SEG = 6;
(async () => { await N.load(); const SJ = JSON.parse(fs.readFileSync('student/student.json')), SZ = SJ.chosen_size, sess = await ort.InferenceSession.create('student/student.onnx', { intraOpNumThreads: 1 });
  const student = async (wins) => { const b = new Float32Array(wins.length * SZ * SZ); wins.forEach((w, k) => b.set(R.raster(w, SZ), k * SZ * SZ)); const o = (await sess.run({ ink: new ort.Tensor('float32', b, [wins.length, 1, SZ, SZ]) })).out.data; return wins.map((w, k) => Math.min(o[k * 3 + 1], o[k * 3 + 2])); };
  const teacher = async (wins) => (await N.judge(wins)).map(v => Math.min(v[1], v[2]));
  const top = JSON.parse(fs.readFileSync('night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB).slice(0, NS);
  const tasks = []; for (let s = 0; s < NS; s++) for (const seed of [1, 2]) for (const cond of ['plain', 'teacher', 'student']) tasks.push({ s, seed, cond });
  const res = [];
  for (let i = part; i < tasks.length; i += parts) { const T = tasks[i], t0 = Date.now(), E = L.create(W, R, top[T.s].g, 9000 + T.seed * 101 + T.s, { lambda: T.cond === 'plain' ? 0 : 2 });
    let line = [], tScore = 0; const nChecks = Math.round(SECS / 1.5);
    for (let k = 1; k <= nChecks; k++) { const wins = E.ask(); let a = Date.now(); const sc = T.cond === 'plain' ? wins.map(() => 0) : T.cond === 'teacher' ? await teacher(wins) : await student(wins); tScore += Date.now() - a; E.tell(sc); if (k % SEG === 0) line = line.concat(E.commit()); }
    const grade = []; for (let t = 12000; t <= line[line.length - 1][3]; t += 6000) grade.push(R.windowOf(line, t)); const o = await N.judge(grade), m = j => o.reduce((a, v) => a + v[j], 0) / o.length;
    res.push(Object.assign(T, { full: m(0), A: m(1), B: m(2), minAB: o.reduce((a, v) => a + Math.min(v[1], v[2]), 0) / o.length, n: o.length, scoreMsPerCheck: tScore / nChecks, secs: (Date.now() - t0) / 1000 }));
    console.log(T.cond, T.s, T.seed, res[res.length - 1].minAB.toFixed(2), res[res.length - 1].secs.toFixed(0) + 's');
  }
  fs.writeFileSync(out, JSON.stringify(res)); })();
