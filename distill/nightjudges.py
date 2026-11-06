# Judges for the overnight run, all in one ONNX model (one image pass, five numbers out):
#   full  : trained on every label (as the deployed judge)
#   A, B  : trained on two disjoint halves of the labels. Steer with A, referee with B: when A's score keeps rising
#           but B's falls, the steering is exploiting A rather than finding better lines (Gao et al. 2022 style).
#   d1, d2: the first two principal components of the judge's own image features, used as learned "kinds of line".
import json, base64, os, numpy as np, torch, torch.nn as nn, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.decomposition import PCA
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score
import models
key = 'dinov2_vits14'
lm = json.load(open('data/lab224.json')); y = np.array([m['label'] == 'good' for m in lm]).astype(int)
ink = np.fromfile('data/lab224.u8', np.uint8).reshape(len(lm), 224, 224).astype(np.float32) / 255
X = models.load(key)(ink); print('embedded', X.shape, flush=True)
best = None
for NPC in [50, 100, 150]:
    for C in [0.003, 0.01, 0.03]:
        p = cross_val_predict(make_pipeline(StandardScaler(), PCA(NPC), LogisticRegression(C=C, max_iter=5000)), X, y, cv=StratifiedKFold(5, shuffle=True, random_state=0), method='decision_function')
        a = roc_auc_score(y, p); print('pcs', NPC, 'C', C, 'CV AUC', round(a, 4), flush=True)
        if best is None or a > best[0]: best = (a, NPC, C)
_, NPC, C = best
def fold(idx):
    P = make_pipeline(StandardScaler(), PCA(NPC), LogisticRegression(C=C, max_iter=5000)).fit(X[idx], y[idx]); sc, pca, lr = P[0], P[1], P[2]; w = lr.coef_[0]
    a = (pca.components_.T @ w) / sc.scale_; c = lr.intercept_[0] - w @ (pca.components_ @ pca.mean_) - a @ sc.mean_
    return a, c
rng = np.random.default_rng(0); half = np.zeros(len(y), bool)
for cls in (0, 1):
    ii = np.where(y == cls)[0]; rng.shuffle(ii); half[ii[: len(ii) // 2]] = True
iA, iB = np.where(half)[0], np.where(~half)[0]
aF, cF = fold(np.arange(len(y))); aA, cA = fold(iA); aB, cB = fold(iB)
sA, sB = X @ aA + cA, X @ aB + cB
info = {'n_labels': int(len(y)), 'pcs': NPC, 'C': C, 'cv_auc_full': best[0],
        'A_on_B_half': roc_auc_score(y[iB], sA[iB]), 'B_on_A_half': roc_auc_score(y[iA], sB[iA]), 'A_B_corr_all': float(np.corrcoef(sA, sB)[0, 1])}
print(info, flush=True)
sc2 = StandardScaler().fit(X); pc2 = PCA(2).fit(sc2.transform(X)); Wd = pc2.components_ / sc2.scale_[None]
dd = pc2.transform(sc2.transform(X)); bd = dd[0] - Wd @ X[0]          # exact offset so that Wd @ x + bd == pca.transform(scaler(x))
print('desc check', float(np.abs(X @ Wd.T + bd - dd).max()), flush=True)
W = np.stack([aF, aA, aB, Wd[0], Wd[1]]); bvec = np.array([cF, cA, cB, bd[0], bd[1]])
torch.set_grad_enabled(False)
class Judges(nn.Module):
    def __init__(s):
        super().__init__(); s.d = torch.hub.load('facebookresearch/dinov2', key).eval(); s.lin = nn.Linear(768, 5)
        s.lin.weight.data = torch.tensor(W, dtype=torch.float32); s.lin.bias.data = torch.tensor(bvec, dtype=torch.float32)
        s.register_buffer('m', torch.tensor(models.IMN[0])[None, :, None, None]); s.register_buffer('sd', torch.tensor(models.IMN[1])[None, :, None, None])
    def forward(s, ink):
        x = ((1 - ink).repeat(1, 3, 1, 1) - s.m) / s.sd; o = s.d.forward_features(x)
        return s.lin(torch.cat([o['x_norm_clstoken'], o['x_norm_patchtokens'].mean(1)], 1))
J = Judges().eval()
torch.onnx.export(J, torch.tensor(ink[:2, None]), 'judges.onnx', input_names=['ink'], output_names=['out'], dynamic_axes={'ink': {0: 'b'}, 'out': {0: 'b'}}, opset_version=17, dynamo=False)
import onnxruntime as ort
s = ort.InferenceSession('judges.onnx'); o = np.concatenate([s.run(None, {'ink': ink[i:i + 16, None]})[0] for i in range(0, len(ink), 16)])
ref = np.stack([X @ aF + cF, sA, sB, dd[:, 0], dd[:, 1]], 1); print('onnx vs fit max diff per output', np.abs(o - ref).max(0), flush=True)
info.update({'sd': o.std(0).tolist(), 'mean': o.mean(0).tolist(), 'desc_q': {q: np.percentile(o[:, 3:], q, axis=0).tolist() for q in (2, 5, 50, 95, 98)}, 'outputs': ['full', 'A', 'B', 'd1', 'd2']})
json.dump(info, open('judges.json', 'w'), indent=1); print('saved judges.onnx', os.path.getsize('judges.onnx') / 1e6, 'MB')
