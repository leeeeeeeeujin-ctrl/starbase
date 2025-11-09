const fs = require('fs');
const path = process.argv[2];
const start = parseInt(process.argv[3] || '1', 10);
const count = parseInt(process.argv[4] || '250', 10);
const s = fs.readFileSync(path, 'utf8');
const lines = s.split(/\r?\n/);
const from = Math.max(1, start);
const to = Math.min(lines.length, from + count - 1);
for (let i = from; i <= to; i++) {
  console.log(i + ':' + lines[i-1]);
}
