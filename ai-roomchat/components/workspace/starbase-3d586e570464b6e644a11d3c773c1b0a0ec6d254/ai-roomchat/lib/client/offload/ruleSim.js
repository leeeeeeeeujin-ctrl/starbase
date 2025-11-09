// Local rule/match simulation stub.
// Provide a simple deterministic computation to emulate server logic.
// In production replace with real WASM or JS port of server rules.

import { detectCapabilities } from '../capabilities/detect';
import { ensureSandbox, runRuleSimInSandbox } from '../sandbox/iframeSandbox';
import { runRuleSimInWorker } from '../sandbox/workerRunner';
import { recordRun, recordSkip } from './metrics';

const MAX_UNITS = 400; // heuristic guard
const MAX_EST_COST = 150000; // arbitrary compute budget units
function estimateCost(units) {
  const n = units.length;
  // O(n) with small constant; keep room for larger models later
  return n * 200 + 1000; // simple heuristic cost
}

export async function simulateMatchLocally(state, opts = {}) {
  const caps = await detectCapabilities();
  const deviceTier = caps.deviceTier;
  if (deviceTier === 'low') {
    recordSkip('low_tier');
    return { simulated: false, reason: 'low_tier' };
  }

  const units = Array.isArray(state?.units) ? state.units : [];
  if (units.length > MAX_UNITS) {
    recordSkip('unit_limit');
    return { simulated: false, reason: 'over_budget', units: units.length, maxUnits: MAX_UNITS };
  }
  const est = estimateCost(units);
  if (est > MAX_EST_COST) {
    recordSkip('est_cost');
    return { simulated: false, reason: 'over_budget', estimate: est, maxEstimate: MAX_EST_COST };
  }

  const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  // Prefer iframe sandbox for isolation if available
  const useSandbox = ensureSandbox();
  if (useSandbox) {
    try {
      const sandboxResult = await runRuleSimInSandbox(state, { timeout: opts.timeout || 1800 });
      const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const durationMs = Math.round(t1 - t0);
  recordRun({ method: 'sandbox', durationMs });
  return { ...sandboxResult, simulated: true, deviceTier, method: 'sandbox', durationMs };
    } catch (e) {
      // Try worker fallback before inline
      try {
        const workerResult = await runRuleSimInWorker(state, { timeout: opts.timeout || 1800 });
        const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const durationMs = Math.round(t1 - t0);
  recordRun({ method: 'worker', durationMs });
  return { ...workerResult, simulated: true, deviceTier, method: 'worker', durationMs };
      } catch (e2) {
        // continue to inline below
      }
    }
  }

  try {
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
    const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const method = useSandbox ? 'fallback-inline' : 'inline';
  const durationMs = Math.round(t1 - t0);
  recordRun({ method: method === 'fallback-inline' ? 'inline' : method, durationMs });
  return { simulated: true, winner, scoreA: Math.round(scoreA), scoreB: Math.round(scoreB), deviceTier, method, durationMs };
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
