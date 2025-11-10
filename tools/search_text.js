// Usage: node tools/search_text.js <root> <pattern>
const fs = require('fs');
const path = require('path');
const root = process.argv[2] || '.';
const pattern = new RegExp(process.argv[3] || '.', 'i');
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === '.git') continue;
      walk(p);
    } else {
      if (!/\.(js|jsx|ts|tsx|json|md)$/.test(name)) continue;
      let text;
      try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
      if (pattern.test(text)) {
        console.log(p);
      }
    }
  }
}
walk(root);

