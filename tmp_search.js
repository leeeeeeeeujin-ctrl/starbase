const fs = require('fs');
const path = require('path');

const [targetPath, needle] = process.argv.slice(2);
if (!targetPath || !needle) {
  console.error('Usage: node tmp_search.js <file-or-dir> <needle>');
  process.exit(1);
}

function searchFile(file, pattern) {
  const text = fs.readFileSync(file, 'utf8');
  const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  let m;
  let count = 0;
  while ((m = re.exec(text))) {
    const line = text.slice(0, m.index).split(/\r?\n/).length;
    console.log(`${file}: match at line ${line}`);
    count++;
  }
  return count;
}

function walkAndSearch(root, pattern) {
  let total = 0;
  const stat = fs.statSync(root);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        total += walkAndSearch(full, pattern);
      } else {
        try {
          total += searchFile(full, pattern);
        } catch {
          // ignore unreadable files
        }
      }
    }
  } else {
    total += searchFile(root, pattern);
  }
  console.log(`total matches: ${total}`);
  return total;
}

walkAndSearch(targetPath, needle);
