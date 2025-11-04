#!/usr/bin/env node
/*
  Verify essential Next.js build outputs and print a concise diagnostic summary.
  This helps understand why Vercel reports missing routes-manifest.json.
*/
const fs = require('fs');
const path = require('path');

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function statSize(p) {
  try { return fs.statSync(p).size; } catch { return 0; }
}

function list(dir, depth = 1) {
  const out = [];
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      out.push({ name: ent.name, dir: ent.isDirectory() });
    }
  } catch {}
  return out;
}

const NEXT_DIR = path.join(__dirname, '..', '.next');
const serverDir = path.join(NEXT_DIR, 'server');
const standaloneDir = path.join(NEXT_DIR, 'standalone');
const routesManifest = path.join(NEXT_DIR, 'routes-manifest.json');
const pagesManifest = path.join(serverDir, 'pages-manifest.json');
const appPathsManifest = path.join(serverDir, 'app-paths-manifest.json');

const summary = {
  nextDirExists: exists(NEXT_DIR),
  serverDirExists: exists(serverDir),
  standaloneDirExists: exists(standaloneDir),
  files: {
    routesManifest: exists(routesManifest) ? statSize(routesManifest) : 0,
    pagesManifest: exists(pagesManifest) ? statSize(pagesManifest) : 0,
    appPathsManifest: exists(appPathsManifest) ? statSize(appPathsManifest) : 0,
  },
  nextTopLevel: list(NEXT_DIR),
  serverTopLevel: list(serverDir),
};

const missing = [];
if (!summary.nextDirExists) missing.push('.next directory');
if (!summary.files.routesManifest) missing.push('routes-manifest.json');

// Print a compact, parseable JSON first for CI, then a human summary.
console.log('[next-output-summary]', JSON.stringify(summary));

if (missing.length) {
  console.error('[next-output-error] Missing:', missing.join(', '));
  // Provide hints based on what we do have
  if (!summary.serverDirExists) {
    console.error('[hint] .next/server is missing — build may have failed before emit. Check earlier webpack errors.');
  } else if (summary.files.pagesManifest === 0 && summary.files.appPathsManifest === 0) {
    console.error('[hint] Neither pages nor app router manifests exist. Verify pages/ or app/ presence and runtime errors.');
  } else if (summary.files.appPathsManifest > 0 && summary.files.pagesManifest === 0) {
    console.error('[hint] App Router only build. Some platforms still expect routes-manifest.json — verify Next/Vercel integration settings.');
  }
  process.exit(1);
}

console.log('[next-output-ok] Found routes-manifest.json');

