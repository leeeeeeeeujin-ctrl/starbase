#!/usr/bin/env node
/* Lightweight test: run the sample prompt CLI and assert compiled.text exists */
const cp = require('child_process');
const path = require('path');

function run() {
  const runner = path.resolve(__dirname, 'make-sample-prompt.js');
  try {
    const out = cp.execFileSync(
      process.execPath,
      [runner, '--template', '테스트: {{slot0.name}}가 행동한다.'],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    const parsed = JSON.parse(out);
    if (!parsed || !parsed.compiled || !parsed.compiled.text) {
      console.error('Test failed: compiled.text missing');
      process.exit(2);
    }
    console.log('OK - compiled.text length=', String(parsed.compiled.text).length);
    process.exit(0);
  } catch (e) {
    console.error('Test failed:', e && e.stdout ? e.stdout.toString() : e.message || String(e));
    process.exit(3);
  }
}

run();
