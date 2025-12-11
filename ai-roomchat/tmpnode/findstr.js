const fs=require('fs');
const p=process.argv[2];
const q=process.argv[3] || '';
if(!p||!q){console.error('usage: node tmpnode/findstr.js <file> <needle>');process.exit(1);}
const s=fs.readFileSync(p,'utf8');
const lines=s.split(/\r?\n/);
// console.log('lines',lines.length,'needle',q);
lines.forEach((l,i)=>{if(l.includes(q))console.log((i+1)+':'+l);});
