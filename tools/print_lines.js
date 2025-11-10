// Usage: node tools/print_lines.js <path> <from> <to>
const fs = require('fs');
const path = process.argv[2];
const from = parseInt(process.argv[3] || '1', 10);
const to = parseInt(process.argv[4] || '2147483647', 10);
if (!path) {
  console.error('Usage: node tools/print_lines.js <path> <from> <to>');
  process.exit(1);
}
const data = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const start = Math.max(1, from);
const end = Math.min(to, data.length);
for (let i = start; i <= end; i++) {
  const ln = String(i).padStart(5, ' ');
  console.log(ln + ': ' + data[i-1]);
}
console.error(`\n[lines ${start}..${end} of ${data.length}]`);

