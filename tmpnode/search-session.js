const fs = require('fs');
const path = require('path');

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, cb);
    } else {
      cb(full);
    }
  }
}

walk('.', (file) => {
  if (!/\.(js|jsx|ts|tsx|sql|md|json)$/.test(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('session_id')) {
    console.log(file);
  }
});

