// node wallsheet.js <wall.json> <out.png> [dark|paper]
const { chromium } = require('playwright'); const fs = require('fs');
const [inp, out, theme] = process.argv.slice(2);
(async () => { const b = await chromium.launch(), p = await b.newPage(); await p.goto('file://' + __dirname + '/wallsheet.html');
  const url = await p.evaluate(([w, t]) => draw(w, { theme: t }), [JSON.parse(fs.readFileSync(inp)), theme || 'dark']); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); await b.close(); })();
