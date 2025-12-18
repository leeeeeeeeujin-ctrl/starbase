const fs = require('fs');

const txt = fs.readFileSync('pages/api/ai-battle-judge.js', 'utf8');
const needle = 'async function processUnifiedGamePrompt';
const idx = txt.indexOf(needle);

if (idx === -1) {
  console.log('needle not found');
  process.exit(0);
}

const start = Math.max(0, idx - 400);
const end = Math.min(txt.length, idx + 6400);

console.log(txt.slice(start, end));
