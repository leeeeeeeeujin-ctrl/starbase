// Minimal AI adapter interface for invoking user-provided LLM backends via a safe proxy.

export function createAIAdapter(impl) {
  const required = ["invoke"];
  for (const k of required) {
    if (typeof impl[k] !== "function") throw new Error(`AIAdapter missing ${k}`);
  }
  const defaults = {
    stream: null, // optional (prompt, options) => async iterator of tokens
    cancel: () => {},
    onError: () => {},
  };
  return Object.freeze({ ...defaults, ...impl });
}

