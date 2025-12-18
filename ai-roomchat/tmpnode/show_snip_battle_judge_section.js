const fs = require('fs');

const txt = fs.readFileSync('pages/api/ai-battle-judge.js', 'utf8');
const tag = process.argv[2] || 'runWithRetries';
const idx = txt.indexOf(tag);

if (idx === -1) {
  console.log('tag not found:', tag);
  process.exit(0);
}

const start = Math.max(0, idx - 400);
const end = Math.min(txt.length, idx + 2000);

console.log(txt.slice(start, end));

