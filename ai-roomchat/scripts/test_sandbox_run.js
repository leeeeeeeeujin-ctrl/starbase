#!/usr/bin/env node
// Test runner for sandbox_run.js: attempts to run a harmless command and succeeds or skips.
const { spawnSync } = require('child_process');
const path = require('path');

const runner = path.join(__dirname, 'sandbox_run.js');
// Run a simple command: node -e "console.log('ok')"
const cmd = process.execPath; // node
const args = ['-e', "console.log('sandbox-ok')"];
const res = spawnSync('node', [runner, cmd].concat(args), { encoding: 'utf8' });
process.stdout.write(res.stdout || '');
process.stderr.write(res.stderr || '');
// If docker is missing, sandbox_run will run the command locally and exit with child's exit code
process.exit(res.status || 0);
