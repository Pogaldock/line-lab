# Turn a word set in a font into a capture the pen can follow (same format as a Hand Bank take).
# A font letter is a filled shape; the pen draws one line. So: render the word, thin it to its one-pixel spine,
# cut the spine into branches (between ends and crossings), drop tiny spurs, then chain the branches in writing order:
# left to right, continuing through each crossing along the straightest branch, i/j dots after their stem.
# Usage: python3 font2cap.py <font.ttf> <word> <out.json> [preview.png]
import sys, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from skimage.morphology import skeletonize
from skan import Skeleton, summarize

font_path, word, out = sys.argv[1], sys.argv[2], sys.argv[3]
SIZE = 320
ft = ImageFont.truetype(font_path, SIZE)
bb = ImageDraw.Draw(Image.new('L', (1, 1))).textbbox((0, 0), word, font=ft)
W, H = bb[2] - bb[0] + 80, bb[3] - bb[1] + 80
img = Image.new('L', (W, H), 0)
ImageDraw.Draw(img).text((40 - bb[0], 40 - bb[1]), word, font=ft, fill=255)
ink = np.array(img) > 127
sk = skeletonize(ink)
xh = ink.sum(axis=1).nonzero()[0]; HGT = xh.max() - xh.min()

skel = Skeleton(sk)
S = summarize(skel, separator='_')
edges = []
for i in range(skel.n_paths):
    rc = skel.path_coordinates(i)
    pts = [(float(c), float(r)) for r, c in rc]     # (x, y)
    edges.append({'a': int(S['node_id_src'][i]), 'b': int(S['node_id_dst'][i]), 'pts': pts,
                  'len': float(S['branch_distance'][i]), 'type': int(S['branch_type'][i])})
# drop short spurs (a crossing to a loose end): skeleton noise at stroke ends and corners
def degrees(E):
    d = {}
    for e in E: d[e['a']] = d.get(e['a'], 0) + 1; d[e['b']] = d.get(e['b'], 0) + 1
    return d
for _ in range(2):
    d = degrees(edges)
    edges = [e for e in edges if not (e['len'] < 0.07 * HGT and ((d[e['a']] == 1) != (d[e['b']] == 1)))]

# connected components of the branch graph
parent = {}
def find(x):
    while parent.setdefault(x, x) != x: x = parent[x]
    return x
for e in edges: parent[find(e['a'])] = find(e['b'])
comps = {}
for k, e in enumerate(edges): comps.setdefault(find(e['a']), []).append(k)
comps = list(comps.values())
def span(c):
    xs = [p[0] for k in c for p in edges[k]['pts']]; return min(xs), max(xs), sum(edges[k]['len'] for k in c)
info = [(c,) + span(c) for c in comps]
big = [t for t in info if t[3] > 0.25 * HGT]
def order_key(t):
    c, x0, x1, L = t
    if L > 0.25 * HGT: return (x0, 0)
    mid = (x0 + x1) / 2
    host = [b for b in big if b[1] - 5 <= mid <= b[2] + 5]
    return ((min(host, key=lambda b: b[1])[1] if host else x0), 1, mid)   # a dot comes right after the letter it sits on
info.sort(key=order_key)

def oriented(k, frm):
    e = edges[k]; return e['pts'] if e['a'] == frm else e['pts'][::-1]
def tangent(pts, n=10):
    p, q = pts[0], pts[min(n, len(pts) - 1)]; return math.atan2(q[1] - p[1], q[0] - p[0])

# One unbroken line per connected letter group, the way a hand writes m, n, b: go back up along a stem you already drew
# instead of lifting the pen. That is an Euler path: every branch drawn once, plus the fewest re-traced branches needed
# so the line can start at the leftmost loose end and finish at the rightmost one.
import heapq
nodexy = {}
for e in edges: nodexy[e['a']] = e['pts'][0]; nodexy[e['b']] = e['pts'][-1]
def shortest(c, s, t):
    adj = {}
    for k in c:
        e = edges[k]; adj.setdefault(e['a'], []).append((e['b'], k)); adj.setdefault(e['b'], []).append((e['a'], k))
    dist, prev, q = {s: 0}, {}, [(0, s)]
    while q:
        dd, u = heapq.heappop(q)
        if u == t: break
        if dd > dist[u]: continue
        for v, k in adj.get(u, []):
            nd = dd + edges[k]['len']
            if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = (u, k); heapq.heappush(q, (nd, v))
    path, u = [], t
    while u != s: u, k = prev[u]; path.append(k)
    return dist[t], path

