const fs = require('fs');

const text = fs.readFileSync('ai-roomchat/components/rank/StartClient/useStartClientEngine.js', 'utf8');
const lines = text.split('\n');

for (let i = 0; i < lines.length; i += 1) {
  if (lines[i].includes('turnTimerSeconds')) {
    const start = Math.max(0, i - 10);
    const end = Math.min(lines.length, i + 25);
    for (let j = start; j < end; j += 1) {
      console.log(String(j + 1).padStart(4, ' ') + ': ' + lines[j]);
    }
    console.log('----');
  }
}

