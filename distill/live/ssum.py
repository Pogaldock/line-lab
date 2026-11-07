# Summarise validation: mean grade per condition, paired differences (same setting and seed) with standard errors.
import json, sys, glob, numpy as np
R = [r for f in sys.argv[1:] for r in json.load(open(f))]
by = {}; [by.setdefault((r['s'], r['seed']), {}).__setitem__(r['cond'], r) for r in R]
out = {'n_lines': len(R)}
for c in ['plain', 'teacher', 'student']:
    v = [r for r in R if r['cond'] == c]; out[c] = {k: round(float(np.mean([r[k] for r in v])), 3) for k in ['full', 'A', 'B', 'minAB']}; out[c]['n'] = len(v)
    if c != 'plain': out[c]['score_ms_per_check'] = round(float(np.mean([r['scoreMsPerCheck'] for r in v])), 1)
def paired(a, b, k='minAB'):
    d = np.array([g[a][k] - g[b][k] for g in by.values() if a in g and b in g]); return {'mean': round(float(d.mean()), 3), 'se': round(float(d.std(ddof=1) / np.sqrt(len(d))), 3), 'n': len(d)}
out['student_minus_plain'] = paired('student', 'plain'); out['teacher_minus_plain'] = paired('teacher', 'plain'); out['student_minus_teacher'] = paired('student', 'teacher')
gain_t, gain_s = out['teacher_minus_plain']['mean'], out['student_minus_plain']['mean']; out['share_of_teacher_gain'] = round(gain_s / gain_t, 3) if gain_t else None
json.dump(out, open('live/results/val.json', 'w'), indent=1); print(json.dumps(out, indent=1))
