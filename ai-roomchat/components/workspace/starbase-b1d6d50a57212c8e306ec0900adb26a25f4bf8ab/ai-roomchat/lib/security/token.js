const { signPayload, stableStringify } = require('./hmac');

function createToken(payload = {}, secret, ttlSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + Math.max(1, Number(ttlSeconds) || 300),
  };
  const sig = signPayload(body, secret);
  // token = base64(body) + '.' + sig
  const b = Buffer.from(stableStringify(body)).toString('base64');
  return `${b}.${sig}`;
}

function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  try {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    // parse stable JSON-like format; our stableStringify produces a JSON-like string
    const payload = JSON.parse(json);
    const ok = require('./hmac').verifySignature(payload, sig, secret);
    if (!ok) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && Number(payload.exp) < now) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { createToken, verifyToken };
