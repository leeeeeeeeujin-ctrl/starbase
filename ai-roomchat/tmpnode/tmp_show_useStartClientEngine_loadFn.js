const fs = require('fs');

const text = fs.readFileSync('components/rank/StartClient/useStartClientEngine.js', 'utf8');
const needle = 'async function load() {';
let idx = text.indexOf(needle);

if (idx === -1) {
  console.log('load() not found');
} else {
  const start = Math.max(0, idx - 260);
  const end = Math.min(text.length, idx + 2000);
  console.log(text.slice(start, end));
}