LOOP = 0.045 * HGT     # loop width for re-traced stems
strokes = []
for c, *_ in info:
    d = degrees([edges[k] for k in c])
    odd = sorted([n for n in d if d[n] % 2], key=lambda n: nodexy[n][0])
    multi = list(c)                                    # edge list, re-traced branches appear twice
    if odd:
        # start at the leftmost loose end; finish at whichever loose end needs the least re-tracing (a little
        # preference for ends further right), then pair the remaining loose ends by shortest re-trace
        start = odd[0]; xr = max(nodexy[n][0] for n in odd); plan = None
        for end in odd[1:]:
            rest = [n for n in odd[1:] if n != end]; extra, cost = [], 0.25 * (xr - nodexy[end][0])
            while rest:
                a = rest.pop(0); best = min(rest, key=lambda b: shortest(c, a, b)[0]); rest.remove(best)
                L, p = shortest(c, a, best); extra += p; cost += L
            if plan is None or cost < plan[0]: plan = (cost, extra)
        multi += plan[1]
    else:
        start = min(d, key=lambda n: nodexy[n][0])
    unused = list(range(len(multi)))
    def connected_after(i, node):
        left = [multi[j] for j in unused if j != i]
        if not left: return True
        adj = {}
        for k in left: e = edges[k]; adj.setdefault(e['a'], set()).add(e['b']); adj.setdefault(e['b'], set()).add(e['a'])
        e = edges[multi[i]]; other = e['b'] if e['a'] == node else e['a']
        if other not in adj: return False
        seen, st = {other}, [other]
        while st:
            u = st.pop()
            for v in adj[u]:
                if v not in seen: seen.add(v); st.append(v)
        return all(edges[k]['a'] in seen for k in left)
    node, stroke, heading = start, [], None
    passes = {}
    while unused:
        nxt = [i for i in unused if node in (edges[multi[i]]['a'], edges[multi[i]]['b'])]
        if not nxt: break
        def turn(i):
            if heading is None: return 0
            t = tangent(oriented(multi[i], node)); return abs((t - heading + math.pi) % (2 * math.pi) - math.pi)
        nxt.sort(key=turn)                              # straightest first, but never strand the rest (Fleury)
        pick = next((i for i in nxt if connected_after(i, node)), nxt[0])
        k = multi[pick]; unused.remove(pick)
        pts = oriented(k, node); passes[k] = passes.get(k, 0) + 1
        if passes[k] == 2:
            # second pass over a stem (b, h, m...): run it alongside the first pass instead of on top, so the pen draws a
            # narrow loop it can actually turn round, like a looped cursive ascender. Full offset at a loose end, none at a crossing.
            other = edges[k]['b'] if edges[k]['a'] == node else edges[k]['a']
            dg = degrees([edges[j] for j in c])
            r0, r1 = (LOOP if dg[node] == 1 else 0), (LOOP if dg[other] == 1 else 0)
            P = np.array(pts); n = len(P); moved = []
            for i in range(n):
                a, b = P[max(0, i - 3)], P[min(n - 1, i + 3)]; t = b - a; L = math.hypot(*t) or 1
                nx, ny = -t[1] / L, t[0] / L; u = i / max(1, n - 1)
                off = r0 * (1 - u) + r1 * u if (r0 and r1) else (r0 * (1 - u) ** 0.5 if r0 else r1 * u ** 0.5) if (r0 or r1) else LOOP * 0.6 * math.sin(math.pi * u)
                moved.append((P[i][0] + nx * off, P[i][1] + ny * off))
            pts = moved
        stroke += pts if not stroke else pts[1:]
        node = edges[k]['b'] if edges[k]['a'] == node else edges[k]['a']
        heading = tangent(stroke[::-1]) + math.pi
    strokes.append(stroke)

# smooth the pixel staircase and resample, then write in page-like units (height ~ 1)
def smooth(P, w=6):
    P = np.array(P); n = len(P)
    if n < 3: return P
    Q = np.array([P[max(0, i - w):i + w + 1].mean(axis=0) for i in range(n)]); Q[0], Q[-1] = P[0], P[-1]; return Q
y0 = xh.min()
cap = {'key': word, 'cat': 'font', 'font': font_path.split('/')[-1], 'strokes': []}
t = 0
for P in strokes:
    Q = smooth(P)[::3]
    flat = []
    for x, y in Q:
        flat += [round(x / HGT, 4), round((y - y0) / HGT, 4), 0.5, t]; t += 8
    t += 120
    cap['strokes'].append(flat)
json.dump(cap, open(out, 'w'))
print(word, ':', len(strokes), 'strokes,', sum(len(s) for s in cap['strokes']) // 4, 'points')

if len(sys.argv) > 4:   # preview: grey font, coloured strokes in order, start dots
    im = Image.new('RGB', (W, H), (250, 250, 250)); a = np.array(im); a[ink] = (225, 225, 225); im = Image.fromarray(a); dr = ImageDraw.Draw(im)
    cols = [(230, 40, 120), (20, 20, 20), (40, 120, 230), (240, 150, 0), (0, 160, 90), (140, 60, 200)]
    for i, P in enumerate(strokes):
        Q = [tuple(p) for p in smooth(P)]
        dr.line(Q, fill=cols[i % len(cols)], width=4); dr.ellipse([Q[0][0] - 7, Q[0][1] - 7, Q[0][0] + 7, Q[0][1] + 7], fill=cols[i % len(cols)])
        dr.text((Q[0][0] + 8, Q[0][1] - 22), str(i + 1), fill=cols[i % len(cols)], font=ImageFont.truetype(font_path, 40))
    im.save(sys.argv[4])
