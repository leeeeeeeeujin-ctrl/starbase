const fs = require('fs');

const text = fs.readFileSync('ai-roomchat/modules/rank/matchDataStore.js', 'utf8');
const lines = text.split('\n');

for (let i = 620; i < 820 && i < lines.length; i += 1) {
  console.log(String(i + 1).padStart(4, ' ') + ': ' + lines[i]);
}
