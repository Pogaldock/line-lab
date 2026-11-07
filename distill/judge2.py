# Is there a better big judge? For each image model's features (and their combination), fit the same kind of scorer the current
# judge uses (standardise, PCA, logistic regression) and score it ONLY on ratings it never saw (5-fold cross-validation).
# What matters for "Best only" is the top end: of the lines a judge ranks in its top 5% / 10%, what share did Rowan rate good?
# Usage: python judge2.py <featDir> <out.json>
import glob, json, os, sys, numpy as np, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.decomposition import PCA
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score
lm = json.load(open('data/lab224.json')); y = np.array([m['label'] == 'good' for m in lm]).astype(int)
def top(p, q): k = max(1, int(round(len(p) * q))); return float(y[np.argsort(-p)[:k]].mean())
def oof(X, npc, C, seed=0): return cross_val_predict(make_pipeline(StandardScaler(), PCA(min(npc, X.shape[1] - 1)), LogisticRegression(C=C, max_iter=5000)), X, y, cv=StratifiedKFold(5, shuffle=True, random_state=seed), method='decision_function')
res, best_oof = {}, {}
for f in sorted(glob.glob(sys.argv[1] + '/feat_*.npy')):
    name = os.path.basename(f)[5:-4]; X = np.load(f); rows = []
    for npc in [50, 100, 150, 250]:
        for C in [0.003, 0.01, 0.03]:
            p = oof(X, npc, C); rows.append({'pcs': npc, 'C': C, 'auc': roc_auc_score(y, p), 'top5': top(p, 0.05), 'top10': top(p, 0.10), 'p': p})
    b = max(rows, key=lambda r: (r['top10'] + r['top5']) / 2 + r['auc'])   # pick by the top end, AUC as tie-breaker
    # a second, different split of the data, to see how much of the score is luck of the split
    p2 = oof(X, b['pcs'], b['C'], seed=1)
    res[name] = {'dims': int(X.shape[1]), 'pcs': b['pcs'], 'C': b['C'], 'auc': round(b['auc'], 4), 'top5_pct_good': round(100 * b['top5'], 1), 'top10_pct_good': round(100 * b['top10'], 1),
                 'other_split': {'auc': round(roc_auc_score(y, p2), 4), 'top5_pct_good': round(100 * top(p2, 0.05), 1), 'top10_pct_good': round(100 * top(p2, 0.10), 1)}}
    best_oof[name] = (b['p'] - b['p'].mean()) / b['p'].std(); print(name, res[name], flush=True)
# combination: average of the standardised held-out scores (each model's scorer saw the same folds), and a stricter version: the minimum
if len(best_oof) > 1:
    for combo in [list(best_oof)] + [[a, b] for i, a in enumerate(best_oof) for b in list(best_oof)[i + 1:]]:
        Z = np.stack([best_oof[k] for k in combo]); m, n = Z.mean(0), Z.min(0)
        res['avg(' + '+'.join(combo) + ')'] = {'auc': round(roc_auc_score(y, m), 4), 'top5_pct_good': round(100 * top(m, 0.05), 1), 'top10_pct_good': round(100 * top(m, 0.10), 1)}
        res['min(' + '+'.join(combo) + ')'] = {'auc': round(roc_auc_score(y, n), 4), 'top5_pct_good': round(100 * top(n, 0.05), 1), 'top10_pct_good': round(100 * top(n, 0.10), 1)}
res['_note'] = f'{len(y)} rated lines, {int(y.sum())} good ({100 * y.mean():.1f}% base rate). top5/top10: share rated good among the lines the judge ranks highest, on held-out folds only. The current judge is dinov2_vits14.'
json.dump(res, open(sys.argv[2], 'w'), indent=1); print(json.dumps(res, indent=1))
