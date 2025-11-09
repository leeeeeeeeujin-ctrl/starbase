const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const cwd = path.resolve(__dirname, '..');
const infile = path.join(cwd, 'workflows', 'blockly-sample.json');
const outfile = path.join(cwd, 'workflows', 'blockly-sample.out.js');

// run converter first
console.log('Converting blockly sample...');
const conv = spawn(process.execPath, [require.resolve('./blockly_poc.js'), infile, outfile], { stdio: 'inherit' });
conv.on('exit', (code) => {
  if (code !== 0) {
    console.error('Conversion failed', code); process.exit(2);
  }
  if (!fs.existsSync(outfile)) {
    console.error('Converted file not found'); process.exit(3);
  }
  console.log('Launching isolated child to run converted JS...');
  const child = spawn(process.execPath, [require.resolve('./blockly_child.js'), outfile], { stdio: ['ignore','pipe','pipe'] });
  let out = '';
  child.stdout.on('data', (b) => out += b.toString());
  child.stderr.on('data', (b) => process.stderr.write(b));
  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
  }, 2000);
  child.on('exit', (c) => {
    clearTimeout(timeout);
    try {
      const j = JSON.parse(out);
      console.log('Child result:', j);
      process.exit(j && j.ok ? 0 : 5);
    } catch (e) {
      console.error('Failed to parse child output', out);
      process.exit(6);
    }
  });
});
