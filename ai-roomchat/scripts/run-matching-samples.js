#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function runNodeScript(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function findLatestReport(prefix) {
  const reportsDir = path.resolve(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) return null;
  const files = fs
    .readdirSync(reportsDir)
    .filter(name => {
      if (!name.endsWith('.json')) return false;
      if (prefix === 'matching-simulations-') {
        return /^matching-simulations-\d+\.json$/.test(name);
      }
      if (prefix === 'matching-simulations-breakdown-') {
        return /^matching-simulations-breakdown-\d+\.json$/.test(name);
      }
      return name.startsWith(prefix);
    })
    .sort();
  if (!files.length) return null;
  return path.join(reportsDir, files[files.length - 1]);
}

console.log('[matching-samples] running aggregate simulations...');
runNodeScript('run-matching-simulations.js');

console.log('[matching-samples] running failure breakdown...');
runNodeScript('run-matching-simulations-breakdown.js');

console.log('[matching-samples] running suspicious-success scan...');
runNodeScript('run-matching-anomaly-scan.js');

const latestAggregate = findLatestReport('matching-simulations-');
const latestBreakdown = findLatestReport('matching-simulations-breakdown-');
const latestAnomalies = findLatestReport('matching-anomaly-scan-');

if (latestAggregate) {
  console.log('[matching-samples] latest aggregate report:', latestAggregate);
}
if (latestBreakdown) {
  console.log('[matching-samples] latest breakdown report:', latestBreakdown);
}
if (latestAnomalies) {
  console.log('[matching-samples] latest anomaly report:', latestAnomalies);
}
