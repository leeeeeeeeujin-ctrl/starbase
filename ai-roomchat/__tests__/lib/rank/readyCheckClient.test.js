import { requestMatchReadySignal } from '@/lib/rank/readyCheckClient';
import { supabase } from '@/lib/supabase';

const originalFetch = global.fetch;
const originalGetSession = supabase.auth.getSession;

describe('requestMatchReadySignal', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{"readyCheck":null}'),
      })
    );
    supabase.auth.getSession = jest.fn(() =>
      Promise.resolve({
        data: { session: { access_token: 'token-from-session' } },
        error: null,
      })
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
    supabase.auth.getSession = originalGetSession;
  });

  it('sends the provided token as Authorization header', async () => {
    await requestMatchReadySignal({
      sessionId: 'session-1',
      gameId: 'game-1',
      token: ' explicit-token ',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/rank/ready-check',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer explicit-token',
        }),
      })
    );
  });

  it('resolves the token from supabase session when not provided', async () => {
    await requestMatchReadySignal({ sessionId: 'session-1', gameId: 'game-1' });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/rank/ready-check',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-from-session',
        }),
      })
    );
  });

  it('throws when no access token is available', async () => {
    supabase.auth.getSession = jest.fn(() =>
      Promise.resolve({
        data: { session: null },
        error: null,
      })
    );

    await expect(
      requestMatchReadySignal({ sessionId: 'session-1', gameId: 'game-1' })
    ).rejects.toMatchObject({
      message: 'missing_access_token',
      payload: { error: 'missing_access_token' },
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
