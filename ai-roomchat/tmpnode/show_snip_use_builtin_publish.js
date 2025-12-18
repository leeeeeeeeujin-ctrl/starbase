const fs = require('fs');

const txt = fs.readFileSync('components/workspace/hooks/useBuiltinRuntime.js', 'utf8');
const tag = 'function publishResult';
const idx = txt.indexOf(tag);

console.log('tag index', idx);
if (idx === -1) process.exit(0);

const start = Math.max(0, idx - 200);
const end = Math.min(txt.length, idx + 2000);
console.log(txt.slice(start, end));

