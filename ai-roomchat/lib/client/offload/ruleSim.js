// Local rule/match simulation stub.
// Provide a simple deterministic computation to emulate server logic.
// In production replace with real WASM or JS port of server rules.

import { detectCapabilities } from '@/lib/client/capabilities/detect';
import { ensureSandbox, runRuleSimInSandbox } from '@/lib/client/sandbox/iframeSandbox';

export async function simulateMatchLocally(state, opts = {}) {
  const caps = await detectCapabilities();
  const deviceTier = caps.deviceTier;
  if (deviceTier === 'low') return { simulated: false, reason: 'low_tier' };

  // Prefer iframe sandbox for isolation if available
  const useSandbox = ensureSandbox();
  if (useSandbox) {
    try {
      const sandboxResult = await runRuleSimInSandbox(state, { timeout: opts.timeout || 1800 });
      return { ...sandboxResult, simulated: true, deviceTier, method: 'sandbox' };
    } catch (e) {
      // Fall back to inline computation
      // Continue to inline path below
    }
  }

  try {
    const units = state?.units || [];
    const seedStr = String(state?.sessionId || 'seed');
    let seed = 0; for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
    function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xffff) / 0xffff; }
    let scoreA = 0, scoreB = 0;
    for (const u of units) {
      const atk = Number(u?.attack) || 0;
      const def = Number(u?.defense) || 0;
      const power = (atk + def) * (1 + rand() * 0.05);
      if (u.team === 'A') scoreA += power; else scoreB += power;
    }
    const winner = scoreA === scoreB ? 'draw' : (scoreA > scoreB ? 'A' : 'B');
    return { simulated: true, winner, scoreA: Math.round(scoreA), scoreB: Math.round(scoreB), deviceTier, method: useSandbox ? 'fallback-inline' : 'inline' };
  } catch (e) {
    return { simulated: false, error: e.message };
  }
}

// Fallback wrapper: try local; if not simulated, instruct caller to call server API.
export async function runMatchWithFallback(state) {
  const local = await simulateMatchLocally(state);
  if (local.simulated) return local;
  return { simulated: false, action: 'call_server', local };
}
