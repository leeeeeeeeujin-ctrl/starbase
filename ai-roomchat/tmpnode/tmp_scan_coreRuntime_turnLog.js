const fs = require('fs');

const path = 'lib/runtime/coreRuntime.js';
const text = fs.readFileSync(path, 'utf8');
const needle = 'runtime:turn-log';
const idx = text.indexOf(needle);

if (idx === -1) {
  console.log('needle not found');
} else {
  const start = Math.max(0, idx - 400);
  const end = Math.min(text.length, idx + 800);
  console.log(text.slice(start, end));
}

