const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input || '').digest('hex');
}

function hmacHex(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest('hex');
}

function timingSafeEqualHex(a, b) {
  try {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch (e) {
    return false;
  }
}

// simple file-backed device store for local/dev use only
const STORE_PATH = path.join(process.cwd(), 'ai-roomchat', 'data', 'devices.json');

function ensureStore() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify({}), 'utf8');
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8') || '{}');
  } catch (e) {
    return {};
  }
}

function writeStore(obj) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

// Encrypt/decrypt device secrets using AES-256-GCM with a master key from env.
// This avoids storing raw secrets in plaintext. In production, use a real KMS.
function encryptSecret(secret, masterKeyHex) {
  if (!masterKeyHex) throw new Error('MASTER_KEY not configured');
  const key = Buffer.from(masterKeyHex, 'hex');
  if (key.length !== 32) throw new Error('MASTER_KEY must be 32 bytes (hex)');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + ct.toString('hex') + ':' + tag.toString('hex');
}

function decryptSecret(enc, masterKeyHex) {
  if (!masterKeyHex) throw new Error('MASTER_KEY not configured');
  const key = Buffer.from(masterKeyHex, 'hex');
  if (key.length !== 32) throw new Error('MASTER_KEY must be 32 bytes (hex)');
  const [ivHex, ctHex, tagHex] = String(enc || '').split(':');
  if (!ivHex || !ctHex || !tagHex) throw new Error('malformed encrypted secret');
  const iv = Buffer.from(ivHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  return out.toString('utf8');
}

module.exports = {
  sha256Hex,
  hmacHex,
  timingSafeEqualHex,
  readStore,
  writeStore,
  encryptSecret,
  decryptSecret,
};
