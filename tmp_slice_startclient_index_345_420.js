const fs = require('fs');

const text = fs.readFileSync('ai-roomchat/components/rank/StartClient/index.js', 'utf8');
const lines = text.split('\n');

for (let i = 344; i < 420 && i < lines.length; i += 1) {
  console.log(String(i + 1).padStart(4, ' ') + ': ' + lines[i]);
}

