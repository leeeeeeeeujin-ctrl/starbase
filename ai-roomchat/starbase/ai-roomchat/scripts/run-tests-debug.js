// Run tests with STARTCLIENT_DEBUG=1 for local debugging (cross-platform)
const { spawn } = require('child_process');

// Ensure the env var is set for the child process
const env = Object.assign({}, process.env, { STARTCLIENT_DEBUG: '1' });

// Run npm test (uses package.json "test" script)

const command = 'npm test --silent';

console.log('Running tests with STARTCLIENT_DEBUG=1 ...');
const path = require('path');
const cwd = path.resolve(__dirname, '..');
const proc = spawn(command, { stdio: 'inherit', env, shell: true, cwd });

proc.on('exit', code => {
  process.exit(code);
});

proc.on('error', err => {
  console.error('Failed to start test process:', err);
  process.exit(1);
});
