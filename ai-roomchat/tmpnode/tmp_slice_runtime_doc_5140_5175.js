const fs = require('fs');

const text = fs.readFileSync('docs/WORKSPACE_EDITOR_RUNTIME.md', 'utf8');
const lines = text.split('\n');

const start = 5140 - 1;
const end = 5175;

for (let i = start; i < Math.min(end, lines.length); i += 1) {
  console.log(String(i + 1).padStart(4, ' ') + ':' + lines[i]);
}

