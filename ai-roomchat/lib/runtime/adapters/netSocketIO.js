// Socket.IO Networking Adapter (contract skeleton)

/**
 * @typedef {{
 *  emit: (event:string, payload?:any)=>void,
 *  on: (event:string, fn:(payload:any)=>void)=>void,
 *  disconnect: ()=>void,
 * }} SocketClient
 */

/**
 * Connect to a Socket.IO server.
 * Note: actual import of socket.io-client is left to app integration.
 * @param {string} url
 * @param {{ token?: string }} [options]
 * @returns {Promise<SocketClient>}
 */
export async function connectSocketIO(url, options = {}) {
  const { io } = await import(/* webpackIgnore: true */ 'socket.io-client').catch(() => ({ io: null }));
  if (!io) throw new Error('socket.io-client not available');
  const sock = io(url, { auth: options.token ? { token: options.token } : undefined });
  const api = {
    emit: (ev, p) => sock.emit(ev, p),
    on: (ev, fn) => sock.on(ev, fn),
    disconnect: () => sock.disconnect(),
  };
  return api;
}

