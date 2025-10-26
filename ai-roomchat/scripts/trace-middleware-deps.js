const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'middleware.js');

const exts = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

const seen = new Set();
const flagged = [];

function resolveModule(fromFile, spec) {
  if (!spec || spec.startsWith('http') || spec.startsWith('https')) return null;
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // skip node_modules
  const baseDir = path.dirname(fromFile);
  let p = path.resolve(baseDir, spec);
  // if file exists
  for (const ext of exts) {
    if (fs.existsSync(p + ext)) return p + ext;
  }
  // if directory with index
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    for (const ext of exts) {
      const idx = path.join(p, 'index' + ext);
      if (fs.existsSync(idx)) return idx;
    }
  }
  // maybe spec already has extension
  if (fs.existsSync(p)) return p;
  return null;
}

function scan(file) {
  if (!file) return;
  const real = path.resolve(file);
  if (seen.has(real)) return;
  seen.add(real);
  let src;
  try {
    src = fs.readFileSync(real, 'utf8');
  } catch (e) {
    return;
  }
  // flag node-only API usage
  const checks = [];
  if (/__dirname/.test(src)) checks.push('__dirname');
  if (/\bfrom\s+['\"]fs['\"]/m.test(src) || /require\(['\"]fs['\"]\)/m.test(src) || /import\s+fs\s+from\s+['\"]fs['\"]/m.test(src)) checks.push('fs');
  if (/process\.cwd\(/.test(src)) checks.push('process.cwd');
  if (checks.length) flagged.push({ file: real, checks });

  // find imports and requires
  const importRegex = /import\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

  const addMatch = (m) => {
    const spec = m[1];
    const resolved = resolveModule(real, spec);
    if (resolved) scan(resolved);
  };

  let m;
  while ((m = importRegex.exec(src)) !== null) addMatch(m);
  while ((m = dynamicImportRegex.exec(src)) !== null) addMatch(m);
  while ((m = requireRegex.exec(src)) !== null) addMatch(m);
}

scan(entry);

console.log('Scanned files count:', seen.size);
if (flagged.length === 0) {
  console.log('No node-only API usage detected in middleware import graph.\n');
} else {
  console.log('Flagged files using Node-only APIs:');
  for (const f of flagged) {
    console.log('-', path.relative(root, f.file), '->', f.checks.join(', '));
  }
}

console.log('\nFull list of visited files:');
for (const f of Array.from(seen)) {
  console.log('-', path.relative(root, f));
}
