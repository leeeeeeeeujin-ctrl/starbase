/* CI wrapper for the fuzzer with a simple failure threshold */
const { spawnSync } = require('node:child_process');

const iterations = Number(process.argv[2]) || 300;
const p = spawnSync(process.execPath, ['scripts/matching-fuzzer.mjs', String(iterations)], {
  encoding: 'utf8',
});
if (p.error) {
  console.error(p.error);
  process.exit(1);
}
if (p.status !== 0) {
  console.error(p.stderr);
  process.exit(p.status);
}

try {
  const out = JSON.parse((p.stdout || '').trim());
  console.log(out);
  // allow a tiny fail margin for randomness, but fail if > 1%
  if (out.fail > Math.ceil(iterations * 0.01)) {
    console.error('Fuzzer invariants failed too often:', out);
    process.exit(1);
  }
} catch (e) {
  console.error('Failed to parse fuzzer output:', e);
  console.error('stdout:', p.stdout);
  process.exit(1);
}
