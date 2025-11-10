// Adapter manager: initialize optional adapters based on /game/adapters.config.json
// Note: import adapters dynamically to avoid bundling optional deps (socket.io-client, colyseus.js, yjs)

export async function initAdapters(config = {}, onEvent = () => {}) {
  const adapters = { net: null, sync: null, dispose: () => {} };
  const disposers = [];
  // Networking
  try {
    const net = config?.networking || null;
    if (net && typeof net === 'object') {
      if (net.id === 'socketio' && net.url) {
        const mod = await import('./adapters/netSocketIO.js').catch(() => null);
        const sock = mod && mod.connectSocketIO ? await mod.connectSocketIO(net.url, { token: net.token }) : null;
        if (!sock) throw new Error('socket.io adapter unavailable');
        sock.on('evt', (evt) => { try { onEvent(evt); } catch {} });
        adapters.net = {
          emit: (type, payload) => sock.emit('evt', { type, payload }),
          on: (event, fn) => sock.on(event, fn),
          disconnect: () => sock.disconnect(),
        };
        disposers.push(() => { try { sock.disconnect(); } catch {} });
      } else if (net.id === 'colyseus' && net.url) {
        const mod = await import('./adapters/netColyseus.js').catch(() => null);
        const cli = mod && mod.connectColyseus ? await mod.connectColyseus(net.url) : null;
        adapters.net = {
          emit: (type, payload) => { /* requires room context; left to user hook */ },
          on: () => {},
          disconnect: () => {},
        };
        // No generic event bridge; users join rooms in hooks and post events via publish()
        disposers.push(() => { /* noop */ });
      }
    }
  } catch {}
  // CRDT Sync
  try {
    const sync = config?.sync || null;
    if (sync && typeof sync === 'object') {
      if (sync.id === 'yjs') {
        const mod = await import('./adapters/syncYjs.js').catch(() => null);
        const doc = mod && mod.createYDoc ? await mod.createYDoc() : null;
        adapters.sync = { doc };
        disposers.push(() => { try { doc.destroy?.(); } catch {} });
      }
    }
  } catch {}

  adapters.dispose = () => { disposers.forEach((d) => { try { d(); } catch {} }); };
  return adapters;
}
