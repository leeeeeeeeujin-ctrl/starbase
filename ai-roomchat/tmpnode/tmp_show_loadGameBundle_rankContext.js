const fs = require('fs');

const path = 'components/rank/StartClient/engine/loadGameBundle.js';
const text = fs.readFileSync(path, 'utf8');
const needle = 'rankContext';
const idx = text.indexOf(needle);

if (idx === -1) {
  console.log('needle not found');
} else {
  const start = Math.max(0, idx - 400);
  const end = Math.min(text.length, idx + 400);
  console.log(text.slice(start, end));
}

