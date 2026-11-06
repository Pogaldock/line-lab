# Learning curve of the DINO judge: train on n random labels, test on a fixed held-out 360, repeat.
import json, numpy as np, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score
import models
lm = json.load(open('data/lab224.json')); y = np.array([m['label'] == 'good' for m in lm]).astype(int)
X = models.load('dinov2_vits14')(np.fromfile('data/lab224.u8', np.uint8).reshape(len(lm), 224, 224).astype(np.float32) / 255)
r = np.random.default_rng(0); R = {}
for n in [100, 200, 400, 600, 800, 1000, 1250]:
    a = []
    for s in range(20):
        p = r.permutation(len(y)); tr, te = p[:n], p[-360:]
        sc = StandardScaler().fit(X[tr]); k = min(150, n - 1); pca = PCA(k).fit(sc.transform(X[tr])); T = lambda A: pca.transform(sc.transform(A))
        for C in [0.01]:
            m = LogisticRegression(C=C, max_iter=5000).fit(T(X[tr]), y[tr]); a.append(roc_auc_score(y[te], m.decision_function(T(X[te]))))
    R[n] = [float(np.mean(a)), float(np.std(a))]; print(n, R[n], flush=True)
json.dump(R, open('lcurve.json', 'w'))
