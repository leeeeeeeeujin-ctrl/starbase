// Node-based pre-commit logic for lint-staged
// This file is invoked by the Windows batch wrapper `.husky/pre-commit`.
"use strict";
const { spawnSync } = require('child_process');
const path = require('path');

function tryRun(cwd) {
  const cmd = 'npx';
  const args = ['--no', '--', 'lint-staged'];
  const opts = { stdio: 'inherit', shell: true, cwd };
  try {
    const res = spawnSync(cmd, args, opts);
    return res;
  } catch (err) {
    return { error: err, status: 1 };
  }
}

// Try current workspace first, then fallback to known package locations
const candidates = [process.cwd(), path.join(process.cwd(), 'ai-roomchat'), path.join(process.cwd(), 'ai-roomchat', 'starbase', 'ai-roomchat')];
for (const c of candidates) {
  try {
    // eslint-disable-next-line no-console
    console.log('Attempting lint-staged in:', c);
    const res = tryRun(c);
    if (res && res.status === 0) {
      process.exit(0);
    }
    // If npx reports missing package, continue to next candidate
    if (res && res.status !== 0) {
      // print a small note and continue searching
      // eslint-disable-next-line no-console
      console.warn('lint-staged not found or failed in', c, '(status:', res.status, '). Trying next location.');
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Error while attempting lint-staged in', c, e && e.message);
  }
}

// If we reach here, none succeeded — warn and fail to prevent silent skips
console.error('lint-staged could not be run from any candidate locations. Install lint-staged in the repository or run commits with --no-verify if intended.');
process.exit(1);
