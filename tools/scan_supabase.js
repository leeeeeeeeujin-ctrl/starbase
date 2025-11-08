const fs = require('fs');
const path = require('path');
const root = process.argv[2] || '.';
const needles = [
  'supabase.storage.from(',
  'getPublicUrl(',
  'createSignedUrl(',
  'uploadToSignedUrl(',
  'storage.listBuckets(',
  'storage.download('
];

function walk(dir, out=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx)$/i.test(ent.name)) out.push(p);
  }
  return out;
}

const files = walk(root);
for (const f of files) {
  let s='';
  try { s = fs.readFileSync(f, 'utf8'); } catch {}
  const hits = needles.filter(n => s.includes(n));
  if (hits.length) console.log(f + ' :: ' + hits.join('|'));
}

