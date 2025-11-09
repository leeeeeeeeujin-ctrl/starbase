#!/usr/bin/env node
// Simple fuzz runner stub for CI. Sends sample payloads to local dev server or
// exercises template parsing functions. Intended as a fast smoke harness.

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const mode = (process.argv.find(a => a.startsWith('--mode=')) || '--mode=fast').split('=')[1];
const OUT_DIR = path.join(__dirname, '..', 'reports', 'fuzz');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const samples = [
  '',
  'normal input',
  'A'.repeat(1024),
  '{"malformed": ',
  '<script>alert(1)</script>'
];

function runSample(i, s) {
  const start = Date.now();
  try {
    // Example: call a local node script that validates/parses templates
    // If you have an endpoint, replace with HTTP call.
    // Here we just spawn `node -e` for deterministic, fast execution.
    const code = `console.log(JSON.stringify({len:${s.length}}))`;
    const out = child_process.execFileSync('node', ['-e', code], { timeout: 5000 }).toString();
    fs.writeFileSync(path.join(OUT_DIR, `sample_${i}.out.json`), out);
    return { i, ok: true, duration: Date.now() - start };
  } catch (err) {
    fs.writeFileSync(path.join(OUT_DIR, `sample_${i}.err.txt`), String(err.stack || err));
    return { i, ok: false, err: String(err.message).slice(0, 200) };
  }
}

async function main() {
  const results = [];
  const limit = mode === 'fast' ? 5 : 200;
  for (let i = 0; i < Math.min(limit, samples.length); i++) {
    const res = runSample(i, samples[i]);
    results.push(res);
  }
  const summary = { mode, total: results.length, failures: results.filter(r => !r.ok).length };
  fs.writeFileSync(path.join(OUT_DIR, `summary.json`), JSON.stringify({ summary, results }, null, 2));
  if (summary.failures > 0) process.exit(2);
}

main().catch(err => { console.error(err); process.exit(3); });
