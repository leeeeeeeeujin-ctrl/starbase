const fs=require('fs');
const file=process.argv[2];
const rawNeedle=process.argv[3]||'';
const needle=new RegExp(rawNeedle,'g');
const s=fs.readFileSync(file,'utf8');
let m; let count=0;
while((m=needle.exec(s))){
  count++;
  const i=m.index; const pre=Math.max(0,i-120); const post=Math.min(s.length,i+200);
  console.log(`-- hit ${count} at ${i} --`);
  console.log(s.slice(pre,post));
}
console.log('total hits',count);
