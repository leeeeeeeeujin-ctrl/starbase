// Colyseus Networking Adapter (skeleton)

export async function connectColyseus(url, options = {}) {
  // Defer import; app can provide colyseus.js. Mark webpackIgnore to avoid bundling requirement.
  const colyseus = await import(/* webpackIgnore: true */ 'colyseus.js').catch(() => null);
  if (!colyseus) throw new Error('colyseus.js not available');
  const client = new colyseus.Client(url);
  async function join(roomName, payload){ return client.joinOrCreate(roomName, payload); }
  return { join };
}
