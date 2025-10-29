async function callProvider({ provider = 'mock', prompt, opts = {} }) {
  // Simulate latency
  await new Promise(r => setTimeout(r, 200));
  return {
    text: `MOCK RESPONSE: processed prompt (length=${String(prompt).length})`,
    raw: { provider, prompt, opts },
    usage: { tokens: Math.min(1000, String(prompt).length / 4) },
  };
}

module.exports = { callProvider };
