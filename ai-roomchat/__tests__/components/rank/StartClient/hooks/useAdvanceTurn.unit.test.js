/**
 * @jest-environment jsdom
 */

import { act, create } from 'react-test-renderer';

// Stub globals referenced at module-eval time in the hook file
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

describe('useAdvanceTurn (unit)', () => {
  it('preflight true -> early return and setStatusMessage called', async () => {
    const setStatusMessage = jest.fn();
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
      setters: { setStatusMessage },
    };

    const hook = renderHook(() => useAdvanceTurn(deps));
    expect(typeof hook.result).toBe('function');

    await act(async () => {
      await hook.result();
    });

    expect(setStatusMessage).toHaveBeenCalled();
  });

  it('missing currentNodeId -> status message set', async () => {
    const setStatusMessage = jest.fn();
    const deps = {
      preflight: false,
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
      setters: { setStatusMessage },
    };

    const hook = renderHook(() => useAdvanceTurn(deps));
    expect(typeof hook.result).toBe('function');

    await act(async () => {
      await hook.result();
    });

    expect(setStatusMessage).toHaveBeenCalledWith('진행 가능한 노드가 없습니다.');
  });
});
