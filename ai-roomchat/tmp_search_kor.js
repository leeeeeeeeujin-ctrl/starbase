const fs = require('fs');
const path = require('path');

const needle = process.argv[2];
if (!needle) {
  console.error('Usage: node tmp_search_kor.js <substring>');
  process.exit(1);
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'out',
  'android',
  'ios',
  'playwright-report',
  'test-results',
]);

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full);
    } else if (stat.isFile()) {
      let text;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (text.includes(needle)) {
        console.log(full);
      }
    }
  }
}

walk('.');

