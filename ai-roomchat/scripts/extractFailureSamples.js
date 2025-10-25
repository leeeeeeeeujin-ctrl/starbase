const fs = require('fs');
const path = require('path');
const batchDir = process.argv[2] || path.join(__dirname, '..', 'logs', fs.readdirSync(path.join(__dirname, '..', 'logs')).filter(n=>n.startsWith('batch-')).sort().pop());
if (!batchDir) { console.error('No batch dir'); process.exit(2); }
const dir = path.isAbsolute(batchDir) ? batchDir : path.join(__dirname, '..', 'logs', batchDir);
const files = fs.readdirSync(dir).filter(f => f.startsWith('run-') && f.endsWith('.log'));
const samples = [];
for (const f of files) {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  if (content.indexOf('"ready": true') !== -1) continue;
  // find occurrences of '[matching-debug] ' and parse the following JSON block
  let idx = 0;
  while (true) {
    const tag = '[matching-debug] ';
    const pos = content.indexOf(tag, idx);
    if (pos === -1) break;
    const start = pos + tag.length;
    // find next line that begins with '[' (next log block) or end of content
    let endPos = content.indexOf('\n[', start);
    if (endPos === -1) endPos = content.length;
    const jsonText = content.slice(start, endPos).trim();
    try {
      const obj = JSON.parse(jsonText);
      samples.push({ run: f, debug: obj });
    } catch (e) {
      // ignore parse errors
    }
    idx = endPos;
  }
  if (samples.length >= 10) break;
}
const out = path.join(dir, 'failure-samples.json');
fs.writeFileSync(out, JSON.stringify(samples.slice(0, 10), null, 2), 'utf8');
console.log('Wrote', out, 'count=', samples.length);
