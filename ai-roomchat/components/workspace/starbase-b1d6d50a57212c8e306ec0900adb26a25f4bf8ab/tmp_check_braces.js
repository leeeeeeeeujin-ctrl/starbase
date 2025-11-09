const fs=require('fs');
const path='ai-roomchat/starbase/ai-roomchat/lib/rank/matching.js';
const s=fs.readFileSync(path,'utf8');
const stack=[];
for(let i=0;i<s.length;i++){
  const ch=s[i];
  if(ch==='{') stack.push({i, line: s.slice(0,i).split('\n').length});
  else if(ch==='}') stack.pop();
}
if(stack.length){
  const last=stack[stack.length-1];
  console.log('unmatched at index', last.i, 'line', last.line);
} else console.log('balanced');
