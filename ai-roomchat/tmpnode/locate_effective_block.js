const fs = require('fs');

const txt = fs.readFileSync('components/rank/StartClient/useStartClientEngine.js', 'utf8');
const idx = txt.indexOf('effectiveApiKey');
console.log('idx', idx);
if (idx < 0) process.exit(0);
const prefix = txt.slice(0, idx);
const line = prefix.split(/\r?\n/).length;
console.log('approx line', line);
const lines = txt.split(/\r?\n/);
const start = Math.max(1, line - 40);
const end = Math.min(lines.length, line + 80);
for (let i = start; i <= end; i++) {
  console.log(String(i).padStart(4, '0') + ': ' + lines[i - 1]);
}

