const fs=require('fs');
const path='ai-roomchat/starbase/ai-roomchat/lib/rank/matching.js';
const s=fs.readFileSync(path,'utf8');
const stack=[];
for(let i=0;i<s.length;i++){
  const ch=s[i];
  if(ch==='{') stack.push({i, line: s.slice(0,i).split('\n').length});
  else if(ch==='}') stack.pop();
}
const lines=s.split('\n');
if(stack.length){
  for(const item of stack){
    const lineNum=item.line;
    console.log('UNMATCHED at index',item.i,'line',lineNum);
    console.log('--- context ---');
    const start=Math.max(0,lineNum-4);
    const end=Math.min(lines.length,lineNum+2);
    for(let i=start;i<end;i++){
      console.log((i+1).toString().padStart(4,' ')+': '+lines[i]);
    }
    console.log('---------------\n');
  }
} else {
  console.log('balanced');
}
