export async function pushCreationLog(entry) {
  // Minimal no-op creation log for local/dev builds.
  try {
    // Keep lightweight: don't throw in production build if logging is unavailable.
    // eslint-disable-next-line no-console
    console.log('[creationLog]', entry && entry.kind, entry && entry.detail ? entry.detail.url : 'no-detail');
  } catch (e) {}
}
