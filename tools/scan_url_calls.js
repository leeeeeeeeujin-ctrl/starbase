const fs = require('fs');
const path = require('path');

function walk(dir, out=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx)$/i.test(ent.name)) out.push(p);
  }
  return out;
}

const root = process.argv[2] || 'ai-roomchat';
const files = walk(root);
const reCall = /(^|[^.])\bURL\s*\(/;

for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const lines = s.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (reCall.test(line)) {
      console.log(`${f}:${i+1}: ${line.trim()}`);
    }
  });
}

