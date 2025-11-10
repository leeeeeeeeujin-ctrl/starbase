const fs = require('fs');
const path = process.argv[2];
const start = parseInt(process.argv[3] || '1', 10);
const end = parseInt(process.argv[4] || '1000000', 10);
const s = fs.readFileSync(path, 'utf8');
const a = s.split(/\r?\n/);
for (let i = Math.max(1, start); i <= Math.min(a.length, end); i++) {
  console.log(String(i).padStart(4, '0') + ': ' + a[i-1]);
}
