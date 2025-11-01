const http = require('http');
const crypto = require('crypto');

const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:4100';
const SECRET = process.env.PROXY_SECRET || 'local-proxy-secret-change-me';

function hmacHex(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest('hex');
}

function httpPostJson(url, bodyObj, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(bodyObj);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers)
    };
    const req = http.request(opts, res => {
      let body = '';
      res.on('data', c => body += c.toString());
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getToken(clientId = 'demo-client') {
  return httpPostJson(`${PROXY_URL}/token`, { clientId });
}

async function callProxyWithToken(token, prompt) {
  const payload = { prompt };
  const payloadStr = JSON.stringify(payload);
  const sig = hmacHex(SECRET, payloadStr);
  return httpPostJson(`${PROXY_URL}/v1/gemini`, payload, { 'Authorization': `Bearer ${token}`, 'x-signature': sig });
}

async function main() {
  console.log('Requesting token...');
  const t = await getToken('demo-client');
  console.log('Token received (truncated):', (t.token || '').slice(0, 30));

  console.log('Calling proxy with signed payload...');
  const resp = await callProxyWithToken(t.token, 'Hello proxy PoC, summarize: secure migrations');
  console.log('Proxy response:', resp);
}

main().catch(err => { console.error(err); process.exit(1); });
