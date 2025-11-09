const fs = require('fs');
const path = require('path');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', 'playwright-report'].includes(ent.name))
        continue;
      walk(full);
    } else if (/\.(js|jsx|ts|tsx)$/.test(ent.name)) {
      let src = fs.readFileSync(full, 'utf8');
      const before = src;
      // replace catch (e) {} / catch (err) {} / catch (error) {} only when body is empty
      src = src.replace(/catch\s*\(\s*(?:e|err|error)\s*\)\s*\{\s*\}/g, m => {
        return m.replace(/catch\s*\(\s*(e|err|error)\s*\)/, (mm, p1) => `catch (_${p1})`);
      });
      if (src !== before) {
        fs.writeFileSync(full, src, 'utf8');
        console.log('Patched:', full);
      }
    }
  }
}

walk(process.cwd());
console.log('done');
