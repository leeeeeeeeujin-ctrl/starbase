// Scan for bare `URL(` calls that are not prefixed by `new` (best-effort)
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || process.cwd();

const exts = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (exts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function scan(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const reBare = /(^|[^.\w$])URL\s*\(/; // excludes URL.createObjectURL etc.
  const reNew = /new\s+URL\s*\(/;
  lines.forEach((line, i) => {
    if (reBare.test(line) && !reNew.test(line)) {
      console.log(`${file}:${i + 1}:${line.trim()}`);
    }
  });
}

for (const f of walk(ROOT)) scan(f);
