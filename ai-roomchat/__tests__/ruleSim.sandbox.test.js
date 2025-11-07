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

const { simulateMatchLocally, runMatchWithFallback } = require('../lib/client/offload/ruleSim.js');
const { detectCapabilities } = require('@/lib/client/capabilities/detect');
const { ensureSandbox, runRuleSimInSandbox } = require('@/lib/client/sandbox/iframeSandbox');

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
    expect(res.simulated).toBe(true);
    expect(res.method).toBe('fallback-inline');
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
});
