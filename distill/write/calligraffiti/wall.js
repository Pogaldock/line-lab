// A graffiti wall: the walk writes calligraffiti tags of mixed sizes, slightly rotated, layered and partly overlapping, the way
// a real wall builds up. Within a tag: chunks of 2-3 joined letters with short walk flourishes between them (never crossing the
// letters). Between tags: a short flourish out, then the pen nearly lifts (hairline) to cross the wall, then a flourish in.
// Usage: node wall.js <out.json> <seed> <nTags> "<word1>|<word2>|..."   env: WW, WH (wall size in walk units)
const D = __dirname + '/../../'; const fs = require('fs'), W = require(D + 'walkmods.js'), R = require(D + 'raster.js'), L = require(D + 'live/steer.js'), ST = require(D + 'live/student.js');
const LT = require('../letters.js'), CG = require('./alphabet.js');
const [out, seed, nTags, wordsS] = process.argv.slice(2), words = wordsS.split('|');
const WW = +(process.env.WW || 110), WH = +(process.env.WH || 60), PAUSE = 0.16;
const SJ = JSON.parse(fs.readFileSync(D + 'live/results/student_weights_b1.json')), F = ST.make(SJ);
const top = JSON.parse(fs.readFileSync(D + 'night_results/final.json')).settings.filter(s => s.group === 'new').sort((a, b) => b.min_AB - a.min_AB);
let rs = +seed * 977 + 3; const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280;

// one tag: chunked skeleton runs, scaled by k, rotated by rot around its start, placed with its start at (x, y)
function tagRuns(word, k, rot, x, y) {
  const C = []; let i = 0; while (i < word.length) { let n = rnd() < 0.5 ? 2 : 3; if (word.length - i - n === 1) n++; C.push(word.slice(i, i + n)); i += n; }
  const c = Math.cos(rot), s = Math.sin(rot), T = (p) => [x + (p[0] * c - p[1] * s) * k, y + (p[0] * s + p[1] * c) * k];
  let ox = 0; return C.map(ch => { const G = CG.word(ch); const runs = G.runs.map(Rn => Rn.map(p => T([p[0] + ox, p[1]]))), extras = G.extras.map(e => e.kind === 'dot' ? { kind: 'dot', at: T([e.at[0] + ox, e.at[1]]) } : { kind: 'bar', a: T([e.a[0] + ox, e.a[1]]), b: T([e.b[0] + ox, e.b[1]]) }); ox += G.width + 0.45; return { runs, extras }; });
}
const bbox = (P) => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

// layout: each new tag near the last one, overlapping existing tags a little (5-30% of its area), inside the wall
const placed = []; let last = [WW * 0.2, WH * 0.5];
for (let t = 0; t < +nTags; t++) {
  const word = words[Math.floor(rnd() * words.length)], big = rnd() < 0.2, k = big ? 5.5 + 2.5 * rnd() : 2.2 + 2.2 * rnd(), rot = (rnd() - 0.5) * 0.3;
  let best = null;
  for (let tr = 0; tr < 40; tr++) {
    const x = rnd() * WW * 0.85, y = 6 + rnd() * (WH - 10), saved = rs, ch = tagRuns(word, k, rot, x, y); rs = saved;
    const bb = bbox(ch.flatMap(q => q.runs.flat())); if (bb[2] > WW || bb[3] > WH + 4 || bb[1] < -4) continue;
    const area = (bb[2] - bb[0]) * (bb[3] - bb[1]), ov = placed.reduce((a, p) => a + overlap(bb, p.bb), 0) / area;
    const sc = Math.abs(ov - 0.15) * 3 + Math.hypot(x - last[0], y - last[1]) / WW;
    if (!best || sc < best.sc) best = { sc, x, y, bb };
  }
  if (!best) continue;
  const chunks = tagRuns(word, k, rot, best.x, best.y);
  placed.push({ word, k, rot, bb: best.bb, chunks, pink: rnd() < 0.25 });
  const e = chunks[chunks.length - 1].runs.flat().slice(-1)[0]; last = e;
}

