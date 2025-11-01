#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Simple Blockly->JS PoC converter.
// Input: JSON array of blocks with a minimal shape. This is intentionally tiny and
// not a full Blockly runtime. It's a convenience script to demonstrate pipeline.

const infile = process.argv[2] || 'workflows/blockly-sample.json';
const outfile = process.argv[3] || 'workflows/blockly-sample.out.js';

function convert(blocks) {
  // Very small DSL: blocks are { type: 'print', text: 'hello' } or { type: 'set', name, value }
  const lines = [];
  for (const b of blocks) {
    if (b.type === 'print') {
      lines.push(`console.log(${JSON.stringify(b.text)});`);
    } else if (b.type === 'set') {
      lines.push(`let ${b.name} = ${JSON.stringify(b.value)};`);
    } else if (b.type === 'math_add') {
      lines.push(`/* math_add ${JSON.stringify(b)} */`);
    } else {
      lines.push(`/* unknown block ${JSON.stringify(b)} */`);
    }
  }
  return lines.join('\n');
}

try {
  const src = fs.readFileSync(path.resolve(infile), 'utf8');
  const blocks = JSON.parse(src);
  const js = convert(blocks);
  fs.writeFileSync(path.resolve(outfile), js, 'utf8');
  console.log('Wrote', outfile);
} catch (e) {
  console.error('Error converting:', e.message);
  process.exit(2);
}
