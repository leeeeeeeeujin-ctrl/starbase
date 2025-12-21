const fs = require('fs');

const path = 'components/rank/StartClient/index.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);

const start = 640;
const end = 715;

for (let i = start; i < end && i < lines.length; i += 1) {
  console.log(String(i + 1).padStart(4, ' ') + ': ' + lines[i]);
}
