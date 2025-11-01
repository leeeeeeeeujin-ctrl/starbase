const fs = require('fs');
const path = require('path');

function loadDotEnv(file) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#') || line.indexOf('=') === -1) continue;
    const [k, ...rest] = line.split('=');
    const v = rest.join('=').trim();
    process.env[k.trim()] = v;
  }
}

async function run() {
  loadDotEnv(path.join(__dirname, '..', '.env.local'));
  const SUPA = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BUCK = process.env.SUPABASE_BUCKET;
  if (!SUPA || !KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
    process.exit(2);
  }

  const out = (name, data) => fs.writeFileSync(path.join(__dirname, '..', name), data);

  console.log('SUPABASE_URL=', SUPA, 'BUCKET=', BUCK);

  try {
  const bres = await fetch(`${SUPA}/storage/v1/bucket`, { headers: { Authorization: `Bearer ${KEY}`, apikey: KEY } });
    const btext = await bres.text();
    out('node_bucket_list_raw.txt', `status:${bres.status}\n${btext}`);
    try { out('node_bucket_list.json', JSON.stringify(JSON.parse(btext), null, 2)); } catch(e){}
    console.log('bucket list status', bres.status);
  } catch (e) {
    console.error('bucket list request failed', e);
  }

  if (BUCK) {
    try {
  const lres = await fetch(`${SUPA}/storage/v1/object/list/${encodeURIComponent(BUCK)}`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 50 }) });
  const ltext = await lres.text();
      out('node_list_raw.txt', `status:${lres.status}\n${ltext}`);
      try { out('node_list.json', JSON.stringify(JSON.parse(ltext), null, 2)); } catch(e){}
      console.log('list status', lres.status);
    } catch (e) {
      console.error('list request failed', e);
    }
  } else {
    console.log('No BUCKET set; skipping list.');
  }

  // find latest local backup
  const dir = path.join(__dirname, '..');
  const files = fs.readdirSync(dir).filter(x => x.match(/^migration-backup-.*\.sql\.gz$/));
  if (files.length === 0) {
    console.log('No local backup file found; skipping upload.');
    return;
  }
  files.sort((a,b)=> fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs);
  const latest = files[0];
  console.log('Attempt upload:', latest);
  const url = `${SUPA}/storage/v1/object/put/${encodeURIComponent(BUCK)}/${encodeURIComponent(latest)}`;
  try {
    const buffer = fs.readFileSync(path.join(dir, latest));
    const ures = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type':'application/gzip' }, body: buffer });
    const utext = await ures.text();
    out('node_upload_raw.txt', `status:${ures.status}\n${utext}`);
    console.log('upload status', ures.status);
    if (ures.status >= 400) {
      // First fallback: try PUT to /storage/v1/object/{bucket}/{id}
      try {
        const altUrl = `${SUPA}/storage/v1/object/${encodeURIComponent(BUCK)}/${encodeURIComponent(latest)}`;
        console.log('Attempting alternate PUT to', altUrl);
        const altRes = await fetch(altUrl, { method: 'PUT', headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'application/gzip' }, body: buffer });
        const altText = await altRes.text();
        out('node_upload_alt_raw.txt', `status:${altRes.status}\n${altText}`);
        console.log('alternate upload status', altRes.status);
      } catch (e) {
        console.error('alternate upload failed', e);
      }

      // Second fallback: try multipart/form-data POST to /storage/v1/object/{bucket}
      try {
        console.log('Attempting fallback multipart POST to /storage/v1/object/{bucket}');
        const FormData = global.FormData || (await import('formdata-node')).FormData;
        const fd = new FormData();
        const stream = fs.createReadStream(path.join(dir, latest));
        // append stream with filename (undici FormData may require a Blob; try stream)
        fd.append('file', stream, latest);
        // When using formdata-node or global FormData in Node 18+, don't set Content-Type header; fetch will set it.
        const ures2 = await fetch(`${SUPA}/storage/v1/object/${encodeURIComponent(BUCK)}`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, apikey: KEY }, body: fd });
        const utext2 = await ures2.text();
        out('node_upload2_raw.txt', `status:${ures2.status}\n${utext2}`);
        console.log('fallback upload status', ures2.status);
      } catch (e) {
        console.error('fallback upload failed', e);
      }
    }
  } catch (e) {
    console.error('upload request failed', e);
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
