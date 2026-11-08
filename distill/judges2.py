# The new big judge (Nov 8): DINOv2 large + CLIP large, each with the same kind of scorer as before (standardise, PCA 250,
# logistic regression) trained on Rowan's ratings; the two scores are standardised and averaged. As before it gives five numbers
# per line: full (all ratings), A and B (two disjoint halves of the ratings: steer with one, referee with the other), d1, d2
# (two image-feature axes, from DINOv2 large). The image models are exported as two ONNX files that output raw features; the
# scorers are small linear maps applied in JavaScript (night.js, JUDGES2=<dir>). Also refits the "chance it's good" calibration.
# Usage: python judges2.py <outDir>
import json, os, sys, time, numpy as np, torch, torch.nn as nn, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.decomposition import PCA
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score
import models
out = sys.argv[1]; os.makedirs(out, exist_ok=True); torch.set_grad_enabled(False)
lm = json.load(open('data/lab224.json')); y = np.array([m['label'] == 'good' for m in lm]).astype(int)
ink = np.fromfile('data/lab224.u8', np.uint8).reshape(len(lm), 224, 224).astype(np.float32) / 255
KEYS = [('dinov2_vitl14', 0.003), ('clip_ViT-L-14', 0.003)]; NPC = 250
rng = np.random.default_rng(0); half = np.zeros(len(y), bool)
for cls in (0, 1):
    ii = np.where(y == cls)[0]; rng.shuffle(ii); half[ii[: len(ii) // 2]] = True
iA, iB = np.where(half)[0], np.where(~half)[0]
def fold(X, idx, C):
    P = make_pipeline(StandardScaler(), PCA(NPC), LogisticRegression(C=C, max_iter=5000)).fit(X[idx], y[idx]); sc, pca, lr = P[0], P[1], P[2]; w = lr.coef_[0]
    a = (pca.components_.T @ w) / sc.scale_; c = lr.intercept_[0] - w @ (pca.components_ @ pca.mean_) - a @ sc.mean_
    return a, c
feats, heads = {}, {}
for key, C in KEYS:
    t0 = time.time(); X = models.load(key)(ink); feats[key] = X; print(key, X.shape, f'{time.time() - t0:.0f}s', flush=True)
    H = {}
    for name, idx in [('full', np.arange(len(y))), ('A', iA), ('B', iB)]:
        a, c = fold(X, idx, C); s = X @ a + c; H[name] = (a, c, float(s.mean()), float(s.std()))   # standardise each scorer by its spread over the rated lines
    heads[key] = H
# combined scorer k: average of the two models' standardised scores = one linear map on [dino features, clip features]
Dd, Dc = feats[KEYS[0][0]].shape[1], feats[KEYS[1][0]].shape[1]; Xall = np.concatenate([feats[KEYS[0][0]], feats[KEYS[1][0]]], 1)
Wt, bt = [], []
for name in ['full', 'A', 'B']:
    (aD, cD, mD, sD), (aC, cC, mC, sC) = heads[KEYS[0][0]][name], heads[KEYS[1][0]][name]
    Wt.append(np.concatenate([aD / sD, aC / sC]) / 2); bt.append(((cD - mD) / sD + (cC - mC) / sC) / 2)
# d1, d2: first two principal axes of the DINOv2-large features (the "kinds of line" the night run used)
XD = feats[KEYS[0][0]]; sc2 = StandardScaler().fit(XD); pc2 = PCA(2).fit(sc2.transform(XD)); Wd = pc2.components_ / sc2.scale_[None]
dd = pc2.transform(sc2.transform(XD)); bd = dd[0] - Wd @ XD[0]
for k in range(2): Wt.append(np.concatenate([Wd[k], np.zeros(Dc)])); bt.append(bd[k])
Wt, bt = np.stack(Wt).astype(np.float32), np.array(bt, np.float32); O = Xall @ Wt.T + bt
# honest checks: A judged on B's half and B on A's half (ratings each never saw)
info = {'n_labels': int(len(y)), 'models': [k for k, _ in KEYS], 'pcs': NPC, 'A_on_B_half_auc': roc_auc_score(y[iB], O[iB, 1]), 'B_on_A_half_auc': roc_auc_score(y[iA], O[iA, 2]), 'A_B_corr': float(np.corrcoef(O[:, 1], O[:, 2])[0, 1])}
ho = np.where(half, O[:, 2], O[:, 1])   # each line scored by the half-judge that never saw it
for q in (0.05, 0.10): k = int(round(len(y) * q)); info[f'heldout_top{int(q * 100)}_pct_good'] = round(100 * float(y[np.argsort(-ho)[:k]].mean()), 1)
# calibration as before: z = mean of the A and B z-scores; P(good) = logistic(a z + b), fitted on held-out scores
mA, sA, mB, sB = float(O[:, 1].mean()), float(O[:, 1].std()), float(O[:, 2].mean()), float(O[:, 2].std())
zh = np.where(half, (O[:, 2] - mB) / sB, (O[:, 1] - mA) / sA); lr = LogisticRegression(C=1e6).fit(zh[:, None], y)
calib = {'note': 'P(good) = 1/(1+exp(-(a*z+b))), z = mean of the A and B z-scores (new big judge: DINOv2 large + CLIP large); fitted on held-out scores',
         'a': float(lr.coef_[0][0]), 'b': float(lr.intercept_[0]), 'mA': mA, 'sA': sA, 'mB': mB, 'sB': sB, 'max_observed': round(float(lr.predict_proba(np.array([[zh.max()]]))[0, 1]), 3)}
print(info, calib, flush=True)
# export the two image models (ink 0..1, one channel, 224 px) -> raw features, and check ONNX against PyTorch
class Feat(nn.Module):
    def __init__(s, key):
        super().__init__(); s.key = key
        if key.startswith('dinov2'): s.m = torch.hub.load('facebookresearch/dinov2', key).eval(); norm = models.IMN
        else:
            import open_clip; s.m = open_clip.create_model_and_transforms('ViT-L-14', pretrained='laion2b_s32b_b82k')[0].visual.eval(); norm = models.CLIPN
        s.register_buffer('mu', torch.tensor(norm[0])[None, :, None, None]); s.register_buffer('sd', torch.tensor(norm[1])[None, :, None, None])
    def forward(s, x):
        x = ((1 - x).repeat(1, 3, 1, 1) - s.mu) / s.sd
        if s.key.startswith('dinov2'): o = s.m.forward_features(x); return torch.cat([o['x_norm_clstoken'], o['x_norm_patchtokens'].mean(1)], 1)
        return s.m(x)
import onnxruntime as ort
spec = {'feat_dims': [Dd, Dc], 'files': [], 'W': Wt.round(7).tolist(), 'b': bt.tolist(), 'outputs': ['full', 'A', 'B', 'd1', 'd2']}
for key, _ in KEYS:
    f = f'{out}/{key}.onnx'; M = Feat(key).eval(); torch.onnx.export(M, torch.tensor(ink[:2, None]), f, input_names=['ink'], output_names=['feat'], dynamic_axes={'ink': {0: 'b'}, 'feat': {0: 'b'}}, opset_version=17, dynamo=False)
    s = ort.InferenceSession(f, providers=['CPUExecutionProvider']); o = s.run(None, {'ink': ink[:8, None]})[0]
    print(key, 'onnx vs torch features, max diff', float(np.abs(o - feats[key][:8]).max()), 'MB', round(os.path.getsize(f) / 1e6), flush=True)
    so = ort.SessionOptions(); so.intra_op_num_threads = 1; s1 = ort.InferenceSession(f, so, providers=['CPUExecutionProvider']); t0 = time.time(); s1.run(None, {'ink': ink[:8, None]}); dt = (time.time() - t0) / 8
    spec['files'].append(os.path.basename(f)); info[f'{key}_sec_per_window_1thread'] = round(dt, 3); print(key, 'seconds per window, one thread', round(dt, 3), flush=True)
# end-to-end check: features from both ONNX files through the linear maps must equal the fitted scores
o = np.concatenate([ort.InferenceSession(f'{out}/{k}.onnx').run(None, {'ink': ink[:8, None]})[0] for k, _ in KEYS], 1) @ Wt.T + bt
info['end_to_end_max_diff'] = float(np.abs(o - O[:8]).max()); spec['info'] = info
json.dump(spec, open(f'{out}/judges2.json', 'w')); json.dump(calib, open(f'{out}/calib2.json', 'w'), indent=1)
json.dump({'info': info, 'calib': calib}, open('night_results/judges2_report.json', 'w'), indent=1); print(json.dumps(info, indent=1))
