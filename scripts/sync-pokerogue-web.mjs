import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "pokerogue-upstream");
const targetDir = path.join(rootDir, "pokerogue-web");

const EXCLUDED_NAMES = new Set([
  ".git",
  ".devcontainer",
  ".github",
  ".vscode",
  "docs",
  "node_modules",
  "test",
  "typedoc-plugins",
  "dist",
]);

const EXCLUDED_FILES = new Set([
  ".dependency-cruiser.cjs",
  ".env",
  ".env.app",
  ".env.beta",
  ".env.development",
  ".env.production",
  ".env.test",
  ".gitmodules",
  ".ls-lint.yml",
  "CONTRIBUTING.md",
  "CREDITS.md",
  "Dockerfile",
  "lefthook.yml",
  "REUSE.toml",
  "typedoc.config.js",
  "tsdoc.json",
  "vitest.config.ts",
]);

function removeDirContents(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyTree(fromDir, toDir) {
  ensureDir(toDir);
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (EXCLUDED_NAMES.has(entry.name)) continue;
    if (EXCLUDED_FILES.has(entry.name)) continue;

    const sourcePath = path.join(fromDir, entry.name);
    const targetPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function writeProjectNotes() {
  const notePath = path.join(targetDir, "README.codex.md");
  const note = [
    "# Pokerogue web deployment copy",
    "",
    "This folder is a deployable copy of `pokerogue-upstream` for static hosting.",
    "",
    "Guidelines:",
    "- Set the Vercel project root directory to `pokerogue-web`.",
    "- Build command: `pnpm build`",
    "- Output directory: `dist`",
    "- Do not edit generated files here by hand if the same change should also live in `pokerogue-upstream`.",
    "- Re-run `node scripts/sync-pokerogue-web.mjs` after upstream changes that should be redeployed.",
    "",
  ].join("\n");
  fs.writeFileSync(notePath, note, "utf8");
}

if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory missing: ${sourceDir}`);
  process.exit(1);
}

ensureDir(targetDir);
removeDirContents(targetDir);
copyTree(sourceDir, targetDir);
writeProjectNotes();

console.log(`Synced ${sourceDir} -> ${targetDir}`);
