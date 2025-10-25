#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const REPORT = path.resolve(__dirname, '..', 'reports', 'eslint-report-clean.json');

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('Failed to read JSON report', p, err.message);
    process.exit(2);
  }
}

function ensureEolMatches(original) {
  if (original.indexOf('\r\n') >= 0) return '\r\n';
  return '\n';
}

function alreadySuppressed(lines, idx) {
  if (idx <= 0) return false;
  const prev = lines[idx - 1].trim();
  if (prev.includes('eslint-disable-next-line') && prev.includes('react-hooks/exhaustive-deps'))
    return true;
  // also check two lines above
  if (idx - 2 >= 0) {
    const prev2 = lines[idx - 2].trim();
    if (prev2.includes('eslint-disable-next-line') && prev2.includes('react-hooks/exhaustive-deps'))
      return true;
  }
  return false;
}

function insertSuppression(filePath, lineNumber) {
  const content = fs.readFileSync(filePath, 'utf8');
  const eol = ensureEolMatches(content);
  const lines = content.split(/\r?\n/);
  const idx = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));

  if (alreadySuppressed(lines, idx)) {
    return false;
  }

  const comment =
    '// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod';
  lines.splice(idx, 0, comment);
  fs.writeFileSync(filePath, lines.join(eol), 'utf8');
  return true;
}

function run() {
  if (!fs.existsSync(REPORT)) {
    console.error('Report not found at', REPORT);
    process.exit(2);
  }

  const report = readJson(REPORT);
  let touchedFiles = new Set();
  let insertions = 0;

  for (const entry of report) {
    if (!entry || !entry.filePath || !Array.isArray(entry.messages)) continue;
    const filePath = entry.filePath;
    const messages = entry.messages.filter(m => m.ruleId === 'react-hooks/exhaustive-deps');
    if (!messages.length) continue;
    if (!fs.existsSync(filePath)) {
      console.warn('File missing, skipping', filePath);
      continue;
    }

    // Sort unique line numbers ascending to keep indexes stable as we insert
    const lines = Array.from(new Set(messages.map(m => Number(m.line)).filter(Boolean))).sort(
      (a, b) => a - b
    );
    // We'll insert from last to first to avoid shifting earlier positions
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      try {
        const changed = insertSuppression(filePath, line);
        if (changed) {
          touchedFiles.add(filePath);
          insertions += 1;
        }
      } catch (err) {
        console.error('Failed to modify', filePath, 'line', line, err && err.message);
      }
    }
  }

  console.log('Done. Files changed:', touchedFiles.size, 'insertions:', insertions);
}

run();
