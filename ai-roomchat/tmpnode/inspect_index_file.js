const fs = require('fs');

const txt = fs.readFileSync('components/rank/StartClient/index.js');
const s = txt.toString('utf8');
console.log('len', s.length);
console.log('first120:', JSON.stringify(s.slice(0, 120)));
console.log('includes GameShell?', s.includes('GameShell'));
console.log('includes runtimeBus?', s.includes('runtimeBus'));

const idxBus = s.indexOf('runtimeBus');
if (idxBus >= 0) {
  const start = Math.max(0, idxBus - 200);
  const end = Math.min(s.length, idxBus + 200);
  console.log('runtimeBus context:\n', s.slice(start, end));
}
