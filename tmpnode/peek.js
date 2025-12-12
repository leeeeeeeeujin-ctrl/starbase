// Simple helper to inspect parts of a file without relying on shell tools.
// Usage:
//   node tmpnode/peek.js <path> [needle]
// If needle is provided, prints a window around the first occurrence.
// Otherwise prints the first 4000 characters.
const fs = require('fs');

function main() {
  const [, , filePath, needle] = process.argv;
  if (!filePath) {
    console.error('usage: node tmpnode/peek.js <path> [needle]');
    process.exit(1);
  }
  let src;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error('read error:', e && e.message ? e.message : String(e));
    process.exit(1);
  }

  if (!needle) {
    process.stdout.write(src.slice(0, 4000));
    return;
  }

  const idx = src.indexOf(needle);
  console.log('index', idx);
  if (idx === -1) return;
  const start = Math.max(0, idx - 200);
  const end = Math.min(src.length, idx + 200);
  process.stdout.write(src.slice(start, end));
}

main();

