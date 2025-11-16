const fs = require('fs');
const path = require('path');

function walk(dir, needle) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, needle);
    } else {
      const text = fs.readFileSync(full, 'utf8');
      if (text.includes(needle)) {
        console.log(full);
      }
    }
  }
}

const dir = process.argv[2] || '.';
const needle = process.argv[3] || '';

if (!needle) {
  console.error('Usage: node tmp_grep_workspace.js <dir> <needle>');
  process.exit(1);
}

walk(dir, needle);

