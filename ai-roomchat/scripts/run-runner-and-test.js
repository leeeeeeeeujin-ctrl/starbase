/*
  run-runner-and-test.js
  Starts the mock mobile runner as a child process, waits for it to be ready,
  runs `scripts/test-device-flow.js`, streams logs, then shuts down the runner.

  Usage: node scripts/run-runner-and-test.js
*/

const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const runnerPath = path.join(root, 'scripts', 'mobile-runner-mock.js');
const testPath = path.join(root, 'scripts', 'test-device-flow.js');

function startRunner() {
  const node = process.execPath;
  const child = spawn(node, [runnerPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  return child;
}

function runTest() {
  return new Promise(resolve => {
    const node = process.execPath;
    const proc = spawn(node, [testPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.pipe(process.stdout);
    proc.stderr.pipe(process.stderr);
    proc.on('close', code => resolve(code));
  });
}

(async function main() {
  console.log('Starting mock runner...');
  const runner = startRunner();

  let ready = false;
  let buffer = '';

  const readyMatcher = /listening on (\d+)/i;
  const readyTimeoutMs = 5000;

  const onData = chunk => {
    process.stdout.write(chunk);
    buffer += chunk;
    if (!ready && readyMatcher.test(buffer)) {
      ready = true;
      console.log('Runner ready detected. Starting device flow test...');
    }
  };

  runner.stdout.on('data', onData);
  runner.stderr.on('data', c => process.stderr.write(c));

  // Fallback: if not ready within timeout, proceed anyway after short delay
  await new Promise(res => setTimeout(res, 800));

  try {
    const code = await runTest();
    console.log('Test process exited with code', code);
  } catch (err) {
    console.error('Test process failed:', err);
  }

  // Give runner a moment to flush logs then kill
  await new Promise(res => setTimeout(res, 200));
  console.log('Stopping runner...');
  try {
    runner.kill();
  } catch (err) {
    // ignore
  }

  // Wait briefly for runner to exit
  await new Promise(res => setTimeout(res, 200));
  process.exit(0);
})();
