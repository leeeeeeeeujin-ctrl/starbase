const fs=require('fs');
const file=process.argv[2];
const needle=process.argv[3]||'type="file"';
const s=fs.readFileSync(file,'utf8');
const lines=s.split(/\r?\n/);
for(let i=0;i<lines.length;i++){
  if(lines[i].includes(needle)){
    const start=Math.max(0,i-30), end=Math.min(lines.length,i+80);
    console.log('--- at',i+1,'---');
    for(let j=start;j<end;j++) console.log((j+1)+':'+lines[j]);
  }
}
