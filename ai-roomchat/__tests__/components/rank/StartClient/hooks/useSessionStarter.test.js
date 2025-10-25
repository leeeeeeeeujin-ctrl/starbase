/**
 * @jest-environment jsdom
 */

import { act, create } from 'react-test-renderer';

jest.mock('../../../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: { access_token: 'tok' } }, error: null })),
    },
  },
}));

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

import useSessionStarter from '../../../../../components/rank/StartClient/hooks/useSessionStarter';

describe('useSessionStarter', () => {
  beforeEach(() => {
    if (window.sessionStorage) window.sessionStorage.clear();
    if (window.localStorage) window.localStorage.clear();
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, session: { id: 's1', status: 'active' } }) })
    );
  });

  it('starts session and boots local session on success', async () => {
    const setStartingSession = jest.fn();
    const setStatusMessage = jest.fn();
    const setSessionInfo = jest.fn();
    const bootLocalSession = jest.fn();
    const reconcileParticipantsForGame = jest.fn(() => ({ participants: [{ id: 'p1' }], removed: [] }));
    const formatPreflightSummary = jest.fn();

    const hook = renderHook(() =>
      useSessionStarter({
        graphNodes: [{ id: 'n1' }],
        startingSession: false,
        gameId: 'game-1',
        effectiveApiKey: null,
        ensureApiKeyReady: () => true,
        persistApiKeyOnServer: async () => {},
        apiVersion: 'openai',
        normalizedGeminiMode: null,
        normalizedGeminiModel: null,
        setStartingSession,
        setStatusMessage,
  supabase: require('../../../../../lib/supabase').supabase,
        viewerParticipantRole: null,
        realtimeEnabled: false,
        participants: [{ id: 'p1' }],
        slotLayout: [],
        matchingMetadata: null,
        setPromptMetaWarning: jest.fn(),
        bootLocalSession,
        reconcileParticipantsForGame,
        formatPreflightSummary,
        setSessionInfo,
      })
    );

    await act(async () => {
      await hook.result();
    });

    expect(setStartingSession).toHaveBeenCalled();
    expect(setSessionInfo).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    expect(bootLocalSession).toHaveBeenCalledWith([{ id: 'p1' }]);
  });

  it('reports error when API returns not ok', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'fail' }) }));
    const setStartingSession = jest.fn();
    const setStatusMessage = jest.fn();
    const setSessionInfo = jest.fn();
    const bootLocalSession = jest.fn();

    const hook = renderHook(() =>
      useSessionStarter({
        graphNodes: [{ id: 'n1' }],
        startingSession: false,
        gameId: 'game-1',
        effectiveApiKey: null,
        ensureApiKeyReady: () => true,
        persistApiKeyOnServer: async () => {},
        apiVersion: 'openai',
        normalizedGeminiMode: null,
        normalizedGeminiModel: null,
        setStartingSession,
        setStatusMessage,
  supabase: require('../../../../../lib/supabase').supabase,
        viewerParticipantRole: null,
        realtimeEnabled: false,
        participants: [{ id: 'p1' }],
        slotLayout: [],
        matchingMetadata: null,
        setPromptMetaWarning: jest.fn(),
        bootLocalSession,
        reconcileParticipantsForGame: () => ({ participants: [{ id: 'p1' }], removed: [] }),
        formatPreflightSummary: jest.fn(),
        setSessionInfo,
      })
    );

    await act(async () => {
      await hook.result();
    });

    expect(setStartingSession).toHaveBeenCalled();
    expect(setSessionInfo).not.toHaveBeenCalled();
    expect(bootLocalSession).not.toHaveBeenCalled();
    expect(setStatusMessage).toHaveBeenCalledWith(expect.any(String));
  });
});
