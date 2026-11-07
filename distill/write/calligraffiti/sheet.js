// node sheet.js <out.png> <theme> '<rows json>'
const { chromium } = require('playwright'); const fs = require('fs');
const [out, theme, rowsJ] = process.argv.slice(2);
(async () => { const b = await chromium.launch(), p = await b.newPage(); await p.goto('file://' + __dirname + '/sheet.html');
  const url = await p.evaluate(([r, t]) => draw(r, t), [JSON.parse(rowsJ), theme]); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); await b.close(); })();
