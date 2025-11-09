#!/usr/bin/env node
// Test runner for WASM PoC: runs wasm_poc.js and reports status. If wasm not compiled, will exit 0 (skip).
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const wasm = path.join(__dirname, '..', 'wasm', 'add.wasm');
const proc = spawnSync('node', [path.join(__dirname, 'wasm_poc.js')], { encoding: 'utf8' });
process.stdout.write(proc.stdout || '');
process.stderr.write(proc.stderr || '');
// If no wasm file existed, wasm_poc.js exits 0 after printing instructions — treat as skip/success
if (!fs.existsSync(wasm)) {
  console.log('No compiled wasm present; test skipped. To run, compile add.wat with `wat2wasm`.');
  process.exit(0);
}
process.exit(proc.status || 0);
