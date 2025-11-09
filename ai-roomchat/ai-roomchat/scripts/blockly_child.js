const fs = require('fs');
const vm = require('vm');

// Usage: node scripts/blockly_child.js path/to/code.js
(async function(){
  const p = process.argv[2];
  if (!p) {
    console.error(JSON.stringify({ error: 'missing_path' }));
    process.exit(2);
  }
  try {
    const code = fs.readFileSync(p,'utf8');
    const logs = [];
    const sandbox = {
      console: { log: (...args) => logs.push(args.map(a=>String(a)).join(' ')) },
      Date: Date,
      Math: Math,
    };
    const ctx = vm.createContext(sandbox);
    const script = new vm.Script(code, { filename: 'child-blockly.js', displayErrors: true });
    try {
      script.runInContext(ctx, { timeout: 1000 });
      console.log(JSON.stringify({ ok: true, logs }));
      process.exit(0);
    } catch (e) {
      console.log(JSON.stringify({ ok: false, error: 'execution_error', message: e.message, logs }));
      process.exit(3);
    }
  } catch (e) {
    console.error(JSON.stringify({ error: 'read_failed', message: e.message }));
    process.exit(4);
  }
})();
