const https = require('https');

// Supabase service_role key and URL (provided by user for dev)
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2b3BtYXd6c3phbWd1eWR5bHd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODE2NTMxMSwiZXhwIjoyMDczNzQxMzExfQ.hSyMn-JZPRhnQIh61B0hQb1djUkS82vwlilVoSrM1bk';
const host = 'jvopmawzszamguydylwu.supabase.co';

function get(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: host,
      path,
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        Accept: 'application/json',
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error('status ' + res.statusCode + ' ' + data));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const tables = ['text_battle_sessions', 'text_battle_turns'];
  for (const t of tables) {
    try {
      const res = await get(`/rest/v1/${t}?select=*&limit=1`);
      console.log(t + ': ok', res.status);
      console.log(res.body.slice(0, 500));
    } catch (e) {
      console.log(t + ': error', String(e.message || e));
    }
  }
})();

