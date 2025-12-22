const fs = require('fs');

const text = fs.readFileSync('ai-roomchat/components/rank/StartClient/useStartClientEngine.js', 'utf8');
const idx = text.indexOf('textRuntimeEnabled');
console.log('index', idx);
if (idx !== -1) {
  const start = Math.max(0, idx - 200);
  const end = Math.min(text.length, idx + 200);
  console.log(text.slice(start, end));
}

