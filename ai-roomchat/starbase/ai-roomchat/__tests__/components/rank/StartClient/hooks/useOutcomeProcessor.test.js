/**
 * @jest-environment jsdom
 */

import createOutcomeProcessor from '../../../../../components/rank/StartClient/hooks/useOutcomeProcessor';

describe('useOutcomeProcessor', () => {
  it('returns finalized:false and sets session outcome snapshot when ledger is missing', async () => {
    const setSessionOutcome = jest.fn();
    const buildOutcomeSnapshot = jest.fn(() => ({ snapshot: true }));

    const processor = createOutcomeProcessor({
      outcomeLedgerRef: { current: null },
      setSessionOutcome,
      buildOutcomeSnapshot,
    });

    const result = await processor({ responseText: 'no ledger' });
    expect(result.finalized).toBe(false);
    expect(setSessionOutcome).toHaveBeenCalledWith({ snapshot: true });
  });

  it('records ledger and finalizes when recordOutcomeLedger reports completion', async () => {
    const ledger = { entries: [] };
    const outcomeLedgerRef = { current: ledger };

    const recordOutcomeLedger = jest.fn(() => ({ changed: true, completed: true }));
    const buildOutcomeSnapshot = jest.fn(() => ({ snapshot: 'done' }));
    const setSessionOutcome = jest.fn();
    const finalizeRealtimeTurn = jest.fn();
    const captureBattleLog = jest.fn();
    const clearSessionRecord = jest.fn();
    const finalizeSessionRemotely = jest.fn(() => Promise.resolve());
    const sessionFinalizedRef = { current: false };

    const processor = createOutcomeProcessor({
      outcomeLedgerRef,
      recordOutcomeLedger,
      buildOutcomeSnapshot,
      setSessionOutcome,
      finalizeRealtimeTurn,
      captureBattleLog,
      clearSessionRecord,
      finalizeSessionRemotely,
      sessionFinalizedRef,
    });

    const result = await processor({ responseText: 'some response', turn: 5, sessionInfo: { id: 's1' }, gameId: 'g1' });
    expect(recordOutcomeLedger).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ turn: 5 }));
    expect(setSessionOutcome).toHaveBeenCalledWith({ snapshot: 'done' });
    expect(finalizeRealtimeTurn).toHaveBeenCalled();
    expect(captureBattleLog).toHaveBeenCalled();
    expect(clearSessionRecord).toHaveBeenCalled();
    expect(finalizeSessionRemotely).toHaveBeenCalledWith({ sessionInfo: { id: 's1' }, gameId: 'g1' });
    expect(sessionFinalizedRef.current).toBe(true);
    expect(result.finalized).toBe(true);
  });
});
