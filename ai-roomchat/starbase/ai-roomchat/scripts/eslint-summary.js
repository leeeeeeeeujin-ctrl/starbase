const fs = require('fs');
const path = require('path');

const REPORT = process.env.REPORT_FILE
  ? path.resolve(process.cwd(), process.env.REPORT_FILE)
  : path.resolve(__dirname, '..', 'reports', 'eslint-report.json');
const OUT = process.env.SUMMARY_OUT
  ? path.resolve(process.cwd(), process.env.SUMMARY_OUT)
  : path.resolve(__dirname, '..', 'reports', 'eslint-summary.json');

function safeRead(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Cannot read', file);
    process.exit(1);
  }
}

const raw = safeRead(REPORT).trim();
if (!raw) {
  console.error('Empty eslint report');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  // Attempt to recover: extract the first JSON array-like substring
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    console.error('Invalid JSON in eslint report:', e.message);
    process.exit(1);
  }
  const slice = raw.slice(start, end + 1);
  try {
    data = JSON.parse(slice);
  } catch (e2) {
    console.error('Failed to recover JSON from eslint report:', e2.message);
    process.exit(1);
  }
}

const ruleCounts = Object.create(null);
const fileCounts = Object.create(null);
const fileMessages = Object.create(null);

for (const file of data) {
  const filePath = file.filePath || file.file || '<unknown>';
  const warnings = file.warningCount || 0;
  const errors = file.errorCount || 0;
  fileCounts[filePath] = (fileCounts[filePath] || 0) + warnings + errors;
  fileMessages[filePath] = file.messages || [];
  for (const msg of file.messages || []) {
    const id = msg.ruleId || '<no-rule>';
    ruleCounts[id] = (ruleCounts[id] || 0) + 1;
  }
}

function topN(obj, n = 20) {
  return Object.keys(obj)
    .map(k => ({ key: k, count: obj[k] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

const summary = {
  totalFiles: Object.keys(fileCounts).length,
  topRules: topN(ruleCounts, 50),
  topFiles: topN(fileCounts, 50),
};

fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2),
  'utf8'
);

console.log('Wrote summary to', OUT);
console.log('Top rules:');
console.log(
  summary.topRules
    .slice(0, 20)
    .map(r => `${r.key}: ${r.count}`)
    .join('\n')
);
console.log('\nTop files:');
console.log(
  summary.topFiles
    .slice(0, 20)
    .map(f => `${f.key}: ${f.count}`)
    .join('\n')
);
