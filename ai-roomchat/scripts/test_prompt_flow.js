const base = 'http://localhost:3000';
(async () => {
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Request-Id': 'flow-test' };

    const payload = { name: 'dup-check-' + Date.now(), description: 'auto test prompt' };
    let r = await fetch(base + '/api/prompts', { method: 'POST', headers, body: JSON.stringify(payload) });
    console.log('POST /api/prompts', r.status, await r.text());

    const list = await fetch(base + '/api/prompts');
    console.log('GET /api/prompts', list.status, await list.text());

    const sid = 'test-set-' + Date.now();
    r = await fetch(base + '/api/workspace/sets', { method: 'POST', headers, body: JSON.stringify({ id: sid, files: { 'a.txt': 'hello' } }) });
    console.log('POST /api/workspace/sets', r.status, await r.text());

    r = await fetch(base + `/api/workspace/sets/${sid}`, { method: 'PUT', headers, body: JSON.stringify({ files: { 'a.txt': 'updated' } }) });
    console.log('PUT /api/workspace/sets/:id', r.status, await r.text());

    // final GET to confirm store
    const getset = await fetch(base + `/api/workspace/sets/${sid}`);
    console.log('GET /api/workspace/sets/:id', getset.status, await getset.text());
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
