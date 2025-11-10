// Yjs Sync Adapter (skeleton)

export async function createYDoc(options = {}) {
  const Y = await import('yjs').catch(() => null);
  if (!Y) throw new Error('yjs not available');
  const doc = new Y.Doc();
  return doc;
}

export async function attachAwareness(provider) {
  // Placeholder: integrate with y-protocols/awareness if available
  return { dispose(){} };
}

