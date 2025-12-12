const fs = require('fs');

const [file, startStr, endStr] = process.argv.slice(2);
if (!file || !startStr || !endStr) {
  console.error('Usage: node tmp_slice_local.js <file> <startLine> <endLine>');
  process.exit(1);
}

const start = parseInt(startStr, 10);
const end = parseInt(endStr, 10);
if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
  console.error('Invalid line range');
  process.exit(1);
}

const text = fs.readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);
for (let i = start; i <= end && i <= lines.length; i++) {
  console.log(`${i.toString().padStart(4, ' ')}| ${lines[i - 1]}`);
}

