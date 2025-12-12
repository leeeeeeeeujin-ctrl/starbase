const fs = require('fs');

const text = fs.readFileSync('ai-roomchat/docs/WORKSPACE_EDITOR_RUNTIME.md', 'utf8');
const lines = text.split('\n');

const start = Math.max(0, lines.length - 220);
for (let i = start; i < lines.length; i += 1) {
  console.log(String(i + 1).padStart(4, ' ') + ':' + lines[i]);
}

