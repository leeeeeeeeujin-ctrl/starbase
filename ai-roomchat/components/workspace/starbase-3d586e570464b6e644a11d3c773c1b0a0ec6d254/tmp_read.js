const fs = require('fs');
const path = process.argv[2] || 'ai-roomchat/components/maker/editor/MakerEditor.js';
const start = parseInt(process.argv[3] || '1', 10);
const end = parseInt(process.argv[4] || '200000', 10);
const txt = fs.readFileSync(path, 'utf8');
const lines = txt.split(/\r?\n/);
for (let i = Math.max(1, start); i <= Math.min(lines.length, end); i++) {
  console.log(i + ':' + lines[i - 1]);
}
