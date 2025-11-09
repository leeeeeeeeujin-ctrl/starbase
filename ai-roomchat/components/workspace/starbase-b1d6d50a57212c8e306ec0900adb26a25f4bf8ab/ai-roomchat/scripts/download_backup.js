const fs = require('fs');
const path = require('path');
(async()=>{
  const envPath = path.join(__dirname, '..', '.env.local');
  const s = fs.readFileSync(envPath,'utf8');
  const SUPA = (s.match(/^SUPABASE_URL=(.*)$/m)||[])[1].trim();
  const KEY = (s.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)||[])[1].trim();
  const BUCK = ((s.match(/^SUPABASE_BUCKET=(.*)$/m)||[])[1]||'migration-backups').trim();
  const file = 'migration-backup-20251101T054301.sql.gz';
  const url = `${SUPA}/storage/v1/object/${encodeURIComponent(BUCK)}/${encodeURIComponent(file)}`;
  console.log('Downloading from', url);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}`, apikey: KEY } });
  console.log('status', res.status);
  const body = await res.text();
  if (res.status !== 200) {
    console.log('response body:', body);
    process.exit(0);
  }
  const arr = new Uint8Array(await (await fetch(url, { headers: { Authorization: `Bearer ${KEY}`, apikey: KEY } })).arrayBuffer());
  const outPath = path.join(__dirname, '..', 'downloaded-backup.gz');
  fs.writeFileSync(outPath, Buffer.from(arr));
  console.log('wrote', outPath, Buffer.from(arr).length);
})();
