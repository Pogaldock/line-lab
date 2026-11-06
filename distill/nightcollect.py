# Glue for the overnight run.
#   python nightcollect.py pick  <dose files...>        -> night_results/dose_summary.json, prints the chosen pressure (lambda)
#   python nightcollect.py cands <island files...>      -> cands.json (best setting per kind of line, top 120) + old settings for comparison
#   python nightcollect.py final <rescore files...>     -> night_results/final.json and night_results/sheet_lines.json
import json, sys, os, numpy as np
from collections import defaultdict
mode, files = sys.argv[1], sys.argv[2:]
os.makedirs('night_results', exist_ok=True)
def load_all(fs):
    out = []
    for f in fs:
        try: out.append(json.load(open(f)))
        except Exception as e: print('skip', f, e)
    return out
if mode == 'pick':
    rows = [r for d in load_all(files) for r in d]; by = defaultdict(list)
    for r in rows: by[r['lambda']].append(r)
    S = []
    for lam in sorted(by):
        o = np.array([r['out'] for r in by[lam]]); n = len(o)
        S.append({'lambda': lam, 'n': n, 'full': o[:, 0].mean(), 'A': o[:, 1].mean(), 'B': o[:, 2].mean(), 'B_se': o[:, 2].std() / np.sqrt(n),
                  'spread_d1': o[:, 3].std(), 'spread_d2': o[:, 4].std(), 'form': float(np.mean([r['form'] for r in by[lam]])), 'resamples': float(np.mean([r['resamples'] for r in by[lam]]))})
    # pressure: the referee (judge B, never used for steering) peaks somewhere; take the lowest lambda whose referee score is within
    # one standard error of that peak, i.e. as little pressure as gets (statistically) the full benefit
    peak = max(S, key=lambda s: s['B']); ok = [s for s in S if s['B'] >= peak['B'] - peak['B_se'] and s['lambda'] > 0]
    lam = min(ok, key=lambda s: s['lambda'])['lambda'] if ok else 1.0
    json.dump({'summary': S, 'peak_lambda': peak['lambda'], 'chosen_lambda': lam, 'samples': [r for r in rows if r.get('q')][:200]}, open('night_results/dose_summary.json', 'w'))
    for s in S: print({k: round(v, 3) if isinstance(v, float) else v for k, v in s.items()})
    print('peak', peak['lambda'], 'chosen', lam); open('lambda.txt', 'w').write(str(lam))
elif mode == 'cands':
    isl = load_all(files); ev = [dict(e, island=d['island']) for d in isl for e in d['evals']]
    J = json.load(open('onnx_night/judges.json')); lo, hi = np.array(J['desc_q']['2']), np.array(J['desc_q']['98']); pad = 0.1 * (hi - lo); lo, hi = lo - pad, hi + pad
    cell = lambda d: tuple(np.clip(((np.array(d) - lo) / (hi - lo) * 16).astype(int), 0, 15))
    best = {}
    for e in ev:
        c = cell(e['desc'])
        if c not in best or e['obj'] > best[c]['obj']: best[c] = e
    top = sorted(best.values(), key=lambda e: -e['obj'])[:120]
    C = [{'id': f'new-{k}', 'x': e['x'], 'obj': e['obj'], 'island': e['island'], 'k': k} for k, e in enumerate(top)]
    C += [{'id': f'old-{k}', 'g': g, 'k': 500 + k} for k, g in enumerate(json.load(open('path_pool.json')))]
    C += [{'id': f'pick-{k}', 'g': e['g'], 'k': 600 + k} for k, e in enumerate(json.load(open('qd_pick.json')))]
    json.dump(C, open('cands.json', 'w'))
    logs = [{'island': d['island'], 'log': d['log']} for d in isl]
    json.dump({'evaluations': len(ev), 'cells_found': len(best), 'islands': logs}, open('night_results/search_log.json', 'w'))
    print('evaluations', len(ev), 'cells', len(best), 'candidates', len(C))
elif mode == 'final':
    R = [r for d in load_all(files) for r in d]
    for r in R:
        o = np.array(r['outs']); r['full'] = float(o[:, 0].mean()); r['A'] = float(o[:, 1].mean()); r['B'] = float(o[:, 2].mean())
        r['min_AB'] = float(np.minimum(o[:, 1], o[:, 2]).mean()); r['se'] = float(np.minimum(o[:, 1], o[:, 2]).std() / np.sqrt(len(o))); r['desc'] = o[:, 3:].mean(0).tolist()
        r['group'] = r['id'].split('-')[0]
    grp = {}
    for gname in ('old', 'pick', 'new'):
        g = [r for r in R if r['group'] == gname]
        if g: grp[gname] = {'n': len(g), 'full': np.mean([r['full'] for r in g]), 'B': np.mean([r['B'] for r in g]), 'min_AB': np.mean([r['min_AB'] for r in g]), 'top10_full': float(np.mean(sorted([r['full'] for r in g])[-10:]))}
    new = sorted([r for r in R if r['group'] == 'new'], key=lambda r: -r['min_AB'])
    for r in new: r['search_minus_fresh'] = (r.get('search_obj') or 0) - r['min_AB']
    json.dump({'groups': grp, 'settings': [{k: v for k, v in r.items() if k != 'q'} for r in R]}, open('night_results/final.json', 'w'))
    sheet = [{'id': r['id'], 'full': r['full'], 'B': r['B'], 'q': r['q'][0]} for r in new[:30]] + [{'id': r['id'], 'full': r['full'], 'B': r['B'], 'q': r['q'][0]} for r in R if r['group'] == 'old'][:10]
    json.dump(sheet, open('night_results/sheet_lines.json', 'w'))
    for k, v in grp.items(): print(k, {a: round(b, 3) if isinstance(b, float) else b for a, b in v.items()})
