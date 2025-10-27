const fs = require('fs');
const path = require('path');
// Allow passing a report path as first arg; otherwise pick the latest large-sim-*.json in reports/
let reportPath = process.argv[2];
if (!reportPath) {
  const rptDir = path.resolve(__dirname, '..', 'reports');
  const files = fs.existsSync(rptDir) ? fs.readdirSync(rptDir).filter(f => f.startsWith('large-sim-') && f.endsWith('.json')) : [];
  if (files.length === 0) {
    console.error('No large-sim reports found in', rptDir);
    process.exit(2);
  }
  files.sort();
  reportPath = path.join(rptDir, files[files.length-1]);
}
reportPath = path.resolve(reportPath);
if (!fs.existsSync(reportPath)) {
  console.error('Report not found:', reportPath);
  process.exit(2);
}
const doc = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const sessions = doc.results || doc.sessions || doc.sessions || [];
let total = sessions.length;
let success = 0;
let failed = 0;
const injectedStats = {};
const naturalStats = {};
const naturalSamples = [];
for (const s of sessions) {
  const injected = Array.isArray(s.injected) && s.injected.length > 0;
  const errSteps = (s.steps || []).filter(st => st.status === 'error');
  if (errSteps.length === 0) {
    success++;
    continue;
  }
  failed++;
  const errMsgs = errSteps.map(st => st.error || 'unknown').filter(Boolean);
  for (const e of errMsgs) {
    const key = String(e);
    const bucket = injected ? injectedStats : naturalStats;
    bucket[key] = (bucket[key] || 0) + 1;
  }
  if (!injected && naturalSamples.length < 10) {
    naturalSamples.push({
      gameIndex: s.gameIndex,
      sessionIndex: s.sessionIndex,
      gameId: s.gameId,
      sessionId: s.sessionId,
      injected: s.injected || [],
      errors: errMsgs,
      steps: s.steps
    });
  }
}
function topN(map, n=10){
  return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,n);
}
console.log('Report:', reportPath);
console.log('Summary: total=%d success=%d failed=%d', total, success, failed);
console.log('\nTop injected error types (count):');
for (const [k,v] of topN(injectedStats, 20)) console.log('  %d  %s', v, k);
console.log('\nTop natural error types (count):');
for (const [k,v] of topN(naturalStats, 20)) console.log('  %d  %s', v, k);
console.log('\nNatural failure samples (up to 10):');
for (const s of naturalSamples) {
  console.log('\n---');
  console.log('gameIndex=%d sessionIndex=%d', s.gameIndex, s.sessionIndex);
  console.log('gameId=%s', s.gameId);
  console.log('sessionId=%s', s.sessionId);
  console.log('errors: %s', s.errors.join(' | '));
  const errSteps = s.steps.filter(st=>st.status==='error');
  for (const st of errSteps) {
    console.log(' step: %s  error: %s', st.step, st.error || 'unknown');
  }
}

process.exit(0);
