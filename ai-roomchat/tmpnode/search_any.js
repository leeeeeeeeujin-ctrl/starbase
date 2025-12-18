const fs = require('fs');
const path = require('path');

const needle = process.argv[2];
if (!needle) {
  console.error('Usage: node tmpnode/search_any.js <substring>');
  process.exit(1);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full);
    } else if (stat.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry)) {
      const text = fs.readFileSync(full, 'utf8');
      if (text.includes(needle)) {
        console.log(full);
      }
    }
  }
}

walk('.');

