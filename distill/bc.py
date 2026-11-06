# Step policy learned from your labelled lines (behavioural cloning with memory).
# A GRU reads the line step by step (one step = 1/60 s) and predicts the next step: turn, log speed, width change,
# as a mixture of 8 Gaussians. Inputs per step: the last step itself, plus summary features of everything drawn so far
# (position relative to the ink's centre, size, heading towards/away from the centre, old ink nearby),
# plus the label (good = 1, bad = 0). Sampling with label = 1 asks for "a line like your goods".
# Also measures whether the label is learned: on held-out lines, does p(line | good) / p(line | bad) predict your label?
import json, math, numpy as np, torch, torch.nn as nn, time
torch.manual_seed(0); np.random.seed(0)
A = json.load(open('../feed/all_labels.json'))
NF = 15
def feats(P):
    """P: (N,4) x,y,w,t -> per-step inputs (N-1, NF) describing the state after step i, targets (N-1, 3) for step i+1."""
    x, y, w = P[:, 0], P[:, 1], P[:, 2]; dx, dy = np.diff(x), np.diff(y); sp = np.hypot(dx, dy)
    hd = np.zeros(len(dx)); h = 0.0
    for i in range(len(dx)):
        if sp[i] > 1e-5: h = math.atan2(dy[i], dx[i])
        hd[i] = h
    tn = np.r_[0, (np.diff(hd) + np.pi) % (2 * np.pi) - np.pi]; ls = np.log(sp + 1e-4); dw = np.r_[0, np.diff(w[1:])]
    n = len(dx); F = np.zeros((n, NF), np.float32)
    for i in range(n):
        px, py = x[:i + 2], y[:i + 2]; cx, cy = px.mean(), py.mean(); R = max(np.hypot(px - cx, py - cy).max(), 1e-3)
        rx, ry = (x[i + 1] - cx) / R, (y[i + 1] - cy) / R; d = math.hypot(rx, ry)
        a = math.atan2(-ry, -rx) - hd[i]                           # angle from heading to the direction of the centre
        old = slice(0, max(0, i - 20)); near = np.hypot(px[old] - x[i + 1], py[old] - y[i + 1]) < 0.15 * R if i > 20 else np.zeros(0, bool)
        F[i] = [tn[i], ls[i], dw[i], w[i + 1], rx, ry, d, math.cos(a), math.sin(a), near.mean() if len(near) else 0, near.sum() / 50, math.log(R + 1e-3), i / 480, 0, 0]
    T = np.c_[tn[1:], ls[1:], dw[1:]].astype(np.float32)
    return F[:-1], T

t0 = time.time(); D = []
for r in A:
    P = np.array(json.loads(r['pts']) if isinstance(r['pts'], str) else r['pts'], float)
    if len(P) < 100: continue
    F, T = feats(P[:500]); F[:, 13] = 1.0 if r['label'] == 'good' else 0.0; F[:, 14] = 1.0
    D.append((F, T, r['label'] == 'good', r['id'], r.get('src')))
print('lines', len(D), 'features in', round(time.time() - t0), 's', flush=True)
allF = np.concatenate([d[0] for d in D]); allT = np.concatenate([d[1] for d in D])
fm, fs = allF.mean(0), allF.std(0) + 1e-6; fm[13:] = 0; fs[13:] = 1; tm, ts = allT.mean(0), allT.std(0) + 1e-6
idx = np.random.permutation(len(D)); nv = len(D) // 8; val, tr = idx[:nv], idx[nv:]
K, H = 8, 128
class Pol(nn.Module):
    def __init__(s):
        super().__init__(); s.gru = nn.GRU(NF, H, batch_first=True); s.h1 = nn.Linear(H + NF, H); s.out = nn.Linear(H, K * 7)
    def forward(s, x, h=None):
        o, h = s.gru(x, h); z = torch.tanh(s.h1(torch.cat([o, x], -1))); return s.out(z), h
def nll(out, tgt):
    B, L, _ = out.shape; o = out.view(B, L, K, 7); lw = torch.log_softmax(o[..., 0], -1); mu = o[..., 1:4]; ls = o[..., 4:7].clamp(-5, 3)
    t = tgt.unsqueeze(2); lp = (-0.5 * ((t - mu) / ls.exp()) ** 2 - ls - 0.5 * math.log(2 * math.pi)).sum(-1)
    return -torch.logsumexp(lw + lp, -1)                         # (B, L) nats per step
def batch(ix, flip=False):
    L = max(len(D[i][0]) for i in ix); X = np.zeros((len(ix), L, NF), np.float32); Y = np.zeros((len(ix), L, 3), np.float32); M = np.zeros((len(ix), L), np.float32)
    for k, i in enumerate(ix):
        F, T = D[i][0].copy(), D[i][1]
        if flip: F[:, 13] = 1 - F[:, 13]
        n = len(F); X[k, :n] = (F - fm) / fs; Y[k, :n] = (T - tm) / ts; M[k, 60:n] = 1          # first second: warm-up, not scored
    return torch.tensor(X), torch.tensor(Y), torch.tensor(M)
m = Pol(); opt = torch.optim.Adam(m.parameters(), 2e-3); sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, 40)
def evalset(ix, flip=False):
    m.eval(); s = []
    with torch.no_grad():
        for b in range(0, len(ix), 64):
            X, Y, M = batch(ix[b:b + 64], flip); o, _ = m(X); s += list(((nll(o, Y) * M).sum(1) / M.sum(1)).numpy())
    m.train(); return np.array(s)
for ep in range(40):
    p = np.random.permutation(tr); tot = 0
    for b in range(0, len(p), 32):
        X, Y, M = batch(p[b:b + 32]); o, _ = m(X); loss = (nll(o, Y) * M).sum() / M.sum()
        opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(m.parameters(), 1.0); opt.step(); tot += loss.item()
    sched.step()
    if ep % 5 == 4 or ep == 39: print('epoch', ep + 1, 'train', round(tot / (len(p) / 32), 3), 'val', round(evalset(val).mean(), 3), round(time.time() - t0), 's', flush=True)
# taste check: per held-out line, log p(line | true label) vs log p(line | other label)
from sklearn.metrics import roc_auc_score
yv = np.array([D[i][2] for i in val]); a = evalset(val); b = evalset(val, True)
lg = np.where(yv, a, b); lb = np.where(yv, b, a)              # mean nll per step under "good" and under "bad"
auc = roc_auc_score(yv, lb - lg); print('held-out: does the policy know your taste? AUC', round(auc, 3), flush=True)
sd = {k: v.numpy().tolist() for k, v in m.state_dict().items()}
json.dump({'K': K, 'H': H, 'NF': NF, 'fm': fm.tolist(), 'fs': fs.tolist(), 'tm': tm.tolist(), 'ts': ts.tolist(), 'w': sd, 'val_nll': float(a.mean()), 'taste_auc': float(auc),
           'prefixes': [np.round(np.array(json.loads(A_r['pts']) if isinstance(A_r['pts'], str) else A_r['pts'], float)[:12], 4).tolist() for A_r in [r for r in A if r['label'] == 'good'][:200]]},
          open('bc_policy.json', 'w'))
# parity vectors for the JS port
X, Y, M = batch(val[:1]); o, _ = m(X[:, :40]); json.dump({'x': X[0, :40].numpy().tolist(), 'out': o[0].detach().numpy().tolist()}, open('bc_parity.json', 'w'))
print('saved', flush=True)
