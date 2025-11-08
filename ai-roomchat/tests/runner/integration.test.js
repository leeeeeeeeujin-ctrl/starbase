const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Integration test: run the sandbox runner with a harmless node command and assert expected output
const runner = path.join(__dirname, '..', '..', 'scripts', 'sandbox_run.js');
if (!fs.existsSync(runner)) {
  console.error('sandbox_run.js not found; integration test cannot run.');
  process.exit(0); // skip
}

const nodeCmd = process.execPath; // path to node
const script = '-e';
const code = "console.log('runner-integration-ok')";

console.log('Running integration test: sandbox_run -> node -e "console.log(...)"');
const res = spawnSync('node', [runner, nodeCmd, script, code], { encoding: 'utf8' });
process.stdout.write(res.stdout || '');
process.stderr.write(res.stderr || '');

if (res.status !== 0) {
  console.error('Integration test failed: runner exited with', res.status);
  process.exit(res.status || 1);
}

if (!res.stdout || !res.stdout.includes('runner-integration-ok')) {
  console.error('Integration test unexpected output');
  process.exit(2);
}

console.log('Integration test passed');
process.exit(0);
