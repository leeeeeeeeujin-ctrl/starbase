const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'ai-roomchat', 'out', '_next', 'static', 'chunks', '8785.29aba6aa568669a8.js.map');
const raw = fs.readFileSync(target, 'utf8');
const map = JSON.parse(raw);

const contents = map.sourcesContent || [];
for (let i = 0; i < contents.length; i += 1) {
  const src = contents[i];
  if (typeof src === 'string' && src.includes('START_SESSION_KEYS')) {
    console.log('found index', i);
    console.log('source path', map.sources[i]);
    process.exit(0);
  }
}

console.log('not found');

