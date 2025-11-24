// Temporary helper for the AI to inspect large files in this sandboxed
// environment where typical CLI tools like sed/findstr are unavailable.
//
// Usage (from repo root or ai-roomchat/):
//   node tools/print_snippet.js path/to/file.js token 200
//
// This will print up to 2 * radius characters around the first occurrence
// of `token` in the given file, which is useful for locating context when
// editing with apply_patch.

const fs = require('fs');
const path = require('path');

function main() {
  const [, , fileArg, token, radiusArg] = process.argv;
  if (!fileArg || !token) {
    console.error('Usage: node tools/print_snippet.js <file> <token|__TAIL__> [radius]');
    process.exit(1);
  }
  const radius = Number(radiusArg) > 0 ? Number(radiusArg) : 400;
  const filePath = path.resolve(process.cwd(), fileArg);
  const text = fs.readFileSync(filePath, 'utf8');

  if (token === '__TAIL__') {
    const start = Math.max(0, text.length - radius);
    console.log('tail-from', start, 'len', text.length - start);
    console.log(text.slice(start));
    return;
  }

  const idx = text.indexOf(token);
  console.log('index', idx);
  if (idx === -1) return;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + token.length + radius);
  console.log(text.slice(start, end));
}

main();