// plan: tags in order; flourishes and near-lifts between
const plan = [], guide = [];
const free = (T, n, o2) => plan.push(Object.assign({ type: 'free', T, arrive: 2.5, gFar: 0.15, gNear: 0.5, minPulses: n, maxPulses: n + 10 }, o2 || {}));
const approach = (start, run, air) => { const h = Math.atan2(run[Math.min(4, run.length - 1)][1] - run[0][1], run[Math.min(4, run.length - 1)][0] - run[0][0]); plan.push({ type: 'free', T: [start[0] - Math.cos(h), start[1] - Math.sin(h)], S: start, arrive: 0.8, gFar: 0.3, gNear: 0.9, minPulses: 0, maxPulses: air ? 60 : 16, approach: true, air }); };
placed.forEach((P, ti) => {
  P.chunks.forEach((Ck, ci) => {
    const start = Ck.runs[0][0];
    if (ci === 0 && ti > 0) { const prev = plan.length ? null : null; approach(start, Ck.runs[0], true); }   // cross the wall pen-up, land heading into the tag
    else if (ci === 0) approach(start, Ck.runs[0], false);
    else { free([start[0] - P.k * 0.4, start[1] + (rnd() < 0.5 ? -1 : 1) * P.k * 1.1], 5); approach(start, Ck.runs[0], false); }   // flourish between chunks
    const pulses = []; Ck.runs.forEach((Rn, i) => { const ps = LT.fitPulses(Rn, { Dt: 0.9, maxTurn: 0.9, minD: 0.2 }); if (i && ps.length) ps[0].pause = PAUSE; pulses.push(...ps); });
    plan.push({ type: 'group', pulses, pts: Ck.runs.flat(), tag: ti });
    Ck.runs.forEach(Rn => Rn.forEach((p, i) => guide.push([p[0], p[1], i === 0 ? 1 : 0])));
    Ck.extras.forEach(ex => { const a = ex.kind === 'dot' ? [ex.at[0] - 0.08 * P.k, ex.at[1] + 0.03 * P.k] : ex.a, b = ex.kind === 'dot' ? [ex.at[0] + 0.06 * P.k, ex.at[1] - 0.03 * P.k] : ex.b, h = Math.atan2(b[1] - a[1], b[0] - a[0]);
      plan.push({ type: 'free', T: [a[0] - 0.8 * Math.cos(h), a[1] - 0.8 * Math.sin(h)], S: a, arrive: 0.6, gFar: 0.35, gNear: 1.0, minPulses: 0, maxPulses: 14, approach: true, air: true });
      plan.push({ type: 'group', pulses: LT.fitPulses([a, b], { Dt: 1, maxTurn: 1, minD: 0.05 }).map((p, i) => Object.assign(p, i ? {} : { pause: 0.08 })), pts: [a, b] }); });
  });
  const e = P.chunks[P.chunks.length - 1].runs.flat().slice(-1)[0];
  free([e[0] + P.k * 1.2, e[1] + (rnd() < 0.5 ? -1 : 1) * P.k * 0.8], 6);   // a flourish out of the tag
});
free([last[0] + 8, last[1]], 8, { last: true, arrive: 0, gFar: 0.05, gNear: 0.2 });

const SC = LT.makePlanScript(plan, { jD: 0.06, jA: 0.04, zoneScale: 1 });
const E = L.create(W, R, top[0].g, +seed, { lambda: 2 }), o = E.parts[0].o; o.arena = 1e4; o.script = SC.script; o.sense = SC.sense; o.modeBias = Object.assign({}, o.modeBias, { corner: -6 }); o.jagRate = 0;
(async () => {
  const cell = 0.5, inkCache = {};
  function inkUpTo(i) { if (inkCache[i]) return inkCache[i]; const g = new Set(); plan.slice(0, i).forEach(Lg => { if (Lg.type === 'group') Lg.pts.forEach(p => { const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) g.add((cx + a) + ',' + (cy + b)); }); }); return (inkCache[i] = g); }
  const crossing = (C) => { const sc = C.st.sc; if (!sc || sc.i >= plan.length) return 0; const Lg = plan[sc.i]; if (Lg.type !== 'free' || Lg.approach) return 0;
    const g = inkUpTo(sc.i), P = C.pts, T = P[P.length - 1][3]; let n = 0, hit = 0; for (let k = P.length - 1; k >= 0 && P[k][3] > T - 1500; k -= 3) { n++; if (g.has(Math.floor(P[k][0] / cell) + ',' + Math.floor(P[k][1] / cell))) hit++; } return n ? hit / n : 0; };
  const score = async (wins) => wins.map((w, i) => { const C = E.parts[i], o2 = F(R.raster(w, SJ.size)), pr = SC.progress(C.st), b = 0.15 * pr.pulses + 0.6 * pr.legs - (pr.approach ? 0.1 : 0) * pr.dist - 4 * crossing(C); return [o2[1] + b, o2[2] + b]; });
  let line = [], segs = 0, tEnd = null;
  while (segs < 400) { const r = await E.segment(score, { K: 1, checks: 6 }); line = line.concat(r.pts); segs++; const st = E.parts[0].st; if (st.sc && st.sc.tEnd != null) { tEnd = st.sc.tEnd; break; } }
  if (tEnd != null) line = line.filter(p => p[3] <= tEnd * 1000 + 450);
  const log = (E.parts[0].st.sc.log || []).map(([t, t0]) => [t, Math.round(t0 * 1000)]);
  fs.writeFileSync(out, JSON.stringify({ tags: placed.map(p => ({ word: p.word, k: +p.k.toFixed(2), pink: p.pink })), log, line: line.filter((p, k) => k % 2 === 0).map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3), Math.round(p[3])]) }));
  console.log('seed', seed, placed.length, 'tags', tEnd != null ? 'finished' : 'NOT finished', 'in', (line[line.length - 1][3] / 1000).toFixed(0), 's of drawing');
})();
