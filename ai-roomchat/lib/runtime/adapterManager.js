// Adapter manager: initialize optional adapters based on /game/adapters.config.json
import { connectSocketIO } from './adapters/netSocketIO.js';
import { connectColyseus } from './adapters/netColyseus.js';
import { createYDoc } from './adapters/syncYjs.js';

export async function initAdapters(config = {}, onEvent = () => {}) {
  const adapters = { net: null, sync: null, dispose: () => {} };
  const disposers = [];
  // Networking
  try {
    const net = config?.networking || null;
    if (net && typeof net === 'object') {
      if (net.id === 'socketio' && net.url) {
        const sock = await connectSocketIO(net.url, { token: net.token });
        sock.on('evt', (evt) => { try { onEvent(evt); } catch {} });
        adapters.net = {
          emit: (type, payload) => sock.emit('evt', { type, payload }),
          on: (event, fn) => sock.on(event, fn),
          disconnect: () => sock.disconnect(),
        };
        disposers.push(() => { try { sock.disconnect(); } catch {} });
      } else if (net.id === 'colyseus' && net.url) {
        const cli = await connectColyseus(net.url);
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
        const doc = await createYDoc();
        adapters.sync = { doc };
        disposers.push(() => { try { doc.destroy?.(); } catch {} });
      }
    }
  } catch {}

  adapters.dispose = () => { disposers.forEach((d) => { try { d(); } catch {} }); };
  return adapters;
}

