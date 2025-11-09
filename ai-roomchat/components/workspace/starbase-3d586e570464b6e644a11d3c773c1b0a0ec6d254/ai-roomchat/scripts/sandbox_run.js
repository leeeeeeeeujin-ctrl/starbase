#!/usr/bin/env node
// Simple sandbox runner: if Docker is available it will run the given command inside a constrained container.
// Otherwise it will spawn a child process with a timeout and return exit code.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function hasDocker() {
  try {
    const out = spawnSync('docker', ['--version'], { encoding: 'utf8' });
    return out.status === 0;
  } catch (e) {
    return false;
  }
}

function runInDocker(cmdArgs) {
  // use node:18-slim as a minimal image
  const dockerArgs = ['run', '--rm', '--memory=256m', '--cpus=0.5', 'node:18-slim'].concat(cmdArgs);
  const res = spawnSync('docker', dockerArgs, { stdio: 'inherit' });
  process.exit(res.status || 0);
}

function runLocal(cmd, args, timeoutMs = 30000) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', timeout: timeoutMs });
  process.exit(res.status || 0);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: sandbox_run.js <command> [args...]');
    process.exit(2);
  }
  if (hasDocker()) {
    console.log('Docker detected — running inside a constrained container');
    // If running in docker, pass the command to /bin/sh -c "cmd..."
    const cmd = argv.join(' ');
    runInDocker(['/bin', 'sh', '-c', cmd]);
  } else {
    console.log('Docker not found — running locally with a timeout (best-effort sandbox)');
    const cmd = argv[0];
    const args = argv.slice(1);
    runLocal(cmd, args);
  }
}

main();
