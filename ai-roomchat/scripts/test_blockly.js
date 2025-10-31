const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const cwd = path.resolve(__dirname, '..');
const infile = path.join(cwd, 'workflows', 'blockly-sample.json');
const outfile = path.join(cwd, 'workflows', 'blockly-sample.out.js');

console.log('Running blockly converter...');
exec(`node ${JSON.stringify(path.join(cwd,'scripts','blockly_poc.js'))} ${JSON.stringify(infile)} ${JSON.stringify(outfile)}`, { cwd }, (err, stdout, stderr) => {
  if (err) {
    console.error('Conversion failed:', stderr || err.message);
    process.exit(2);
  }
  console.log(stdout);
  if (fs.existsSync(outfile)) {
    console.log('Output exists:', outfile);
    const out = fs.readFileSync(outfile,'utf8');
    console.log('--- output preview ---\n', out);
    process.exit(0);
  } else {
    console.error('Output not found');
    process.exit(3);
  }
});
