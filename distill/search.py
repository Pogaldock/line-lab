# One island of the overnight settings search: CMA-MAE (pyribs) over the walk's 24 settings (scaled to 0..1).
# Objective: mean over 2 seeds of min(judge A, judge B) on the SMC-steered line at the chosen pressure (pessimistic of two judges).
# Kinds of line: the judge's own two image-feature axes (d1, d2), a 16 x 16 grid.
# CMA-MAE's soft cell thresholds (archive learning rate) keep it optimising inside a cell for a while instead of jumping on every
# lucky score, which also damps noise; the winners are re-scored on 8 fresh seeds afterwards anyway.
# Usage: python search.py <island> <minutes> <lambda> <out.json>
import json, subprocess, sys, time, numpy as np
from ribs.archives import GridArchive
from ribs.emitters import EvolutionStrategyEmitter
from ribs.schedulers import Scheduler
island, minutes, lam, out = int(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
import os
NW, SEEDS, BATCH = int(os.environ.get('NW', 4)), int(os.environ.get('SEEDS', 2)), int(os.environ.get('BATCH', 6))
J = json.load(open('onnx_night/judges.json'))
lo, hi = np.array(J['desc_q']['2']), np.array(J['desc_q']['98']); pad = 0.1 * (hi - lo); lo, hi = lo - pad, hi + pad
starts = [e['g'] for e in json.load(open('qd_pick.json'))] + [e['g'] for e in json.load(open('qd_archive.json')).values()]
json.dump(starts, open(f'starts_{island}.json', 'w'))
X0 = np.array(json.loads(subprocess.check_output(['node', 'night.js', 'encode', f'starts_{island}.json'])))
rng = np.random.default_rng(island)
DIM = X0.shape[1]
archive = GridArchive(solution_dim=DIM, dims=[16, 16], ranges=list(zip(lo, hi)), learning_rate=0.02, threshold_min=-3.0, seed=island)
result = GridArchive(solution_dim=DIM, dims=[16, 16], ranges=list(zip(lo, hi)), seed=island)
emitters = [EvolutionStrategyEmitter(archive, x0=X0[rng.integers(len(X0))], sigma0=0.1, ranker='imp', selection_rule='mu', restart_rule='basic',
                                     bounds=[(0.0, 1.0)] * DIM, batch_size=BATCH, seed=island * 100 + k) for k in range(4)]
sched = Scheduler(archive, emitters, result_archive=result)
workers = [subprocess.Popen(['node', 'night.js', 'worker'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1) for _ in range(NW)]
seed_ctr = island * 10_000_000
def evaluate(xs):
    global seed_ctr
    per = [[] for _ in workers]
    for i, x in enumerate(xs):
        seeds = [seed_ctr + k for k in range(SEEDS)]; seed_ctr += SEEDS
        per[i % NW].append(i); workers[i % NW].stdin.write(json.dumps({'id': i, 'x': [float(v) for v in x], 'seeds': seeds, 'lambda': lam, 'steer': 'min'}) + '\n')
    res = [None] * len(xs)
    for w, ids in zip(workers, per):
        for _ in ids: r = json.loads(w.stdout.readline()); res[r['id']] = r
    return res
log, t0, it, allx = [], time.time(), 0, []
while time.time() - t0 < minutes * 60:
    xs = sched.ask(); res = evaluate(xs)
    obj = np.array([r['obj'] for r in res]); meas = np.array([r['desc'] for r in res])
    sched.tell(obj, meas); it += 1
    for x, r in zip(xs, res): allx.append({'x': [round(float(v), 4) for v in x], 'obj': round(r['obj'], 4), 'desc': [round(v, 4) for v in r['desc']], 'full': round(r['full'], 4), 'A': round(r['A'], 4), 'B': round(r['B'], 4)})
    st = result.stats
    log.append({'it': it, 'evals': len(allx), 'cells': int(st.num_elites), 'qd': float(st.qd_score), 'best': float(st.obj_max) if st.obj_max is not None else None, 'mean': float(st.obj_mean) if st.obj_mean is not None else None, 'min_since_start': round((time.time() - t0) / 60, 1)})
    print(log[-1], flush=True)
    if it % 5 == 0 or it == 1 or time.time() - t0 >= minutes * 60:
        d = result.data(); elites = [{'x': [round(float(v), 4) for v in s], 'obj': float(o), 'desc': [float(v) for v in m]} for s, o, m in zip(d['solution'], d['objective'], d['measures'])]
        json.dump({'island': island, 'lambda': lam, 'log': log, 'elites': elites, 'evals': allx}, open(out, 'w'))
for w in workers: w.stdin.close()
print('done', it, 'iterations', len(allx), 'evaluations')
