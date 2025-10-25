#!/usr/bin/env node
/**
 * Run runSelftest.js multiple times, collect each run's JSON log into
 * logs/batch-<timestamp>/ and produce a small summary report.
 * Usage: node scripts/runSelftestBatch.js [count]
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const logsDir = path.join(root, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const count = Math.max(1, Number(process.argv[2]) || 20); // default 20 runs for an initial batch
const batchTs = new Date().toISOString().replace(/[:.]/g, '-');
const batchDir = path.join(logsDir, `batch-${batchTs}`);
fs.mkdirSync(batchDir, { recursive: true });

console.log(`Running ${count} selftests; logs will be collected to ${batchDir}`);

function listSelftestFiles() {
  return fs.readdirSync(logsDir).filter(f => f.startsWith('selftest-') && f.endsWith('.json'));
}

const initialFiles = new Set(listSelftestFiles());
const results = [];

for (let i = 0; i < count; i += 1) {
  console.log(`\n=== Run ${i + 1}/${count} ===`);
  // execute with DEBUG_MATCHING=1 to collect verbose logs
  const nodeBin = process.execPath;
  const scriptPath = path.join(root, 'scripts', 'runSelftest.js');
  const env = Object.assign({}, process.env, { DEBUG_MATCHING: '1' });

  const res = spawnSync(nodeBin, [scriptPath], { cwd: root, env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  // find new selftest file(s)
  const after = listSelftestFiles();
  const newFiles = after.filter(f => !initialFiles.has(f));
  if (newFiles.length === 0) {
    console.warn('No new selftest log found for run', i + 1);
    results.push({ index: i + 1, ok: false, note: 'no-log' });
    continue;
  }

  // move all new files for this run into batchDir with index prefix
  for (const f of newFiles) {
    const src = path.join(logsDir, f);
    const dst = path.join(batchDir, `${String(i + 1).padStart(3, '0')}-${f}`);
    try {
      fs.renameSync(src, dst);
      console.log('Saved log:', dst);
    } catch (e) {
      console.error('Failed to move log file', src, e.message);
    }
  }

  // mark these as consumed so we don't pick them up again
  for (const f of newFiles) initialFiles.add(f);
  results.push({ index: i + 1, ok: true, files: newFiles });
}

// produce summary
const okCount = results.filter(r => r.ok).length;
const badCount = results.length - okCount;
const summary = {
  timestamp: new Date().toISOString(),
  runsRequested: count,
  runsCompleted: results.length,
  ok: okCount,
  failed: badCount,
  details: results,
};

const summaryPath = path.join(batchDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log('\nBatch complete. Summary:', summaryPath);
console.log(JSON.stringify({ ok: okCount, failed: badCount }));

process.exit(0);
 
