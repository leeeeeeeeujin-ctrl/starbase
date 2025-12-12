// Simple helper to inspect parts of a file without relying on shell tools.
// Usage:
//   node ai-roomchat/tmpnode/peek.js <path>
//     → prints the first 4000 characters
//   node ai-roomchat/tmpnode/peek.js <path> <needle> [contextLen]
//     → prints a window around the first occurrence of `needle`
//   node ai-roomchat/tmpnode/peek.js <path> @<offset> [length]
//     → prints `length` characters starting at absolute `offset`
const fs = require('fs');

function main() {
  const [, , filePath, arg3, arg4] = process.argv;
  if (!filePath) {
    console.error('usage: node ai-roomchat/tmpnode/peek.js <path> [needle|@offset] [len]');
    process.exit(1);
  }
  let src;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error('read error:', e && e.message ? e.message : String(e));
    process.exit(1);
  }

  if (!arg3) {
    process.stdout.write(src.slice(0, 4000));
    return;
  }

  if (arg3.startsWith('@')) {
    const offset = Number(arg3.slice(1)) || 0;
    const len = Number(arg4) || 4000;
    const start = Math.max(0, offset);
    const end = Math.min(src.length, start + len);
    process.stdout.write(src.slice(start, end));
    return;
  }

  const needle = arg3;
  const ctxLen = Number(arg4) || 200;
  const idx = src.indexOf(needle);
  console.log('index', idx);
  if (idx === -1) return;
  const start = Math.max(0, idx - ctxLen);
  const end = Math.min(src.length, idx + ctxLen);
  process.stdout.write(src.slice(start, end));
}

main();
