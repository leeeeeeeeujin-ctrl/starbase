const fs = require('fs');
const s = fs.readFileSync('ai-roomchat/components/maker/editor/MakerEditor.js','utf8');
const lines = s.split(/\r?\n/);
function grep(pattern){
  const re = new RegExp(pattern);
  for (let i=0;i<lines.length;i++){
    if (re.test(lines[i])) console.log((i+1)+': '+lines[i]);
  }
}
console.log('Search overlayStyle/modalStyle refs:');
grep('overlayStyle');
grep('modalStyle');
console.log('--- first 220 lines to check line mapping ---');
for (let i=0;i<Math.min(240,lines.length);i++){
  // Print sparse to avoid huge output
  if (i<30 || i%20===0) console.log((i+1)+': '+lines[i]);
}
