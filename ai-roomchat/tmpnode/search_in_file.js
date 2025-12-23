const fs = require('fs');

const file = process.argv[2];
const needle = process.argv[3];

if (!file || !needle) {
  console.error('Usage: node search_in_file.js <file> <needle>');
  process.exit(1);
}

const txt = fs.readFileSync(file, 'utf8');
const lines = txt.split(/\r?\n/);
lines.forEach((line, idx) => {
  if (line.includes(needle)) {
    console.log(String(idx + 1).padStart(4, '0') + ': ' + line);
  }
});

