const fs = require('fs');

const txt = fs.readFileSync('workspace/hooks/automation.js', 'utf8');
const lines = txt.split(/\r?\n/);
const end = Math.min(lines.length, 200);
for (let i = 0; i < end; i += 1) {
  console.log(String(i + 1).padStart(4, ' '), lines[i]);
}

