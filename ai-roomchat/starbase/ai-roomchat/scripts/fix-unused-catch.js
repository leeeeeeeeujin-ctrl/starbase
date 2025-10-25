#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDE = ['.git', 'node_modules', '.next', 'public', 'playwright-report', 'reports'];
const EXT = ['.js', '.jsx', '.ts', '.tsx'];

let filesChanged = 0;
let totalReplacements = 0;

function shouldSkip(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (!rel) return true;
  const parts = rel.split(path.sep);
  if (parts.some(p => EXCLUDE.includes(p))) return true;
  return false;
}

function walk(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (shouldSkip(full)) continue;
    if (it.isDirectory()) walk(full);
    else if (it.isFile() && EXT.includes(path.extname(it.name))) processFile(full);
  }
}

function processFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  let original = src;
  let replaced = 0;

  // 1) catch (_e) {} -> catch (_e) {}
  src = src.replace(/catch\s*\(\s*(e|err|error)\s*\)\s*\{\s*\}/g, (m, p1) => {
    replaced++;
    return `catch (_${p1}) {}`;
  });

  // 2) .catch((_e) => {}) or .catch((_e) => {}) -> .catch((_e) => {}) only when body empty
  src = src.replace(/\.catch\s*\(\s*\(?\s*(e|err|error)\s*\)?\s*=>\s*\{\s*\}\s*\)/g, (m, p1) => {
    replaced++;
    return `.catch((_${p1}) => {})`;
  });

  // 3) .catch(async (_e) => {})
  src = src.replace(
    /\.catch\s*\(\s*async\s*\(?\s*(e|err|error)\s*\)?\s*=>\s*\{\s*\}\s*\)/g,
    (m, p1) => {
      replaced++;
      return `.catch(async (_${p1}) => {})`;
    }
  );

  if (replaced > 0 && src !== original) {
    fs.writeFileSync(file, src, 'utf8');
    filesChanged++;
    totalReplacements += replaced;
    console.log(`Patched ${file} (replacements: ${replaced})`);
  }
}

console.log('Scanning for empty catch handlers...');
walk(ROOT);
console.log(`Done. Files changed: ${filesChanged}, total replacements: ${totalReplacements}`);
process.exit(0);
