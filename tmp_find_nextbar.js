const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'ai-roomchat', 'components', 'game', 'MainGameMobileUI.jsx');
const text = fs.readFileSync(target, 'utf8');
const lines = text.split('\n');

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  if (
    line.includes('NextBar') ||
    line.includes('다음') ||
    line.includes('▶') ||
    line.includes('next bar')
  ) {
    const start = Math.max(0, i - 5);
    const end = Math.min(lines.length, i + 20);
    for (let j = start; j < end; j += 1) {
      const num = String(j + 1).padStart(4, ' ');
      const raw = lines[j];
      console.log(num + ': ' + raw);
      if (j >= 538 && j <= 555) {
        console.log('    JSON=' + JSON.stringify(raw));
      }
    }
    console.log('----');
  }
}
