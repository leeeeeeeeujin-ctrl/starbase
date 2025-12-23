const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const start = parseInt(process.argv[3] || '1', 10);
const end = parseInt(process.argv[4] || '2000000000', 10);

if (!file) {
  console.error('Usage: node tmp_read_segment.js <file> <startLine> <endLine>');
  process.exit(1);
}

const full = path.resolve(process.cwd(), file);

const data = fs.readFileSync(full, 'utf8').split(/\r?\n/);
for (let i = start; i <= end && i <= data.length; i++) {
  const line = data[i - 1];
  process.stdout.write(String(i).padStart(4, '0') + ': ' + line + '\n');
}

