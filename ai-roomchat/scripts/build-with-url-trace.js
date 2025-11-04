const { spawnSync } = require('child_process');
const path = require('path');

// Preload our URL trace hook for the child process that runs 'next build'
const preload = path.resolve(__dirname, 'url-trace-preload.js');
const existing = process.env.NODE_OPTIONS || '';
const inject = `-r ${preload}`;
process.env.NODE_OPTIONS = existing ? `${existing} ${inject}` : inject;

const result = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(result.status || 1);
