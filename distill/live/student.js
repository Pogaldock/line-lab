/* The tiny student judge in plain JavaScript: 3x3 convolutions (stride 2, batch norm folded in), ReLU, global average, two dense
   layers. Input: ink image from Raster.raster(window, size) (0..1); output [full, A, B] in the big judges' units. */
(function (root) {
  function make(J) {
    // weights arrive either as plain arrays or packed as base64 float32 (smaller page)
    const unpack = (v) => { if (typeof v !== 'string') return Float32Array.from(v); const s = typeof atob === 'function' ? atob(v) : Buffer.from(v, 'base64').toString('binary'), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); };
    const L = J.layers.map(l => Object.assign({}, l, l.w ? { w: unpack(l.w), b: unpack(l.b) } : {}));
    return function forward(ink) {
      let x = ink, C = 1, H = J.size, Wd = J.size;
      for (const l of L) {
        if (l.t === 'conv') {
          const Ho = Math.floor((H + 2 * l.p - 3) / l.s) + 1, Wo = Math.floor((Wd + 2 * l.p - 3) / l.s) + 1, y = new Float32Array(l.cout * Ho * Wo);
          for (let o = 0; o < l.cout; o++) { const bo = l.b[o], ob = o * Ho * Wo;
            for (let i = 0; i < Ho; i++) for (let j = 0; j < Wo; j++) { let s = bo; const y0 = i * l.s - l.p, x0 = j * l.s - l.p;
              for (let c = 0; c < C; c++) { const wb = ((o * C + c) * 3) * 3, xb = c * H * Wd;
                for (let ky = 0; ky < 3; ky++) { const yy = y0 + ky; if (yy < 0 || yy >= H) continue; const row = xb + yy * Wd, wr = wb + ky * 3;
                  for (let kx = 0; kx < 3; kx++) { const xx = x0 + kx; if (xx < 0 || xx >= Wd) continue; s += l.w[wr + kx] * x[row + xx]; } } }
              y[ob + i * Wo + j] = s; } }
          x = y; C = l.cout; H = Ho; Wd = Wo;
        } else if (l.t === 'relu') { for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0; }
        else if (l.t === 'gap') { const y = new Float32Array(C), n = H * Wd; for (let c = 0; c < C; c++) { let s = 0; for (let i = 0; i < n; i++) s += x[c * n + i]; y[c] = s / n; } x = y; H = Wd = 1; }
        else if (l.t === 'fc') { const y = new Float32Array(l.cout); for (let o = 0; o < l.cout; o++) { let s = l.b[o]; for (let i = 0; i < l.cin; i++) s += l.w[o * l.cin + i] * x[i]; y[o] = s; } x = y; C = l.cout; }
      }
      return [0, 1, 2].map(k => x[k] * J.sd[k] + J.mu[k]);
    };
  }
  const api = { make };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Student = api;
})(this);
