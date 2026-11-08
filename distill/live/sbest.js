// "Best only" validation. Same settings and seeds, five versions of each line (all via LiveSteer.segment, 9 s segments):
//   plain (no steering) | teacher (big judges steer) | teacherBest (big judges, up to K redraws per segment until z >= THR)
//   student (tiny judge steers) | studentBest (tiny judge, same redraw rule)
// Graded by the big judges on 8 s windows every 6 s, converted to the predicted chance you'd rate the line good (calib.json,
// capped at 0.90, the highest rate seen in your ratings). Note: teacherBest is graded by the same judges that chose it (optimistic);
// studentBest is the fairer number. Usage: node live/sbest.js <part> <parts> <out> <studentDir> [nSettings] [secs] [K] [thr]
const D = __dirname + '/../'; process.chdir(D);
const fs = require('fs'), N = require(D + 'night.js'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require('./steer.js'), ST = require('./student.js'), cal = require(process.env.CALIB ? D + process.env.CALIB : './calib.json');   // CALIB: calibration for another big judge (e.g. onnx2/calib2.json)
const [part, parts, out, sdir] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5]], NS = +(process.argv[6] || 20), SECS = +(process.argv[7] || 54), K = +(process.argv[8] || 3), THR = +(process.argv[9] || 1.5);
const P = (z) => Math.min(0.9, 1 / (1 + Math.exp(-(cal.a * z + cal.b)))), zOf = (v) => ((v[1] - cal.mA) / cal.sA + (v[2] - cal.mB) / cal.sB) / 2;
(async () => { await N.load(); const SJ = JSON.parse(fs.readFileSync(sdir + '/student_weights.json')), F = ST.make(SJ);
  const teacher = async (w) => (await N.judge(w)).map(v => [v[1], v[2]]), student = async (w) => w.map(x => { const o = F(R.raster(x, SJ.size)); return [o[1], o[2]]; });
  const top = JSON.parse(fs.readFileSync('night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB).slice(0, NS);
  const conds = { plain: [student, 0, 1], teacher: [teacher, 2, 1], teacherBest: [teacher, 2, K], student: [student, 2, 1], studentBest: [student, 2, K] };
  const tasks = []; for (let s = 0; s < NS; s++) for (const seed of [1, 2]) for (const c in conds) tasks.push({ s, seed, cond: c });
  const res = [];
  for (let i = part; i < tasks.length; i += parts) { const T = tasks[i], [fn, lam, k] = conds[T.cond], t0 = Date.now(), E = L.create(W, R, top[T.s].g, 9000 + T.seed * 101 + T.s, { lambda: lam });
    let line = [], att = 0, segs = 0; while (!line.length || line[line.length - 1][3] < SECS * 1000) { const r = await E.segment(fn, { K: k, thr: THR, cal }); line = line.concat(r.pts); att += r.attempts; segs++; }
    const grade = []; for (let t = 12000; t <= line[line.length - 1][3]; t += 6000) grade.push(R.windowOf(line, t)); const o = await N.judge(grade), z = o.map(zOf);
    res.push(Object.assign(T, { pGood: z.reduce((a, v) => a + P(v), 0) / z.length, shareTop5: z.filter(v => v >= THR).length / z.length, z: z.reduce((a, b) => a + b, 0) / z.length, attemptsPerSeg: att / segs, n: z.length, secs: (Date.now() - t0) / 1000 }));
    const r = res[res.length - 1]; console.log(T.cond, T.s, T.seed, 'P(good)', r.pGood.toFixed(2), 'tries/seg', r.attemptsPerSeg.toFixed(1), r.secs.toFixed(0) + 's'); }
  fs.writeFileSync(out, JSON.stringify(res)); })();
