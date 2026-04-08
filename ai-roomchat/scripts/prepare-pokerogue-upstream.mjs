import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const pokerogueWebDir = path.join(repoRoot, "pokerogue-web");
const publicTargetDir = path.join(repoRoot, "ai-roomchat", "public", "pokerogue-upstream");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      VITE_BASE_PATH: "/pokerogue-upstream/",
      VITE_ENABLE_SERVICE_WORKER: "0",
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

function main() {
  if (process.env.SKIP_POKEROGUE_UPSTREAM_BUILD === "1") {
    console.log("[prepare-pokerogue-upstream] skipped by SKIP_POKEROGUE_UPSTREAM_BUILD=1");
    return;
  }

  if (!fs.existsSync(pokerogueWebDir)) {
    throw new Error(`Missing pokerogue-web directory: ${pokerogueWebDir}`);
  }

  console.log("[prepare-pokerogue-upstream] installing pokerogue-web dependencies");
  run("corepack", ["pnpm", "install", "--ignore-scripts"], pokerogueWebDir);

  console.log("[prepare-pokerogue-upstream] building pokerogue-web");
  run("corepack", ["pnpm", "build"], pokerogueWebDir);

  const distDir = path.join(pokerogueWebDir, "dist");
  if (!fs.existsSync(distDir)) {
    throw new Error(`Expected dist directory was not created: ${distDir}`);
  }

  console.log("[prepare-pokerogue-upstream] copying dist into ai-roomchat/public/pokerogue-upstream");
  ensureDir(path.dirname(publicTargetDir));
  cleanDir(publicTargetDir);
  fs.cpSync(distDir, publicTargetDir, { recursive: true });
}

main();
