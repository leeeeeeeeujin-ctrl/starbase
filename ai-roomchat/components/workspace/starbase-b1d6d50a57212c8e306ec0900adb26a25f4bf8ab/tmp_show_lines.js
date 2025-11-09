const fs=require('fs');
const s=fs.readFileSync('ai-roomchat/starbase/ai-roomchat/lib/rank/matching.js','utf8');
const lines=s.split('\n');
const l=1706;
const start=Math.max(0,l-12);
const end=Math.min(lines.length,l+12);
for(let i=start;i<end;i++){
  console.log((i+1).toString().padStart(4,' ')+': '+lines[i]);
}
