const fs = require('fs');
const path = require('path');

// Removes auto-inserted "react-hooks/exhaustive-deps" suppressions
// when the following dependency array is non-empty.

const ROOT = path.resolve(__dirname, '..');
const MATCH =
  '// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod';

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['.next', 'node_modules', 'reports'].includes(e.name)) continue;
      walk(p, files);
    } else if (
      e.isFile() &&
      (p.endsWith('.js') || p.endsWith('.jsx') || p.endsWith('.ts') || p.endsWith('.tsx'))
    ) {
      files.push(p);
    }
  }
  return files;
}

let filesChanged = 0;
let commentsRemoved = 0;

const files = walk(ROOT);
for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === MATCH) {
      // look ahead for a dependency array with at least one entry in the next few lines
      let found = false;
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 8); j++) {
        const l = lines[j];
        // inline array with one or more items
        if (/\[[^\]]+\]/.test(l)) {
          found = true;
          break;
        }
        // opening bracket on its own line -> check for non-empty contents
        if (/^\s*\[\s*$/.test(l)) {
          for (let k = j + 1; k <= Math.min(lines.length - 1, j + 8); k++) {
            if (/^\s*\]\s*,?\s*$/.test(lines[k])) break;
            if (/\S/.test(lines[k])) {
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
      if (found) {
        lines.splice(i, 1);
        commentsRemoved++;
        changed = true;
        i--;
      }
    }
  }
  if (changed) {
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    filesChanged++;
  }
}

console.log('Cleanup complete. Files changed:', filesChanged, 'comments removed:', commentsRemoved);
