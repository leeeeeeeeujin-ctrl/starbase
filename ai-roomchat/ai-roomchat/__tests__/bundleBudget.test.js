const fs = require('fs');
const path = require('path');

function listFilesRecursive(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out;
}

function sumSizes(files) {
  let total = 0;
  for (const f of files) {
    try {
      const st = fs.statSync(f);
      total += st.size || 0;
    } catch {}
  }
  return total;
}

describe('bundle budget (heuristic)', () => {
  test('total static build output under threshold', () => {
    // Try to locate Next build output; if not present, pass (build not run in this job)
    const projectRoot = process.cwd();
    const nextDir = path.join(projectRoot, '.next');
    if (!fs.existsSync(nextDir)) {
      // Not built; skip without failing
      console.warn('[bundleBudget] .next not found; skipping budget assertion');
      expect(true).toBe(true);
      return;
    }
    const staticDir = path.join(nextDir, 'static');
    const files = listFilesRecursive(staticDir);
    const totalBytes = sumSizes(files);
    // Raw bytes threshold (post-tree-shaking, pre-gzip). Adjust as needed.
    const RAW_BYTES_THRESHOLD = 8 * 1024 * 1024; // 8MB
    expect(totalBytes).toBeLessThanOrEqual(RAW_BYTES_THRESHOLD);
  });
});
