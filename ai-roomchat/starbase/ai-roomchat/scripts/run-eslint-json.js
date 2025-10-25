const fs = require('fs');
const path = require('path');

async function main() {
  const { ESLint } = require('eslint');
  const OUT_DIR = path.resolve(__dirname, '..', 'reports');
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const OUT = path.join(OUT_DIR, 'eslint-report.json');

  console.log('Running ESLint via Node API...');
  const eslint = new ESLint();

  try {
    // Let ESLint resolve files from the current directory
    const results = await eslint.lintFiles(['.']);
    // Format as JSON array similar to --format json
    const json = JSON.stringify(results, null, 2);
    fs.writeFileSync(OUT, json, 'utf8');
    console.log('Wrote ESLint JSON to', OUT);
    process.exit(0);
  } catch (err) {
    console.error('Failed to run ESLint API:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
