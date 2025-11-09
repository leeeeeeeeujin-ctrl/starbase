// Server-first mode: disable legacy local VFS injection to prevent cross-set bleed.
export default function injectFilesFallback() {
  if (process.env.NODE_ENV !== 'production') {
    try { console.warn('[workspace] injectFilesFallback is disabled (server-first)'); } catch {}
  }
  return false;
}

