# draw a word N ways (random picks among each letter's top 3, different join seeds); keep the one with the best letters and joins
W=$1; N=$2; F=${OUT:-.}
for s in $(seq 1 $N); do P=$(node -e "const w='$W'.replace(/ /g,'');let s=$s*7;const r=()=>(s=(s*9301+49297)%233280)/233280;console.log([...w].map(()=>Math.floor(r()*r()*3)).join(','))"); node join_word.js $F/bo_${W// /_}_$s.json $s "$W" ${FOUND:-found_alphabet.json} $P > $F/bo_${W// /_}_$s.log; done
node -e "
const fs=require('fs'),F='$F',W='$W'.replace(/ /g,'_'),FA=JSON.parse(fs.readFileSync(process.env.FOUND||"found_alphabet.json"));
const r=[];for(let s=1;s<=$N;s++){const log=fs.readFileSync(F+'/bo_'+W+'_'+s+'.log','utf8');const miss=[...log.matchAll(/close: ([0-9.]+)/g)].reduce((a,m)=>a+(+m[1]),0);r.push({s,miss,log:log.trim()});}
r.sort((a,b)=>a.miss-b.miss);console.log(r.slice(0,3).map(x=>x.s+' miss '+x.miss.toFixed(2)).join(' | '));fs.writeFileSync(F+'/bo_'+W+'_best.txt',r.slice(0,3).map(x=>x.s).join(' '));"
