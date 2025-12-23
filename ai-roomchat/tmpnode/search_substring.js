const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const needle = process.argv[3];

if (!file || !needle) {
  console.error('Usage: node search_substring.js <file> <needle>');
  process.exit(1);
}

const full = path.resolve(process.cwd(), file);
const text = fs.readFileSync(full, 'utf8');
const idx = text.indexOf(needle);
console.log('index=', idx);
if (idx >= 0) {
  const start = Math.max(0, idx - 160);
  const end = Math.min(text.length, idx + 200);
  console.log(text.slice(start, end));
}

