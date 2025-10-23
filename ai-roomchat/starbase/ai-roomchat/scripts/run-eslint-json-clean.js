const fs = require('fs');
const path = require('path');

async function main() {
  const { ESLint } = require('eslint');
  const OUT_DIR = path.resolve(__dirname, '..', 'reports');
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const OUT = path.join(OUT_DIR, 'eslint-report-clean.json');

  console.log('Running ESLint (clean) via Node API...');
  const eslint = new ESLint({ ignore: true });

  try {
    // Lint a conservative set of source directories to avoid .next / node_modules noise
    const targets = [
      'components/**',
      'pages/**',
      'lib/**',
      'modules/**',
      'hooks/**',
      'services/**',
      'supabase/**',
      'utils/**',
      '__tests__/**',
      'tests/**',
    ];
    const results = await eslint.lintFiles(targets);
    const json = JSON.stringify(results, null, 2);
    fs.writeFileSync(OUT, json, 'utf8');
    console.log('Wrote clean ESLint JSON to', OUT);
    process.exit(0);
  } catch (err) {
    console.error('Failed to run ESLint API:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
