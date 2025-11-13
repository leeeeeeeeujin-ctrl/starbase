const fs = require('fs');
const file = process.argv[2];
const needle = process.argv.slice(3).join(' ');
if (!file || !needle) {
  console.error('usage: node tools/grep_text.js <file> <text>');
  process.exit(2);
}
const s = fs.readFileSync(file, 'utf8');
const lines = s.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(needle)) {
    console.log((i + 1) + ':' + lines[i]);
  }
}
