const fetch = globalThis.fetch || require("node-fetch");
(async ()=> {
  const headers = {'Content-Type':'application/json','X-Request-Id':'dup-check'};
  const payload = { name: 'dup-check' };
  const r1 = await fetch('http://localhost:3000/api/prompts', { method: 'POST', headers, body: JSON.stringify(payload) });
  console.log('r1', r1.status, await r1.text());
  const r2 = await fetch('http://localhost:3000/api/prompts', { method: 'POST', headers, body: JSON.stringify(payload) });
  console.log('r2', r2.status, await r2.text());
  const list = await fetch('http://localhost:3000/api/prompts');
  console.log('list', await list.text());
})().catch(e=>{ console.error(e); process.exit(1); });
