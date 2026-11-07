# Train the tiny student judge on the big judges' scores. Split by whole line (no leakage between near-identical windows).
# Reports, on held-out lines: correlation with each big judge, and how often the student orders two particles at the same check the
# same way as min(A, B) (only pairs the big judges separate by > 0.1) -- the quantity SMC steering actually uses.
import glob, gzip, json, os, sys, time, numpy as np, torch, torch.nn as nn
torch.set_num_threads(os.cpu_count()); torch.manual_seed(0)
dirs = sorted(glob.glob(sys.argv[1] + '/*/')) or [sys.argv[1] + '/']
def load(S):
    X = np.concatenate([np.frombuffer(gzip.open(d + f'x{S}.u8.gz').read(), np.uint8).reshape(-1, S, S) for d in dirs])
    return X
Y = np.concatenate([np.array(json.load(open(d + 'y.json')), np.float32) for d in dirs])[:, :3]
M = np.concatenate([np.array(json.load(open(d + 'meta.json')), np.int64) for d in dirs])
lid = M[:, 0] * 1_000_000 + M[:, 1]; rng = np.random.default_rng(0); ul = np.unique(lid); te_l = set(rng.choice(ul, size=max(1, len(ul) // 10), replace=False).tolist())
te = np.array([l in te_l for l in lid]); tr = ~te
mu, sd = Y[tr].mean(0), Y[tr].std(0) + 1e-6; Yn = (Y - mu) / sd
print('samples', len(Y), 'train', tr.sum(), 'test', te.sum(), 'lines', len(ul), flush=True)
def net(S, w):
    L = [nn.Conv2d(1, w, 3, 2, 1), nn.BatchNorm2d(w), nn.ReLU(), nn.Conv2d(w, 2 * w, 3, 2, 1), nn.BatchNorm2d(2 * w), nn.ReLU(),
         nn.Conv2d(2 * w, 4 * w, 3, 2, 1), nn.BatchNorm2d(4 * w), nn.ReLU(), nn.Conv2d(4 * w, 4 * w, 3, 2, 1), nn.BatchNorm2d(4 * w), nn.ReLU()]
    if S >= 96: L += [nn.Conv2d(4 * w, 4 * w, 3, 2, 1), nn.BatchNorm2d(4 * w), nn.ReLU()]
    return nn.Sequential(*L, nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(4 * w, 64), nn.ReLU(), nn.Linear(64, 3))
class Wrap(nn.Module):   # takes ink in 0..1 like the rasterizer, returns big-judge units [full, A, B]
    def __init__(s, m): super().__init__(); s.m = m; s.register_buffer('mu', torch.tensor(mu)); s.register_buffer('sd', torch.tensor(sd))
    def forward(s, ink): return s.m(ink) * s.sd + s.mu
def evaluate(model, X):
    model.eval(); P = []
    with torch.no_grad():
        for i in range(0, te.sum(), 2048): P.append(model(torch.from_numpy(X[te][i:i + 2048]).float().unsqueeze(1) / 255).numpy())
    P = np.concatenate(P) * sd + mu; T = Y[te]; r = [float(np.corrcoef(P[:, k], T[:, k])[0, 1]) for k in range(3)]
    ps, ts = np.minimum(P[:, 1], P[:, 2]), np.minimum(T[:, 1], T[:, 2]); g = (M[te][:, 0] * 1_000_000 + M[te][:, 1]) * 100 + M[te][:, 2]
    ok = n = 0; order = np.argsort(g, kind='stable'); gs = g[order]; cut = np.flatnonzero(np.diff(gs)) + 1
    for idx in np.split(order, cut):
        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                dt = ts[idx[a]] - ts[idx[b]]
                if abs(dt) > 0.1: n += 1; ok += (np.sign(ps[idx[a]] - ps[idx[b]]) == np.sign(dt))
    return {'r_full': r[0], 'r_A': r[1], 'r_B': r[2], 'r_minAB': float(np.corrcoef(ps, ts)[0, 1]), 'pair_agree': ok / max(1, n), 'pairs': int(n)}
report = {}; best = None
for S, w, ep in [(64, 16, int(os.environ.get('EP', 8))), (96, 16, int(os.environ.get('EP', 8)))]:
    X = load(S); m = net(S, w); opt = torch.optim.AdamW(m.parameters(), 2e-3, weight_decay=1e-4); idx = np.flatnonzero(tr)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=ep * (len(idx) // 256 + 1)); t0 = time.time()
    for e in range(ep):
        m.train(); rng.shuffle(idx)
        for i in range(0, len(idx), 256):
            b = idx[i:i + 256]; x = torch.from_numpy(X[b]).float().unsqueeze(1) / 255; x = torch.where(torch.rand(len(b), 1, 1, 1) < 0.5, x, x.flip(3)) if False else x
            loss = ((m(x) - torch.from_numpy(Yn[b])) ** 2).mean(); opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        res = evaluate(m, X); print(S, 'epoch', e, {k: round(v, 3) for k, v in res.items()}, f'{time.time() - t0:.0f}s', flush=True)
    res['params'] = sum(p.numel() for p in m.parameters()); res['size'] = S; report[S] = res
    if best is None or res['pair_agree'] > report[best[0]]['pair_agree'] + 0.005: best = (S, m)
S, m = best; m.eval(); wm = Wrap(m).eval(); os.makedirs('student', exist_ok=True)
torch.onnx.export(wm, torch.zeros(8, 1, S, S), 'student/student.onnx', input_names=['ink'], output_names=['out'], dynamic_axes={'ink': {0: 'n'}, 'out': {0: 'n'}}, opset_version=17, dynamo=False)
json.dump({'chosen_size': S, 'report': report, 'outputs': ['full', 'A', 'B']}, open('student/student.json', 'w'), indent=1)
print('chosen', S, report[S])
# plain weights for the browser (batch norm folded into the convolutions) + test vectors to prove the JS forward pass matches
def fold(seq):
    L, mods = [], list(seq); i = 0
    while i < len(mods):
        md = mods[i]
        if isinstance(md, nn.Conv2d):
            w, b = md.weight.detach().numpy(), (md.bias.detach().numpy() if md.bias is not None else np.zeros(md.out_channels, np.float32))
            bn = mods[i + 1]; g = bn.weight.detach().numpy() / np.sqrt(bn.running_var.numpy() + bn.eps)
            L.append({'t': 'conv', 'cin': md.in_channels, 'cout': md.out_channels, 'k': 3, 's': md.stride[0], 'p': md.padding[0], 'w': (w * g[:, None, None, None]).ravel().round(6).tolist(), 'b': ((b - bn.running_mean.numpy()) * g + bn.bias.detach().numpy()).round(6).tolist()}); i += 2
        elif isinstance(md, nn.ReLU): L.append({'t': 'relu'}); i += 1
        elif isinstance(md, nn.AdaptiveAvgPool2d): L.append({'t': 'gap'}); i += 1
        elif isinstance(md, nn.Flatten): i += 1
        elif isinstance(md, nn.Linear): L.append({'t': 'fc', 'cin': md.in_features, 'cout': md.out_features, 'w': md.weight.detach().numpy().ravel().round(6).tolist(), 'b': md.bias.detach().numpy().round(6).tolist()}); i += 1
        else: raise ValueError(md)
    return L
Xs = load(S); ti = np.flatnonzero(te)[:6]
with torch.no_grad(): tout = wm(torch.from_numpy(Xs[ti]).float().unsqueeze(1) / 255).numpy()
json.dump({'size': S, 'mu': mu.tolist(), 'sd': sd.tolist(), 'layers': fold(m), 'test': [{'ink': (Xs[i].astype(np.float32) / 255).ravel().round(4).tolist(), 'out': o.tolist()} for i, o in zip(ti, tout)]}, open('student/student_weights.json', 'w'))
print('weights json', os.path.getsize('student/student_weights.json'))
