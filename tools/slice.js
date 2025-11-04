const fs=require('fs');
const p=process.argv[2];
const start=parseInt(process.argv[3]||'0',10);
const len=parseInt(process.argv[4]||'500',10);
const s=fs.readFileSync(p,'utf8');
const a=Math.max(0,start);
const b=Math.min(s.length,a+len);
console.log(s.slice(a,b));
