const fs = require('fs');

const text = fs.readFileSync('components/rank/StartClient/useStartClientEngine.js', 'utf8');
const needle = 'loadGameBundle';
let idx = text.indexOf(needle);

if (idx === -1) {
  console.log('loadGameBundle not found');
} else {
  while (idx !== -1) {
    const start = Math.max(0, idx - 260);
    const end = Math.min(text.length, idx + 800);
    console.log('--- loadGameBundle at', idx, '---');
    console.log(text.slice(start, end));
    idx = text.indexOf(needle, idx + needle.length);
  }
}

