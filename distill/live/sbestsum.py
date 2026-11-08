import json, sys, numpy as np
R = [r for f in sys.argv[1:] for r in json.load(open(f))]; out = {'n_lines': len(R)}
for c in ['plain', 'teacher', 'teacherBest', 'student', 'studentBest', 'student2', 'student2Best']:
    v = [r for r in R if r['cond'] == c]
    if not v: continue
    p = np.array([r['pGood'] for r in v]); out[c] = {'predicted_good_pct': round(100 * p.mean(), 1), 'se_pct': round(100 * p.std(ddof=1) / np.sqrt(len(p)), 1), 'share_windows_top5pct': round(float(np.mean([r['shareTop5'] for r in v])), 3), 'tries_per_segment': round(float(np.mean([r['attemptsPerSeg'] for r in v])), 2), 'n': len(v)}
# head-to-head on the same settings and seeds: second student minus first
key = lambda r: (r['s'], r['seed'])
for a, b in [('student2', 'student'), ('student2Best', 'studentBest')]:
    A = {key(r): r['pGood'] for r in R if r['cond'] == a}; B = {key(r): r['pGood'] for r in R if r['cond'] == b}; ks = sorted(set(A) & set(B))
    if ks: d = np.array([A[k] - B[k] for k in ks]); out[a + '_minus_' + b] = {'pct_points': round(100 * d.mean(), 1), 'se': round(100 * d.std(ddof=1) / np.sqrt(len(d)), 1), 'n': len(d)}
json.dump(out, open('live/results/bestof.json', 'w'), indent=1); print(json.dumps(out, indent=1))
