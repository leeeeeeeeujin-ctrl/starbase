const fs = require('fs');
const path = require('path');

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      const txt = fs.readFileSync(full, 'utf8');
      if (txt.includes('<EditorMonaco')) {
        console.log(full);
      }
    }
  }
}

walk(process.argv[2] || '.');

