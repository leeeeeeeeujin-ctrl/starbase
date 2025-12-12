const fs = require('fs');
const path = require('path');

const needle = process.argv[2];
if (!needle) {
  console.error('Usage: node tmp_search_all.js <substring>');
  process.exit(1);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next') continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (stat.isFile() && /\.(js|jsx|ts|tsx|md)$/.test(entry)) {
      const text = fs.readFileSync(full, 'utf8');
      if (text.includes(needle)) {
        console.log(full);
      }
    }
  }
}

walk('.');

