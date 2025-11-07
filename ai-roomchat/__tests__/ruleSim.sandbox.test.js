/**
 * Tests for sandbox-enhanced ruleSim offload.
 */

jest.mock('@/lib/client/capabilities/detect', () => ({
  detectCapabilities: jest.fn(async () => ({ deviceTier: 'high' }))
}));

jest.mock('@/lib/client/sandbox/iframeSandbox', () => ({
  ensureSandbox: jest.fn(() => true),
  runRuleSimInSandbox: jest.fn(async (state) => ({ simulated: true, winner: 'A', scoreA: 10, scoreB: 5 }))
}));
jest.mock('@/lib/client/sandbox/workerRunner', () => ({
  runRuleSimInWorker: jest.fn(async (state) => ({ simulated: true, winner: 'B', scoreA: 8, scoreB: 9 }))
}));

const { simulateMatchLocally, runMatchWithFallback } = require('../lib/client/offload/ruleSim.js');
const { detectCapabilities } = require('@/lib/client/capabilities/detect');
const { ensureSandbox, runRuleSimInSandbox } = require('@/lib/client/sandbox/iframeSandbox');
const { runRuleSimInWorker } = require('@/lib/client/sandbox/workerRunner');

function buildState() {
  return {
    sessionId: 'abc123',
    units: [
      { team: 'A', attack: 5, defense: 5 },
      { team: 'B', attack: 5, defense: 5 },
    ],
  };
}

describe('ruleSim sandbox offload', () => {
  test('uses sandbox when available', async () => {
    const state = buildState();
    const res = await simulateMatchLocally(state);
    expect(ensureSandbox).toHaveBeenCalled();
    expect(runRuleSimInSandbox).toHaveBeenCalled();
    expect(res.simulated).toBe(true);
    expect(res.method).toBe('sandbox');
    expect(res.winner).toBeDefined();
  });

  test('fallback inline when sandbox throws', async () => {
    runRuleSimInSandbox.mockImplementationOnce(async () => { throw new Error('boom'); });
    const state = buildState();
    const res = await simulateMatchLocally(state);
    // After adding worker fallback, it should choose worker before inline
    expect(runRuleSimInWorker).toHaveBeenCalled();
    expect(res.simulated).toBe(true);
    expect(['worker','fallback-inline']).toContain(res.method);
  });

  test('low tier skips simulation', async () => {
    detectCapabilities.mockImplementationOnce(async () => ({ deviceTier: 'low' }));
    const state = buildState();
    const res = await simulateMatchLocally(state);
    expect(res.simulated).toBe(false);
    expect(res.reason).toBe('low_tier');
  });

  test('runMatchWithFallback returns action when not simulated', async () => {
    detectCapabilities.mockImplementationOnce(async () => ({ deviceTier: 'low' }));
    const state = buildState();
    const res = await runMatchWithFallback(state);
    expect(res.simulated).toBe(false);
    expect(res.action).toBe('call_server');
  });

  test('over-budget skips simulation', async () => {
    // many units to trigger over-budget
    const big = buildState();
    big.units = new Array(1000).fill(0).map((_, i) => ({ team: i % 2 ? 'A' : 'B', attack: 1, defense: 1 }));
    const res = await simulateMatchLocally(big);
    expect(res.simulated).toBe(false);
    expect(res.reason).toBe('over_budget');
  });
});
