// Install a compile-time scanner for bare `URL(` usage across all required .js files.
try {
  const Module = require('module');
  const fs = require('fs');
  const path = require('path');
  const origLoader = Module._extensions['.js'];
  const re = /(^|[^A-Za-z_.$])URL\s*\(/;
  const skip = /(createObjectURL\s*\(|revokeObjectURL\s*\(|toDataURL\s*\()/;

  Module._extensions['.js'] = function (module, filename) {
    try {
      // Skip huge compiled blobs to keep perf acceptable
      if (filename.includes(path.sep + 'react') || filename.includes(path.sep + 'react-dom')) {
        return origLoader(module, filename);
      }
      const src = fs.readFileSync(filename, 'utf8');
      if (src.includes('URL(') && !skip.test(src)) {
        const lines = src.split(/\r?\n/);
        for (let i = 0; i < Math.min(lines.length, 5000); i++) {
          const line = lines[i];
          if (!line.includes('URL(')) continue;
          const m = re.exec(line);
          if (m) {
            const before = line.slice(0, m.index + (m[1] ? m[1].length : 0));
            if (!/new\s*$/i.test(before)) {
              // Emit once per file
              console.warn(`[ScanBareURL:compile] ${filename}:${i + 1}: ${line.trim()}`);
              break;
            }
          }
        }
      }
    } catch {}
    return origLoader(module, filename);
  };
} catch {}

