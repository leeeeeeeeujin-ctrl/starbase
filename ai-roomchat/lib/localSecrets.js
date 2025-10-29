const fs = require('fs');
const path = require('path');

// Loads a local credentials file for server-only usage.
// Default path: <repo-root>/ai-roomchat/local_credentials.json
// You can override by setting AI_ROOMCHAT_LOCAL_CREDENTIALS env var to an absolute path.

let cached = null;

function defaultPath() {
  // process.cwd() when running in dev from ai-roomchat should be project root ai-roomchat
  return path.resolve(process.cwd(), 'local_credentials.json');
}

function loadSync() {
  const envPath = process.env.AI_ROOMCHAT_LOCAL_CREDENTIALS;
  const p = envPath ? envPath : defaultPath();
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, { encoding: 'utf8' });
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    // swallow JSON parse errors and return null — callers should handle null
    console.warn('[localSecrets] failed to load or parse', p, err && err.message);
    return null;
  }
}

function getLocalSecrets({ force = false } = {}) {
  if (cached && !force) return cached;
  cached = loadSync();
  return cached;
}

module.exports = { getLocalSecrets };
