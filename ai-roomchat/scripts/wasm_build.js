const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const watPath = path.resolve(__dirname, '../wasm/add.wat');
const wasmPath = path.resolve(__dirname, '../wasm/add.wasm');

if (!fs.existsSync(watPath)) {
  console.log('No .wat file found at', watPath);
  console.log('Place a .wat file (e.g., add.wat) in ai-roomchat/wasm/ and re-run.');
  process.exit(0);
}

// Prefer to use the `wabt` npm module when available (local-friendly). Fallback to wat2wasm CLI.
(async () => {
  try {
    const wabtFactory = require('wabt');
    const wabt = typeof wabtFactory === 'function' ? await wabtFactory() : (wabtFactory && wabtFactory.default ? await wabtFactory.default() : null);
    if (!wabt) throw new Error('wabt factory not available');
    const src = require('fs').readFileSync(watPath, 'utf8');
    console.log('Compiling .wat via npm wabt...');
    const module = wabt.parseWat(path.basename(watPath), src);
    const { buffer } = module.toBinary({ write_debug_names: true });
    require('fs').writeFileSync(wasmPath, Buffer.from(buffer));
    console.log('WASM written to', wasmPath);
    process.exit(0);
  } catch (e) {
    // fallback to CLI
    exec('wat2wasm --version', (err) => {
      if (err) {
        console.log('wat2wasm not available in PATH and `wabt` npm module not installed. Install wabt (https://github.com/WebAssembly/wabt) or add the `wabt` npm package.');
        process.exit(0);
      }
      const cmd = `wat2wasm ${JSON.stringify(watPath)} -o ${JSON.stringify(wasmPath)}`;
      console.log('Running:', cmd);
      exec(cmd, (e2, stdout, stderr) => {
        if (e2) {
          console.error('wat2wasm failed:', stderr || e2.message);
          process.exit(2);
        }
        console.log('WASM written to', wasmPath);
        process.exit(0);
      });
    });
  }
})();
