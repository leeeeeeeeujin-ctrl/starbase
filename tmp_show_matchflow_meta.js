const fs = require('fs');
const text = fs.readFileSync('ai-roomchat/lib/rank/matchFlow.js', 'utf8');
const lines = text.split('\n');

for (let i = 200; i < 360 && i < lines.length; i += 1) {
  console.log(String(i + 1).padStart(4, ' ') + ': ' + lines[i]);
}

