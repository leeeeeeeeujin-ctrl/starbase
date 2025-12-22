// Shared helpers for /game/runtime.config.json
// Centralizes default config, parsing, and stringification so that
// Maker, Rank StartClient, and workspace defaults stay in sync.

export const defaultRuntimeConfig = {
  version: 1,
  roles: ['players', 'observers'],
  engine: 'builtin',
  mode: 'turn',
  entryNode: 'start',
  ai: { model: 'gemini-2.5-flash' },
  turnTimer: {
    timeoutSec: 60,
    roleThreshold: 0.5,
    requiredRoles: ['players'],
  },
  // Legacy fields kept for backward compatibility with older games.
  voteThreshold: 0.6667,
  durations: [30, 60, 90, 120, 180],
};

export function parseRuntimeConfig(text) {
  const raw = String(text || '').trim();
  if (!raw) return { config: null, error: null };
  try {
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== 'object') {
      return { config: null, error: new Error('runtime_config must be an object') };
    }
    return { config: cfg, error: null };
  } catch (err) {
    return { config: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export function stringifyRuntimeConfig(config) {
  const src = config && typeof config === 'object' ? config : defaultRuntimeConfig;
  return JSON.stringify(src, null, 2) + '\n';
}
