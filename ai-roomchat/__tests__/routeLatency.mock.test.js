// Simulate latency budgets for critical route data loaders.
// We mock representative async functions and assert they finish under a threshold.

function mockFetchGameSummary() {
  return new Promise(resolve => setTimeout(() => resolve({ ok: true, turns: 42 }), 120));
}
function mockFetchSessionState() {
  return new Promise(resolve => setTimeout(() => resolve({ ok: true, participants: 10 }), 180));
}
function mockFetchLeaderboard() {
  return new Promise(resolve => setTimeout(() => resolve({ ok: true, entries: 25 }), 240));
}

async function time(fn) {
  const t0 = Date.now();
  const res = await fn();
  const t1 = Date.now();
  return { ms: t1 - t0, res };
}

describe('route latency budget (mock)', () => {
  const BUDGET_MS = 300; // soft budget per critical data load

  test('game summary under budget', async () => {
    const { ms, res } = await time(mockFetchGameSummary);
    expect(res.ok).toBe(true);
    expect(ms).toBeLessThanOrEqual(BUDGET_MS);
  });

  test('session state under budget', async () => {
    const { ms, res } = await time(mockFetchSessionState);
    expect(res.ok).toBe(true);
    expect(ms).toBeLessThanOrEqual(BUDGET_MS);
  });

  test('leaderboard under budget', async () => {
    const { ms, res } = await time(mockFetchLeaderboard);
    expect(res.ok).toBe(true);
    expect(ms).toBeLessThanOrEqual(BUDGET_MS);
  });
});
