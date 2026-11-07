const { chromium } = require('playwright'); const fs = require('fs'); const F=process.env.WDIR || __dirname;
const [src, word, theme, out] = process.argv.slice(2), PAN = process.env.PAN ? JSON.parse(process.env.PAN) : [[480,'8 minutes'],[960,'16 minutes'],[1920,'32 minutes']];
(async () => { const P = JSON.parse(fs.readFileSync(F+'/wide/'+src)).filter((p,i)=>i%2===0); const b=await chromium.launch(), p=await b.newPage(); await p.goto('file://'+F+'/word_in_walk.html');
  const url=await p.evaluate(([P,w,t,pan])=>draw(P,w,pan,t),[P,word,theme,PAN]); fs.writeFileSync(F+'/'+out,Buffer.from(url.split(',')[1],'base64')); await b.close(); })();
