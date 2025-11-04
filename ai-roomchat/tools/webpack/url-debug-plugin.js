class URLDebugPlugin {
  apply(compiler) {
    // Dump rich error info at the end of compilation
    compiler.hooks.done.tap('URLDebugPlugin', (stats) => {
      try {
        if (!stats.hasErrors()) return;
        const info = stats.toJson({
          all: false,
          errors: true,
          errorsCount: true,
          moduleTrace: true,
          errorDetails: true,
          logging: 'verbose',
        });
        const errs = info.errors || [];
        // Keep output manageable
        console.error(`[URLDebug] Build had errors: count=${errs.length}`);
        for (const err of errs.slice(0, 12)) {
          try {
            console.error('--- [URLDebug] Error Start ---');
            if (err.message) console.error('[URLDebug] message:', err.message);
            if (err.stack) console.error('[URLDebug] stack:', err.stack);
            if (err.details) console.error('[URLDebug] details:', err.details);
            if (err.moduleIdentifier) console.error('[URLDebug] moduleIdentifier:', err.moduleIdentifier);
            if (err.moduleName) console.error('[URLDebug] moduleName:', err.moduleName);
            if (err.loc) console.error('[URLDebug] loc:', err.loc);
            if (Array.isArray(err.moduleTrace) && err.moduleTrace.length) {
              console.error('[URLDebug] moduleTrace:');
              for (const t of err.moduleTrace) {
                try {
                  console.error(`  - origin=${t.originName} -> module=${t.moduleName}`);
                } catch {}
              }
            }
            console.error('--- [URLDebug] Error End ---');
          } catch {}
        }
      } catch (e) {
        try { console.error('[URLDebug] failed to print errors:', e && e.message); } catch {}
      }
    });
  }
}

module.exports = URLDebugPlugin;

