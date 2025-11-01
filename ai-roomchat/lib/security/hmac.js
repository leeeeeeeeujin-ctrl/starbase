const crypto = require('crypto');

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function signPayload(obj, secret) {
  const s = stableStringify(obj || {});
  return crypto.createHmac('sha256', String(secret || '')).update(s).digest('hex');
}

function verifySignature(obj, signature, secret) {
  if (!signature) return false;
  const expected = signPayload(obj, secret);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(signature || ''), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

module.exports = { signPayload, verifySignature, stableStringify };
