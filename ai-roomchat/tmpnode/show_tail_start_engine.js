const fs = require('fs');

const txt = fs.readFileSync('components/rank/StartClient/useStartClientEngine.js', 'utf8');
const lines = txt.split(/\r?\n/);
const start = Math.max(0, lines.length - 200);
for (let i = start; i < lines.length; i += 1) {
  console.log(String(i + 1).padStart(5, ' '), lines[i]);
}

