const fs = require('fs');

const path = 'components/rank/StartClient/useStartClientEngine.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);

const start = 4268;
const end = 4320;

for (let i = start; i < end && i < lines.length; i += 1) {
  console.log(String(i + 1).padStart(4, ' ') + ': ' + lines[i]);
}

