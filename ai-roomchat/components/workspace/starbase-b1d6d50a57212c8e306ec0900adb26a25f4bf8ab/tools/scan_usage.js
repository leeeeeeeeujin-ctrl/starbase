const fs = require('fs');
const path = require('path');

function isCode(p) {
  return /\.(jsx?|tsx?)$/i.test(p);
}

function walk(dir, hits = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p, hits);
    } else if (isCode(p)) {
      try {
        const s = fs.readFileSync(p, 'utf8');
        if (s.includes('CodeWorkspaceProvider')) {
          hits.push(p);
        }
      } catch {}
    }
  }
  return hits;
}

const root = path.join(process.cwd(), 'ai-roomchat');
const hits = walk(root, []);
console.log(hits.join('\n'));

