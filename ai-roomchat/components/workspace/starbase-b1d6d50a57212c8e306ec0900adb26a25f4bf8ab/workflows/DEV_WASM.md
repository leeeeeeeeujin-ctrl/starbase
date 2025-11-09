# Local WASM build (Developer guide)

This explains how to build `.wat` -> `.wasm` locally for the `ai-roomchat` project.

Options:

1) Use the npm `wabt` package (recommended for local dev)

- From project root:

```powershell
cd ai-roomchat
npm ci
npm run wasm:build
```

This will use the `wabt` npm package (if installed via `npm ci`) to compile `ai-roomchat/wasm/add.wat` -> `ai-roomchat/wasm/add.wasm`.

2) Use system `wat2wasm` (if you prefer installing wabt system-wide)

- On Ubuntu:

```bash
sudo apt-get update && sudo apt-get install -y wabt
cd ai-roomchat
npm run wasm:build
```

Notes:
- `ai-roomchat/scripts/wasm_build.js` prefers the `wabt` npm module and only falls back to the system `wat2wasm` CLI if the module isn't available.
- If neither is present the script exits gracefully with an explanatory message.

CI:
- There's a PoC GitHub Actions workflow `.github/workflows/wasm-build.yml` which installs `wabt` on the runner and runs `npm run wasm:build`.

Security:
- Only use third-party `.wat` sources from trusted authors. Compiled wasm should be reviewed for size and expected exports.
