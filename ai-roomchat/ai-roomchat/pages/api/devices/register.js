import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { readStore, writeStore, encryptSecret } from '../../../lib/hmac';
import { createToken } from '../../../lib/security/token';
import { saveDevice, saveEvent } from '../../../lib/devicesStore';

// Device registration endpoint (dev-friendly, production-safe defaults)
// - If ADMIN_PORTAL_PASSWORD is set in env, require `adminPassword` in the request body.
// - Generate a raw device secret (returned once) and persist an encrypted blob using MASTER_KEY_HEX.
// - Persist device metadata via devicesStore (Supabase when configured) with fallback to in-memory.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { deviceId: maybeId, displayName, adminPassword, platform, ttlSeconds } = req.body || {};

  // Require admin password when ADMIN_PORTAL_PASSWORD is configured (production protection)
  const adminEnv = process.env.ADMIN_PORTAL_PASSWORD || '';
  if (adminEnv && adminEnv.length > 0) {
    if (!adminPassword || adminPassword !== adminEnv) {
      return res.status(401).json({ error: 'admin_password_required' });
    }
  }

  // Optional: restrict registration to CI-only flows. When REGISTRATION_CI_ONLY is 'true',
  // require the X-CI-REGISTRATION-TOKEN header to match CI_REGISTRATION_TOKEN env var.
  if (String(process.env.REGISTRATION_CI_ONLY || '').toLowerCase() === 'true') {
    const ciToken = req.headers['x-ci-registration-token'] || req.headers['X-CI-REGISTRATION-TOKEN'];
    const expected = process.env.CI_REGISTRATION_TOKEN || '';
    if (!ciToken || !expected || String(ciToken) !== String(expected)) {
      return res.status(401).json({ error: 'ci_registration_required' });
    }
  }

  // MASTER_KEY_HEX is required for encrypting device secrets at rest
  const masterHex = process.env.MASTER_KEY_HEX;
  if (!masterHex) return res.status(500).json({ error: 'server misconfigured: MASTER_KEY_HEX missing' });

  const id = maybeId || uuidv4();
  const name = displayName || `device-${id}`;

  // Raw secret for the device (returned only once). Use 32 bytes hex.
  const rawSecret = crypto.randomBytes(32).toString('hex');

  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(ttlSeconds) || 60 * 60 * 24 * 30; // default 30 days
  const exp = now + ttl;

  // Encrypt secret before persisting
  let encrypted = null;
  try {
    encrypted = encryptSecret(rawSecret, masterHex);
  } catch (e) {
    return res.status(500).json({ error: 'encryption_failed', detail: String(e) });
  }

  // Create a token for the device for legacy flows (signed token)
  const signingSecret = process.env.RUN_DEVICE_SECRET || process.env.RUN_CAPABILITY_SECRET || process.env.RUN_SIGNING_SECRET || 'localdev';
  let token;
  try {
    token = createToken({ deviceId: id, displayName: name, type: 'device' }, signingSecret, ttl);
  } catch (e) {
    return res.status(500).json({ error: 'token_creation_failed', detail: String(e) });
  }

  // Persist via devicesStore (Supabase when configured) — include encrypted_secret for server-side verify
  try {
    await saveDevice({ device_id: id, display_name: name, token, iat: now, exp, encrypted_secret: encrypted, platform: platform || null });
    try {
      const actor = adminPassword ? 'admin' : (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
      await saveEvent({ device_token: token, device_id: id, event_type: 'register', detail: `registered ${name}`, actor });
    } catch (e) {
      // ignore audit failures
    }
  } catch (e) {
    // fallback: write to file-backed store so dev flows keep working
    try {
      const store = readStore();
      store[id] = { id, displayName: name, platform: platform || null, created_at: now, expires_at: exp, encrypted_secret: encrypted };
      writeStore(store);
    } catch (e2) {
      return res.status(500).json({ error: 'persist_failed', detail: String(e2) });
    }
  }

  // Return token and raw secret once so the client can save it securely.
  return res.status(200).json({ token, deviceId: id, displayName: name, device_secret: rawSecret, exp });
}
