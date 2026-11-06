# Full DINO judge for the browser: DINOv2-small + your good/bad fit folded into one final layer, exported as ONNX.
# Input: the on-screen window drawn by raster.js at 224×224 as ink (0 paper .. 1 ink), shape (B,1,224,224). Output: score per picture.
import json, base64, os, numpy as np, torch, torch.nn as nn, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.decomposition import PCA
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score
import models
key = 'dinov2_vits14'
from sklearn.model_selection import StratifiedKFold, cross_val_predict
lm = json.load(open('data/lab224.json')); y = np.array([m['label'] == 'good' for m in lm]).astype(int)
ink = np.fromfile('data/lab224.u8', np.uint8).reshape(len(lm), 224, 224).astype(np.float32) / 255
X = models.load(key)(ink); best = None
for NPC in [20, 50, 100, 150]:
    for C in [0.003, 0.01, 0.03, 0.1]:
        p = np.mean([cross_val_predict(make_pipeline(StandardScaler(), PCA(NPC), LogisticRegression(C=C, max_iter=5000)), X, y, cv=StratifiedKFold(5, shuffle=True, random_state=s), method='decision_function') for s in range(3)], 0)
        a = roc_auc_score(y, p); print('pcs', NPC, 'C', C, 'CV AUC', round(a, 4), flush=True)
        if best is None or a > best[0]: best = (a, NPC, C, p)
B = [best[0], 0, best[1], best[2]]; NPC, C = best[1], best[2]
src = np.array([m.get('src') or '' for m in lm]); arm = np.array([m.get('arm') or '' for m in lm])
for nm, mk in [('round 1 unsteered', (src == 'r1') & (arm != 'dino')), ('round 1 steered', (src == 'r1') & (arm == 'dino')), ('older', src != 'r1')]:
    if mk.sum() > 10 and len(set(y[mk])) > 1: print('CV AUC on', nm, int(mk.sum()), round(roc_auc_score(y[mk], best[3][mk]), 4))
P = make_pipeline(StandardScaler(), PCA(NPC), LogisticRegression(C=C, max_iter=5000)).fit(X, y)
sc, pca, lr = P[0], P[1], P[2]; w = lr.coef_[0]
a = (pca.components_.T @ w) / sc.scale_; c = lr.intercept_[0] - w @ (pca.components_ @ pca.mean_) - a @ sc.mean_
ref = P.decision_function(X); print('folded max diff', float(np.abs(X @ a + c - ref).max()))
torch.set_grad_enabled(False)
class Judge(nn.Module):
    def __init__(s):
        super().__init__(); s.d = torch.hub.load('facebookresearch/dinov2', key).eval(); s.lin = nn.Linear(768, 1)
        s.lin.weight.data = torch.tensor(a, dtype=torch.float32)[None]; s.lin.bias.data = torch.tensor([c], dtype=torch.float32)
        s.register_buffer('m', torch.tensor(models.IMN[0])[None, :, None, None]); s.register_buffer('sd', torch.tensor(models.IMN[1])[None, :, None, None])
    def forward(s, ink):
        x = ((1 - ink).repeat(1, 3, 1, 1) - s.m) / s.sd; o = s.d.forward_features(x)
        return s.lin(torch.cat([o['x_norm_clstoken'], o['x_norm_patchtokens'].mean(1)], 1))[:, 0]
J = Judge().eval(); t = J(torch.tensor(ink[:8, None])).numpy(); print('torch vs fit', float(np.abs(t - ref[:8]).max()))
torch.onnx.export(J, torch.tensor(ink[:2, None]), 'judge.onnx', input_names=['ink'], output_names=['score'], dynamic_axes={'ink': {0: 'b'}, 'score': {0: 'b'}}, opset_version=17, dynamo=False)
import onnxruntime as ort
s = ort.InferenceSession('judge.onnx'); o = np.concatenate([s.run(None, {'ink': ink[i:i + 16, None]})[0] for i in range(0, len(ink), 16)])
print('onnx vs fit max diff', float(np.abs(o - ref).max()), 'in-sample AUC', roc_auc_score(y, o), 'size MB', os.path.getsize('judge.onnx') / 1e6)
os.makedirs('onnx', exist_ok=True); b = base64.b64encode(open('judge.onnx', 'rb').read()).decode(); n = 15_000_000
parts = [b[i:i + n] for i in range(0, len(b), n)]
for k, p in enumerate(parts): open(f'onnx/judge_{k}.txt', 'w').write(p)
json.dump({'parts': len(parts), 'bytes': os.path.getsize('judge.onnx'), 'model': key, 'cv_auc': B[0], 'n_labels': int(len(y)), 'pcs': NPC, 'C': C, 'check': {'index': 0, 'score': float(o[0])}, 'score_sd': float(o.std())}, open('onnx/judge.json', 'w'))
print('parts', len(parts))
