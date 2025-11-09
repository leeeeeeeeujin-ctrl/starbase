const { readStore, hmacHex, sha256Hex, timingSafeEqualHex, decryptSecret } = require('../../../lib/hmac');
const nonceStore = require('../../../lib/nonceStore');

// TTL for nonces (seconds)
const NONCE_TTL = 60 * 5; // 5 minutes

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  try {
    const deviceId = req.headers['x-device-id'];
    const timestamp = req.headers['x-request-timestamp'];
    const nonce = req.headers['x-request-nonce'];
    const signature = req.headers['x-client-signature'];

    if (!deviceId || !timestamp || !nonce || !signature) {
      return res.status(401).json({ error: 'missing required signature headers' });
    }

    const store = readStore();
    const record = store[deviceId];
    if (!record || !record.encrypted_secret) return res.status(401).json({ error: 'unknown device' });

    // timestamp check (allow slight clock skew)
    const now = Math.floor(Date.now() / 1000);
    const tsNum = Number(timestamp);
    if (isNaN(tsNum) || Math.abs(now - tsNum) > 120) return res.status(401).json({ error: 'invalid timestamp' });

    // nonce dedupe using nonceStore (atomic if Redis configured)
    const nonceKey = `${deviceId}:${nonce}`;
    const setOk = await nonceStore.setIfNotExists(nonceKey, NONCE_TTL);
    if (!setOk) return res.status(401).json({ error: 'replayed nonce' });

    // Build signing input same as client: method\npath\nts\nnonce\nbodyHash
    const method = req.method;
    const path = req.url || '/api/devices/verify-signature';
    const bodyStr = req.body ? JSON.stringify(req.body) : '';
    const bodyHash = sha256Hex(bodyStr);
    const signingInput = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;

    // decrypt secret using MASTER_KEY_HEX
    const masterHex = process.env.MASTER_KEY_HEX;
    if (!masterHex) return res.status(500).json({ error: 'server misconfigured: MASTER_KEY_HEX missing' });
    let secret;
    try {
      secret = decryptSecret(record.encrypted_secret, masterHex);
    } catch (e) {
      return res.status(500).json({ error: 'failed to decrypt device secret' });
    }

    const expected = hmacHex(secret, signingInput);
    if (!timingSafeEqualHex(expected, signature)) return res.status(401).json({ error: 'invalid signature' });

    return res.status(200).json({ ok: true, deviceId });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
