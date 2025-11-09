const fs=require('fs'); 
const p=process.argv[2]; 
const a=parseInt(process.argv[3]); 
const b=parseInt(process.argv[4]); 
const s=fs.readFileSync(p,'utf8'); 
const lines=s.split(/\r?\n/); 
const seg=lines.slice(a-1,b); 
seg.forEach(function(l,idx){ console.log((a+idx)+':'+l); }); 
