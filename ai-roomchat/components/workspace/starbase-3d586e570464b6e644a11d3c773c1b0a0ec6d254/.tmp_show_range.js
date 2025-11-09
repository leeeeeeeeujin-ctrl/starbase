const fs = require('fs');
const s = fs.readFileSync('ai-roomchat/components/maker/editor/MakerEditor.js','utf8');
const lines = s.split(/\r?\n/);
const start = 160, end = 190;
for (let i=start;i<=end;i++){
  console.log(i+': '+(lines[i]??''));
}
