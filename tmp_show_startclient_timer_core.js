const fs = require('fs');

const text = fs.readFileSync('ai-roomchat/components/rank/StartClient/useStartClientEngine.js', 'utf8');
const lines = text.split('\n');

for (let i = 820; i < 1040 && i < lines.length; i += 1) {
  console.log(String(i + 1).padStart(4, ' ') + ': ' + lines[i]);
}

