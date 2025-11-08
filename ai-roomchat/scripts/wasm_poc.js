#!/usr/bin/env node
// WASM PoC loader: if ai-roomchat/wasm/add.wasm exists, load it and call exported `add`.
// If not present, print instructions to compile the included WAT using `wat2wasm`.

const fs = require('fs');
const path = require('path');

const wasmPath = path.join(__dirname, '..', 'wasm', 'add.wasm');
const watPath = path.join(__dirname, '..', 'wasm', 'add.wat');

async function run() {
  if (!fs.existsSync(wasmPath)) {
    console.log('No compiled wasm found at:', wasmPath);
    console.log('You can generate it from the included WAT (requires wabt/wat2wasm):');
    console.log('  wat2wasm', watPath, '-o', wasmPath);
    console.log('Or provide your own Wasm binary exporting `add(i32,i32)->i32` at the path above.');
    process.exit(0);
  }

  const buf = fs.readFileSync(wasmPath);
  const mod = await WebAssembly.compile(buf);
  const instance = await WebAssembly.instantiate(mod, {});
  if (!instance.exports.add) {
    console.error('WASM module does not export `add`. Aborting.');
    process.exit(2);
  }

  const a = 5, b = 7;
  const res = instance.exports.add(a, b);
  console.log(`wasm.add(${a}, ${b}) = ${res}`);
  if (res !== a + b) process.exit(3);
}

run().catch(err => { console.error(err); process.exit(4); });
