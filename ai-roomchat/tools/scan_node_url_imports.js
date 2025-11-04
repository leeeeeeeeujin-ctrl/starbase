// Find modules (excluding docs, scripts, .next, node_modules) that import from 'url'
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || process.cwd();
const exts = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'docs' || entry.name === 'scripts') continue;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (exts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  if (/from\s+['"]url['"]/m.test(src) || /require\(\s*['"]url['"]\s*\)/m.test(src)) {
    console.log(file);
  }
}

