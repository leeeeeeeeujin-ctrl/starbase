const fs = require('fs');
const path = require('path');

const needle = process.argv[2];
if (!needle) {
  console.error('Usage: node tmpnode/search_local.js <substring>');
  process.exit(1);
}

const ROOTS = ['components', 'pages'];

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (stat.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry)) {
      const text = fs.readFileSync(full, 'utf8');
      if (text.includes(needle)) {
        console.log(full);
      }
    }
  }
}

for (const root of ROOTS) {
  if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
    walk(root);
  }
}
