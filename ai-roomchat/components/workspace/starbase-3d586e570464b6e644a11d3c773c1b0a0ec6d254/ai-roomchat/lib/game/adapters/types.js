// Minimal adapter factory definitions for pluggable game engines
// Adapters are plain objects validated by shape at usage sites.

export function createGameAdapter(impl) {
  const required = [
    "init",
    "start",
    "stop",
    "dispose",
  ];
  for (const key of required) {
    if (typeof impl[key] !== "function") {
      throw new Error(`GameAdapter missing required method: ${key}`);
    }
  }
  return Object.freeze({
    loadAssets: async () => {},
    update: () => {},
    resize: () => {},
    onInput: () => {},
    onMessage: () => {},
    getSnapshot: () => null,
    ...impl,
  });
}

// Context passed to init(container, ctx)
// ctx: { sessionId, gameId, character, network, emit(event) }

