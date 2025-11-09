import { createNetworkAdapter } from "../../../lib/game/network/types.js";

// Usage: replace URL/auth to fit your server. This is a template.
export default function createSocketIONetwork({ url, token, roomId }) {
  let socket = null;
  let onMessage = () => {};
  let onState = () => {};
  let onPlayers = () => {};
  let onError = () => {};

  return createNetworkAdapter({
    async connect(params = {}) {
      const io = (await import("socket.io-client")).io;
      socket = io(url || params.url, { auth: { token } });
      socket.on("connect_error", (e) => onError(e));
      socket.on("msg", (type, payload) => onMessage(type, payload));
      socket.on("state", (s) => onState(s));
      socket.on("players", (p) => onPlayers(p));
      if (roomId || params.roomId) socket.emit("join", { roomId: roomId || params.roomId });
      return true;
    },
    send(type, payload) {
      socket?.emit("msg", type, payload);
    },
    disconnect() {
      try { socket?.disconnect(); } finally { socket = null; }
    },
    onMessage(fn) { onMessage = fn; },
    onState(fn) { onState = fn; },
    onPlayers(fn) { onPlayers = fn; },
    onError(fn) { onError = fn; },
  });
}

