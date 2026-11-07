// node walksheet.js <out.png> '<opt json>' file1.json[:label] file2.json[:label] ...
const { chromium } = require('playwright'); const fs = require('fs');
const [out, optJ, ...files] = process.argv.slice(2);
(async () => { const runs = files.map(f => { const [p, l] = f.split(':'); return { line: JSON.parse(fs.readFileSync(p)).line, label: l }; });
  const b = await chromium.launch(), p = await b.newPage(); await p.goto('file://' + __dirname + '/walksheet.html');
  const url = await p.evaluate(([r, o]) => draw(r, o), [runs, JSON.parse(optJ)]); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); await b.close(); })();
