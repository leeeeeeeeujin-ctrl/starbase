const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', 'logs', fs.readdirSync(path.join(__dirname, '..', 'logs')).filter(n=>n.startsWith('batch-')).sort().pop());
if (!dir) { console.error('No batch dir'); process.exit(2); }
const batchPath = path.isAbsolute(dir) ? dir : path.join(__dirname, '..', 'logs', dir);
if (!fs.existsSync(batchPath)) { console.error('Not found', batchPath); process.exit(2); }
const files = fs.readdirSync(batchPath).filter(f => f.startsWith('run-') && f.endsWith('.log')).sort();
let succ = 0, total = 0; const fails = [];
for (const f of files) {
  total++;
  const c = fs.readFileSync(path.join(batchPath, f), 'utf8');
  if (c.indexOf('"ready": true') !== -1) succ++; else fails.push(f);
}
console.log('batchPath=', batchPath);
console.log('runs=', total, 'success=', succ, 'fail=', total - succ);
console.log('fail samples=', fails.slice(0, 12));
// Save a small summary file
fs.writeFileSync(path.join(batchPath, 'summary-run.json'), JSON.stringify({ runs: total, success: succ, fail: total - succ, failSamples: fails.slice(0, 12) }, null, 2), 'utf8');
console.log('wrote summary-run.json');
