const fs = require('fs');

const path = 'components/rank/StartClient/useStartClientEngine.js';
const text = fs.readFileSync(path, 'utf8');

const needle = 'buildRankContext(';
let idx = text.indexOf(needle);

if (idx === -1) {
  console.log('usage not found');
} else {
  while (idx !== -1) {
    const start = Math.max(0, idx - 400);
    const end = Math.min(text.length, idx + 400);
    console.log('--- usage at', idx, '---');
    console.log(text.slice(start, end));
    idx = text.indexOf(needle, idx + needle.length);
  }
}
