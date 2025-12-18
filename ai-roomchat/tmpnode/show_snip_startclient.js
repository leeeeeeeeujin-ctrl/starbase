const fs = require('fs');

const txt = fs.readFileSync('components/rank/StartClient/index.js', 'utf8');
const tag = process.argv[2] || 'createCoreRuntime';
const idx = txt.indexOf(tag);

console.log('tag index', idx);
if (idx === -1) process.exit(0);

const start = Math.max(0, idx - 400);
const end = Math.min(txt.length, idx + 1600);
console.log(txt.slice(start, end));

