import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const aiRoomchatDir = path.join(repoRoot, "ai-roomchat");
const localPokerogueSourceDir = path.join(repoRoot, "pokerogue-upstream");
const localPokerogueOverlayDir = path.join(repoRoot, "pokerogue-web");
const publicTargetDir = path.join(aiRoomchatDir, "public", "pokerogue-embedded");

const DEFAULT_POKEROGUE_GIT_URL = "https://github.com/pagefaultgames/pokerogue.git";
const DEFAULT_POKEROGUE_GIT_REF = "beta";
const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";
const VALIDATION_FILES = [
  ["assets", "images", "trainer", "rival_m.png"],
  ["assets", "audio", "battle_anims", "PRSFX- Struggle.wav"],
];

function log(message) {
  console.log(`[prepare-pokerogue-upstream] ${message}`);
}

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function readPrefix(filePath, length = 128) {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
  fs.closeSync(fd);
  return buffer.subarray(0, bytesRead).toString("utf8");
}

function assertRealAsset(sourceDir) {
  for (const segments of VALIDATION_FILES) {
    const filePath = path.join(sourceDir, ...segments);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required Pokerogue asset missing: ${filePath}`);
    }

    const prefix = readPrefix(filePath);
    if (prefix.startsWith(LFS_POINTER_PREFIX)) {
      throw new Error(
        `Pokerogue asset is still a Git LFS pointer, not real binary data: ${filePath}`,
      );
    }
  }
}

function hasGitRepository(dirPath) {
  return fs.existsSync(path.join(dirPath, ".git"));
}

function resolveConfiguredLocalSource() {
  const configured = process.env.POKEROGUE_SOURCE_DIR?.trim();
  if (!configured) {
    return null;
  }
  return path.resolve(repoRoot, configured);
}

function cloneFreshSource(tempRoot) {
  const gitUrl = process.env.POKEROGUE_GIT_URL?.trim() || DEFAULT_POKEROGUE_GIT_URL;
  const gitRef = process.env.POKEROGUE_GIT_REF?.trim() || DEFAULT_POKEROGUE_GIT_REF;
  const cloneDir = path.join(tempRoot, "pokerogue-source");

  log(`cloning ${gitUrl}#${gitRef}`);
  run("git", ["clone", "--depth", "1", "--branch", gitRef, gitUrl, cloneDir], repoRoot);

  log("pulling Git LFS assets");
  run("git", ["lfs", "pull"], cloneDir);

  return cloneDir;
}

const BUILD_COPY_EXCLUDED_NAMES = new Set([
  ".git",
  ".github",
  ".devcontainer",
  ".vscode",
  "node_modules",
  "dist",
]);

const BUILD_OVERLAY_EXCLUDED_NAMES = new Set([
  ".git",
  ".github",
  ".devcontainer",
  ".vscode",
  "node_modules",
  "dist",
  "assets",
]);

function copyTree(fromDir, toDir, excludedNames = BUILD_COPY_EXCLUDED_NAMES) {
  ensureDir(toDir);
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (excludedNames.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(fromDir, entry.name);
    const targetPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath, excludedNames);
      continue;
    }

    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function createBuildWorkspace(sourceDir, tempRoot) {
  const buildDir = path.join(tempRoot, "pokerogue-build");
  log(`preparing build workspace from ${sourceDir}`);
  copyTree(sourceDir, buildDir, BUILD_COPY_EXCLUDED_NAMES);

  if (fs.existsSync(localPokerogueOverlayDir)) {
    log(`overlaying local custom files from ${localPokerogueOverlayDir}`);
    copyTree(localPokerogueOverlayDir, buildDir, BUILD_OVERLAY_EXCLUDED_NAMES);
  }

  return buildDir;
}

function resolveSourceDir() {
  const configuredLocalSource = resolveConfiguredLocalSource();
  if (configuredLocalSource && fs.existsSync(configuredLocalSource)) {
    log(`using configured local source ${configuredLocalSource}`);
    if (hasGitRepository(configuredLocalSource)) {
      log("refreshing Git LFS assets in configured local source");
      run("git", ["lfs", "pull"], configuredLocalSource);
    }
    return { sourceDir: configuredLocalSource, cleanup: null };
  }

  if (fs.existsSync(localPokerogueSourceDir) && hasGitRepository(localPokerogueSourceDir)) {
    log(`using local Pokerogue source ${localPokerogueSourceDir}`);
    log("refreshing Git LFS assets in local source");
    run("git", ["lfs", "pull"], localPokerogueSourceDir);
    return { sourceDir: localPokerogueSourceDir, cleanup: null };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokerogue-build-"));
  const sourceDir = cloneFreshSource(tempRoot);
  return {
    sourceDir,
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function main() {
  if (process.env.SKIP_POKEROGUE_UPSTREAM_BUILD === "1") {
    log("skipped by SKIP_POKEROGUE_UPSTREAM_BUILD=1");
    return;
  }

  const { sourceDir, cleanup } = resolveSourceDir();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokerogue-build-work-"));

  try {
    assertRealAsset(sourceDir);
    const buildDir = createBuildWorkspace(sourceDir, tempRoot);

    log("installing Pokerogue dependencies");
    run("corepack", ["pnpm", "install", "--ignore-scripts"], buildDir);

    log("building Pokerogue");
    run("corepack", ["pnpm", "build"], buildDir, {
      VITE_BASE_PATH: "/pokerogue-embedded/",
      VITE_ENABLE_SERVICE_WORKER: "0",
    });

    const distDir = path.join(buildDir, "dist");
    if (!fs.existsSync(distDir)) {
      throw new Error(`Expected dist directory was not created: ${distDir}`);
    }

    log("copying dist into ai-roomchat/public/pokerogue-embedded");
    ensureDir(path.dirname(publicTargetDir));
    cleanDir(publicTargetDir);
    fs.cpSync(distDir, publicTargetDir, { recursive: true });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    cleanup?.();
  }
}

main();
