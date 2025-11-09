// Minimal network adapter factory for realtime transport

export function createNetworkAdapter(impl) {
  const required = ["connect", "disconnect", "send"];
  for (const key of required) {
    if (typeof impl[key] !== "function") {
      throw new Error(`NetworkAdapter missing required method: ${key}`);
    }
  }
  const noop = () => {};
  const api = {
    onMessage: noop,
    onState: noop,
    onPlayers: noop,
    onError: noop,
    ...impl,
  };
  return Object.freeze(api);
}

// Suggested messages
// client→server: join, input, cmd, chat
// server→client: state, patch, event, chat, players

