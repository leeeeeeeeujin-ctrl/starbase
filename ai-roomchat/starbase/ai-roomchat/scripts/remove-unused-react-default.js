#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDE = new Set(['.git', 'node_modules', '.next', 'public', 'playwright-report', 'reports', 'supabase']);
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx']);

let filesChanged = 0;
let importsRemoved = 0;

function shouldSkip(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (!rel) return true;
  const parts = rel.split(path.sep);
  if (parts.some(p => EXCLUDE.has(p))) return true;
  return false;
}

function walk(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (shouldSkip(full)) continue;
    if (it.isDirectory()) walk(full);
    else if (it.isFile() && EXT.has(path.extname(it.name))) processFile(full);
  }
}

function processFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  // find imports like: import React, { useState } from 'react';
  // or import React from 'react';
  const importRegex = /^(\s*)import\s+React(\s*,\s*\{([^}]+)\})?\s+from\s+['"]react['"];?\s*$/m;
  const m = src.match(importRegex);
  if (!m) return;

  // Check if 'React' is referenced elsewhere in file (word boundary)
  // exclude the import line itself
  const rest = src.replace(importRegex, '');
  const usesReact = /\bReact\b/.test(rest);
  if (usesReact) return; // can't remove default import safely

  // If there are named imports after default, move them to named imports only
  const named = m[3];
  let replacement = '';
  if (named && named.trim()) {
    replacement = `${m[1] || ''}import { ${named.trim()} } from 'react';`;
  } else {
    replacement = ''; // remove entire import
  }

  const updated = src.replace(importRegex, replacement);
  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8');
    filesChanged++;
    importsRemoved++;
    console.log(`Patched ${file}`);
  }
}

console.log('Scanning for files with unused default React import...');
walk(ROOT);
console.log(`Done. Files changed: ${filesChanged}, imports modified/removed: ${importsRemoved}`);
process.exit(0);
