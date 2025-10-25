#!/usr/bin/env node
/**
 * Scan a run batch directory and extract matching-debug JSON blocks from failed runs.
 * Usage: node scripts/collectFailurePayloads.js <batchDir> [max=5]
 */
const fs = require('fs');
const path = require('path');

const batchDir = process.argv[2] || path.join(__dirname, '..', 'logs', fs.readdirSync(path.join(__dirname, '..', 'logs')).filter(n=>n.startsWith('batch-')).sort().reverse()[0]);
const maxCollect = Number(process.argv[3]) || 5;

if (!fs.existsSync(batchDir)) {
  console.error('Batch dir not found:', batchDir);
  process.exit(1);
}

const files = fs.readdirSync(batchDir).filter(f => f.endsWith('.log'));
const extracted = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(batchDir, file), 'utf8');
  // only process files that contain matching debug blocks
  if (!/\[matching-debug\]/.test(content)) continue;
  // find the last occurrence of the marker and capture the following indented JSON block
  const marker = '[matching-debug]';
  const idx = content.lastIndexOf(marker);
  if (idx === -1) continue;
  const after = content.slice(idx + marker.length);
  // split by lines and gather until next top-level log marker (line starting with '[')
  const lines = after.split(/\r?\n/);
  const blockLines = [];
  for (const line of lines) {
    if (line.trim().length === 0) {
      if (blockLines.length) break; // stop at first blank line after block
      continue;
    }
    // stop if next log marker (e.g. [realTableSimulator] ...) appears
    if (/^\s*\[[^\]]+\]/.test(line) && blockLines.length) break;
    blockLines.push(line);
  }
  const raw = blockLines.join('\n').trim();
  if (!raw) continue;
  try {
    const parsed = JSON.parse(raw);
    extracted.push({ runLog: file, payload: parsed });
    if (extracted.length >= maxCollect) break;
  } catch (e) {
    // ignore parse errors
  }
}

const outPath = path.join(batchDir, 'failure-samples.json');
fs.writeFileSync(outPath, JSON.stringify(extracted, null, 2));
console.log(`Extracted ${extracted.length} failure samples to ${outPath}`);
