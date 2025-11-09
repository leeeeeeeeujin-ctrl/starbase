(async ()=>{
  const fetchFn = global.fetch || (await import('node-fetch')).default;
  const root = 'http://localhost:3000';
  let ready = false;
  for (let i=0;i<30;i++){
    try{
      const r = await fetchFn(root, { method: 'GET' });
      console.log('GET / ->', r.status);
      ready = true; break;
    }catch(e){
      process.stdout.write('.');
      await new Promise(r=>setTimeout(r, 1000));
    }
  }
  if(!ready){ console.error('\nServer not reachable after timeout'); process.exit(2); }

  const headers = {'Content-Type':'application/json','X-Request-Id':'dup-probe-node'};
  const payload = { name: 'dup-probe-node' };
  console.log('\nPOST #1');
  try{ const r1 = await fetchFn(root + '/api/prompts', { method: 'POST', headers, body: JSON.stringify(payload) });
    console.log('POST1 status', r1.status); console.log('POST1 body', await r1.text());
  }catch(e){ console.error('POST1 error', e); }
  console.log('\nPOST #2');
  try{ const r2 = await fetchFn(root + '/api/prompts', { method: 'POST', headers, body: JSON.stringify(payload) });
    console.log('POST2 status', r2.status); console.log('POST2 body', await r2.text());
  }catch(e){ console.error('POST2 error', e); }

  try{ const list = await fetchFn(root + '/api/prompts'); console.log('\nLIST', await list.text()); } catch(e){ console.error('LIST error', e); }

})();
