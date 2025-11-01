const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
const path = require('path');
const fs = require('fs');

(async function(){
  const infile = path.resolve(__dirname, '..', 'workflows', 'blockly-sample.json');
  const outfile = path.resolve(__dirname, '..', 'workflows', 'blockly-sample.out.js');
  // ensure converted (invoke CLI explicitly)
  const child = require('child_process').spawn(process.execPath, [require.resolve('./blockly_poc.js'), infile, outfile], { stdio: 'inherit' });
  child.on('exit', async (code) => {
    if (code !== 0) {
      console.error('Conversion failed with code', code); process.exit(2);
    }
    const codeJs = fs.readFileSync(outfile,'utf8');
    // start server
    const { app } = require('../proxy/server');
    const server = app.listen(0, async () => {
      const port = server.address().port;
      console.log('Proxy server started on', port);
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/run/blockly`, {
          method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ code: codeJs })
        });
        const j = await resp.json();
        console.log('Run result:', j);
      } catch (e) {
        console.error('Runner error:', e.message);
      } finally {
        server.close();
        process.exit(0);
      }
    });
  });
})();
