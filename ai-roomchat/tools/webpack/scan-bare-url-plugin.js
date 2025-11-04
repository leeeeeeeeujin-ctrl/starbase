class ScanBareURLCallsPlugin {
  constructor(options = {}) {
    this.maxLogs = options.maxLogs || 80;
    this.onlyProject = options.onlyProject ?? false;
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('ScanBareURLCallsPlugin', (compilation) => {
      // Earlier hook: as each module is built
      compilation.hooks.buildModule.tap('ScanBareURLCallsPlugin', (mod) => {
        try {
          const resource = mod.resource || mod.identifier?.();
          if (!resource) return;
          if (this.onlyProject && resource.includes('node_modules/next/')) return;
          const srcObj = typeof mod.originalSource === 'function' ? mod.originalSource() : mod._source;
          if (!srcObj || typeof srcObj.source !== 'function') return;
          const src = String(srcObj.source());
          if (!src.includes('URL(')) return;
          if (/createObjectURL\s*\(|revokeObjectURL\s*\(|toDataURL\s*\(/.test(src)) return;
          const lines = src.split(/\r?\n/);
          for (let i = 0; i < lines.length && i < 2000; i++) {
            const line = lines[i];
            if (!line.includes('URL(')) continue;
            const m = /(^|[^A-Za-z_.$])URL\s*\(/.exec(line);
            if (m) {
              const before = line.slice(0, m.index + (m[1] ? m[1].length : 0));
              if (/new\s*$/i.test(before)) continue;
              compilation.warnings.push(new Error(`[ScanBareURL:early] ${resource}:${i + 1}: ${line.trim()}`));
              break;
            }
          }
        } catch {}
      });
      compilation.hooks.finishModules.tap('ScanBareURLCallsPlugin', (modules) => {
        let printed = 0;
        const base = compiler.context || process.cwd();
        const re = /(^|[^A-Za-z_.$])URL\s*\(/g;
        for (const mod of modules) {
          try {
            const resource = mod.resource || mod.identifier?.();
            if (!resource) continue;
            if (this.onlyProject) {
              // Heuristic: skip Next's internal compiled blobs
              if (resource.includes('node_modules/next/')) continue;
            }
            const srcObj = typeof mod.originalSource === 'function' ? mod.originalSource() : mod._source;
            if (!srcObj || typeof srcObj.source !== 'function') continue;
            const src = String(srcObj.source());
            // quick excludes
            if (!src.includes('URL(')) continue;
            if (/createObjectURL\s*\(|revokeObjectURL\s*\(|toDataURL\s*\(/.test(src)) continue;
            // find lines with bare URL(
            const lines = src.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (!line.includes('URL(')) continue;
              const m = re.exec(line);
              re.lastIndex = 0;
              if (m) {
                // ensure not 'new URL('
                const before = line.slice(0, m.index + (m[1] ? m[1].length : 0));
                if (/new\s*$/i.test(before)) continue;
                if (printed < this.maxLogs) {
                  printed++;
                  compilation.warnings.push(new Error(`[ScanBareURL] ${resource}:${i + 1}: ${line.trim()}`));
                }
              }
            }
          } catch {}
        }
      });
    });
  }
}

module.exports = ScanBareURLCallsPlugin;
