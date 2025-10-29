const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const mainRoot = path.join(repoRoot);
const nestedRoot = path.resolve(repoRoot, '..', 'starbase', 'ai-roomchat');

if (!fs.existsSync(nestedRoot)) {
  console.log('No nested folder found at', nestedRoot);
  process.exit(0);
}

const moved = [];
const conflicts = [];

function walk(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

walk(nestedRoot, file => {
  const rel = path.relative(nestedRoot, file);
  const dest = path.join(mainRoot, rel);
  if (!fs.existsSync(dest)) {
    const destDir = path.dirname(dest);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(file, dest);
    moved.push(rel);
  } else {
    // If sizes are identical, skip; else record conflict
    const s1 = fs.statSync(file).size;
    const s2 = fs.statSync(dest).size;
    if (s1 !== s2) conflicts.push(rel);
  }
});

console.log('Moved files from nested to main:', moved.length);
for (const f of moved) console.log('  +', f);
if (conflicts.length) {
  console.log('\nConflicts (file exists in main with different size):');
  for (const f of conflicts) console.log('  !', f);
}

// If there are no conflicts, remove the nested folder
if (conflicts.length === 0) {
  try {
    fs.rmSync(nestedRoot, { recursive: true, force: true });
    console.log('Nested folder removed:', nestedRoot);
  } catch (e) {
    console.error('Failed to remove nested folder:', e.message);
  }
} else {
  console.log('Not removing nested folder because of conflicts. Please review.');
}
