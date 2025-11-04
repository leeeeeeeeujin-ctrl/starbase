const fs = require('fs');
const path = require('path');

const root = process.argv[2] || '.';
const needles = (process.argv[3] || 'type="file",new FormData,uploadAsset,utils/uploader,/api/assets/upload-url').split(',');

function walk(dir, out=[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.next')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx|html|md)$/i.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(root);
for (const f of files) {
  let s='';
  try { s = fs.readFileSync(f,'utf8'); } catch { continue; }
  const hits = needles.filter(n => s.includes(n));
  if (hits.length) {
    console.log(f + ' :: ' + hits.join('|'));
  }
}

