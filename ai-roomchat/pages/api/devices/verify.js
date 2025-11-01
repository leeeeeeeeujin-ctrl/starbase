import { readStore, hmacHex, sha256Hex, timingSafeEqualHex, decryptSecret } from '../../../lib/hmac';

// Use the pluggable nonce store (Redis-first, memory fallback). This provides
// atomic set-if-not-exists semantics across instances when REDIS_URL is set.
const NONCE_TTL = 60 * 5; // 5 minutes
const nonceStore = require('../../../lib/nonceStore');

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

    // timestamp check
    const now = Math.floor(Date.now() / 1000);
    const tsNum = Number(timestamp);
    if (isNaN(tsNum) || Math.abs(now - tsNum) > 120) return res.status(401).json({ error: 'invalid timestamp' });

    // nonce dedupe — use centralized store atomically (Redis when available).
    const nonceKey = `${deviceId}:${nonce}`;
    try {
      const setOk = await nonceStore.setIfNotExists(nonceKey, NONCE_TTL);
      if (!setOk) return res.status(401).json({ error: 'replayed nonce' });
    } catch (e) {
      // If the nonce store fails for any reason, reject conservatively or
      // fall back to allowing (we choose to reject to be safe).
      console.warn('nonceStore.setIfNotExists failed:', String(e));
      return res.status(500).json({ error: 'nonce_store_unavailable' });
    }

    // Build signing input same as client: method\npath\nts\nnonce\nbodyHash
    const method = req.method;
    const path = req.url || '/api/devices/verify';
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

  // success: nonce already set above via setIfNotExists (atomic)

    return res.status(200).json({ ok: true, deviceId });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
import { verifyToken } from '../../../lib/security/token';
import { getDeviceByToken, saveEvent } from '../../../lib/devicesStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token_required' });

  const secret = process.env.RUN_DEVICE_SECRET || process.env.RUN_CAPABILITY_SECRET || process.env.RUN_SIGNING_SECRET || '';
  if (!secret) return res.status(500).json({ error: 'server_secret_not_configured' });

  try {
    const payload = verifyToken(String(token), secret);
    if (!payload) return res.status(401).json({ error: 'invalid_or_expired' });

    // check store
    const stored = await getDeviceByToken(String(token));
    if (!stored || !stored.row) return res.status(404).json({ error: 'device_not_found' });
    try {
      const actor = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      await saveEvent({ device_token: String(token), device_id: (stored && stored.row && (stored.row.device_id || stored.row.deviceId)) || null, event_type: 'verify', detail: 'device token verified', actor });
    } catch (e) {
      // ignore audit failures
    }

    return res.status(200).json({ ok: true, payload, device: stored.row });
  } catch (e) {
    return res.status(500).json({ error: 'verify_failed', detail: String(e) });
  }
}
