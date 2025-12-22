const fs = require('fs');

const text = fs.readFileSync('components/rank/StartClient/index.js', 'utf8');
const needle = "runtime:turn-log";
let idx = text.indexOf(needle);

if (idx === -1) {
  console.log('needle not found');
} else {
  while (idx !== -1) {
    const start = Math.max(0, idx - 400);
    const end = Math.min(text.length, idx + 400);
    console.log('--- occurrence at', idx, '---');
    console.log(text.slice(start, end));
    idx = text.indexOf(needle, idx + needle.length);
  }
}

