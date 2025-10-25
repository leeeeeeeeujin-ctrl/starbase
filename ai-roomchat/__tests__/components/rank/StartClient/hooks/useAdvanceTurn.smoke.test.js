/**
 * @jest-environment jsdom
 */

import { act, create } from 'react-test-renderer';

// Some variables are referenced by the hook file at module-eval time in a way
// that expects them to be present in the global scope. Provide a safe stub so
// the hook can be mounted in tests without executing full runtime behavior.
global.applyRealtimeSnapshot = jest.fn();
global.recordTurnState = jest.fn();
const useAdvanceTurn = require('../../../../../components/rank/StartClient/hooks/useAdvanceTurn').default;

function renderHook(callback, props) {
  let result;
  const Test = hookProps => {
    result = callback(hookProps);
    return null;
  };
  const renderer = create(<Test {...props} />);
  return {
    get result() {
      return result;
    },
    rerender: nextProps => {
      act(() => {
        renderer.update(<Test {...nextProps} />);
      });
    },
    unmount: () => {
      renderer.unmount();
    },
  };
}

describe('useAdvanceTurn (smoke)', () => {
  it('returns a callable function and respects preflight early return', async () => {
    const setStatusMessage = jest.fn();
    const setters = {
      setActiveGlobal: jest.fn(),
      setActiveLocal: jest.fn(),
      setCurrentNodeId: jest.fn(),
      setIsAdvancing: jest.fn(),
      setLogs: jest.fn(),
      setStatusMessage,
      setTimeRemaining: jest.fn(),
      setTurn: jest.fn(),
      setTurnDeadline: jest.fn(),
      setWinCount: jest.fn(),
    };

    const deps = {
      preflight: true,
      currentNodeId: null,
      graph: { nodes: [], edges: [] },
      slots: [],
      history: { joinedText: () => '' },
      aiMemory: null,
      activeGlobal: [],
      activeLocal: [],
      manualResponse: '',
      effectiveApiKey: null,
      apiVersion: 'gemini',
      systemPrompt: '',
      turn: 0,
      participants: [],
      participantsStatus: [],
      ownerDisplayMap: new Map(),
      realtimeEnabled: false,
      brawlEnabled: false,
      winCount: 0,
      lastDropInTurn: 0,
      viewerId: null,
      gameId: 'g1',
      sessionInfo: null,
      voidSession: jest.fn(),
      gameVoided: false,
      ensureApiKeyReady: () => true,
      persistApiKeyOnServer: async () => {},
      normalizedGeminiMode: null,
      normalizedGeminiModel: null,
      updateHeroAssets: jest.fn(),
      logTurnEntries: jest.fn(),
      captureBattleLog: jest.fn(),
      clearSessionRecord: jest.fn(),
      finalizeSessionRemotely: jest.fn(),
      patchEngineState: jest.fn(),
      markSessionDefeated: jest.fn(),
      realtimeManagerRef: { current: null },
      recordOutcomeLedger: jest.fn(),
      outcomeLedgerRef: { current: null },
      buildOutcomeSnapshot: jest.fn(),
      statusMessageRef: { current: '' },
      isApiKeyError: () => false,
      applyRealtimeSnapshot: jest.fn(),
      recordTurnState: jest.fn(),
      setters,
    };

    const hook = renderHook(() => useAdvanceTurn(deps));
    expect(typeof hook.result).toBe('function');

    await act(async () => {
      await hook.result();
    });

    expect(setStatusMessage).toHaveBeenCalled();
  });
});
