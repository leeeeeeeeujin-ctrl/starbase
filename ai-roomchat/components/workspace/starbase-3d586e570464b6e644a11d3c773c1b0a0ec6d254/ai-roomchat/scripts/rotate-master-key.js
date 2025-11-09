#!/usr/bin/env node
// Rotate MASTER_KEY used to encrypt device secrets.
// Usage:
//   MASTER_KEY_OLD=<oldhex> MASTER_KEY_NEW=<newhex> node scripts/rotate-master-key.js [--dry-run]
// Or:
//   node scripts/rotate-master-key.js --old <oldhex> --new <newhex> [--dry-run]

const { readStore, writeStore, decryptSecret, encryptSecret } = require('../lib/hmac');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry' || a === '--dry-run') out.dryRun = true;
    if ((a === '--old' || a === '--old-key') && args[i + 1]) out.old = args[++i];
    if ((a === '--new' || a === '--new-key') && args[i + 1]) out.new = args[++i];
  }
  return out;
}

async function trySupabaseReencrypt(oldKey, newKey, dryRun) {
  try {
    const supa = require('../lib/supabaseAdmin').supabase;
    if (!supa) return 0;
    console.log('Supabase admin detected - attempting to re-encrypt devices table rows');
    const { data, error } = await supa.from('devices').select('id,encrypted_secret');
    if (error) throw error;
    let changed = 0;
    for (const row of data || []) {
      if (!row.encrypted_secret) continue;
      try {
        const secret = decryptSecret(row.encrypted_secret, oldKey);
        const reenc = encryptSecret(secret, newKey);
        if (!dryRun) {
          await supa.from('devices').update({ encrypted_secret: reenc }).eq('id', row.id);
        }
        changed++;
        console.log('Rotated supabase device', row.id);
      } catch (e) {
        console.warn('Supabase rotate failed for', row.id, String(e));
      }
    }
    return changed;
  } catch (e) {
    console.warn('Supabase re-encrypt attempt failed or not configured:', String(e));
    return 0;
  }
}

async function main() {
  const { old: oldArg, new: newArg, dryRun } = parseArgs();
  const oldKey = process.env.MASTER_KEY_OLD || process.env.OLD_MASTER_KEY_HEX || oldArg;
  const newKey = process.env.MASTER_KEY_NEW || process.env.NEW_MASTER_KEY_HEX || newArg;
  if (!oldKey || !newKey) {
    console.error('Missing keys. Provide MASTER_KEY_OLD and MASTER_KEY_NEW env vars or --old/--new args.');
    process.exit(2);
  }

  console.log('MASTER_KEY rotation script');
  console.log('dry-run:', !!dryRun);

  // Try Supabase first (best-effort)
  const supaChanged = await trySupabaseReencrypt(oldKey, newKey, dryRun);
  if (supaChanged) console.log('Supabase re-encrypted rows:', supaChanged);

  // Fallback: file-backed store
  let store = {};
  try {
    store = readStore() || {};
  } catch (e) {
    console.warn('Failed to read file-backed store:', String(e));
  }

  let changed = 0;
  for (const k of Object.keys(store || {})) {
    const rec = store[k];
    if (!rec || !rec.encrypted_secret) continue;
    try {
      const secret = decryptSecret(rec.encrypted_secret, oldKey);
      const reenc = encryptSecret(secret, newKey);
      if (!dryRun) {
        rec.encrypted_secret = reenc;
        store[k] = rec;
      }
      changed++;
      console.log('Will rotate for device:', k);
    } catch (e) {
      console.warn('Failed to re-encrypt key for', k, String(e));
    }
  }

  if (!dryRun) {
    try {
      writeStore(store);
      console.log('File-backed store updated');
    } catch (e) {
      console.error('Failed to write file store:', String(e));
    }
  }

  console.log('Rotation complete. File-backed records scanned:', Object.keys(store).length, 'updated:', changed);
  if (dryRun) console.log('Dry-run true: no changes were written.');
}

main().catch(e => {
  console.error('Fatal error', String(e));
  process.exit(1);
});
