const { describe, it, expect, beforeEach } = require('@jest/globals');

const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
  createSupabaseSelectChain,
  createSupabaseInsertChain,
} = require('../testUtils');

let mockCreateClientImplementation;

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mockCreateClientImplementation(...args),
}));

describe('E2E: matching -> realtime play -> finalize (channel-aware)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('flows start-session -> log-turn -> complete-session and forwards channel to RPC', async () => {
    // Prepare anon client getUser mock and user token handling
    const anonGetUser = jest
      .fn()
      .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    mockCreateClientImplementation = jest.fn((urlArg, keyArg, options = {}) => {
      const authHeader = options?.global?.headers?.Authorization;
      if (authHeader === `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`) {
        return { auth: { getUser: anonGetUser } };
      }
      // For service-role calls (supabaseAdmin), tests will provide rpc via registerSupabaseAdminMock
      return { rpc: jest.fn() };
    });

    // Prepare supabaseAdmin.from chains
    const participantSelect = createSupabaseSelectChain(
      Promise.resolve({
        data: { id: 'p-1', hero_id: 'hero-1', role: 'dealer', status: null },
        error: null,
      })
    );
    const sessionsSelect = createSupabaseSelectChain(Promise.resolve({ data: null, error: null }));
    const sessionsInsert = createSupabaseInsertChain(() =>
      Promise.resolve({
        data: { id: 'session-1', status: 'active', created_at: '2025-01-01T00:00:00Z' },
        error: null,
      })
    );
    const turnsInsert = createSupabaseInsertChain(() =>
      Promise.resolve({ data: [{ id: 'turn-1', idx: 0, role: 'system' }], error: null })
    );

    // role config select for complete-session
    const roleConfigChain = createSupabaseSelectChain(Promise.resolve({ data: [], error: null }));

    // last turn select (for log-turn) return no rows -> startIdx 0
    const lastTurnChain = createSupabaseSelectChain(Promise.resolve({ data: null, error: null }));

    // RPC mock to capture finalize_rank_session_outcome call
    const rpcMock = jest.fn(async (fnName, payload) => {
      if (fnName === 'finalize_rank_session_outcome') {
        // expect p_outcomes to include our channel value
        expect(Array.isArray(payload.p_outcomes)).toBe(true);
        const found = payload.p_outcomes.some(e => e.channel === 'chat');
        expect(found).toBe(true);
        return { data: { ok: true }, error: null };
      }
      return { data: null, error: null };
    });

    registerSupabaseAdminMock(tableName => {
      if (tableName === 'rank_participants') return participantSelect.fromMock();
      if (tableName === 'rank_sessions') return sessionsInsert.fromMock();
      if (tableName === 'rank_turns') return turnsInsert.fromMock();
      if (tableName === 'rank_game_roles') return roleConfigChain.fromMock();
      if (tableName === 'rank_turns_last') return lastTurnChain.fromMock();
      // fallback
      return {
        select: jest.fn(() => ({
          maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      };
    }, rpcMock);

    // 1) start-session
    const startHandler = loadApiRoute('rank', 'start-session');
    const startReq = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer user-token' },
      body: { game_id: 'game-1', mode: 'realtime' },
    });
    const startRes = createMockResponse();
    await startHandler(startReq, startRes);
    // Debug: 출력하여 start-session이 왜 400을 반환하는지 확인
    // (테스트 전용 로그 — 추후 제거 가능)
     
    console.error('DEBUG start-session response:', startRes.statusCode, startRes.body);
    expect(startRes.statusCode).toBe(200);
    expect(startRes.body.ok).toBe(true);
    const sessionId = startRes.body.session.id;
    expect(sessionId).toBe('session-1');

    // 2) log-turn (simulate a client posting entries; normalized by server)
    const logHandler = loadApiRoute('rank', 'log-turn');
    const logReq = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer user-token' },
      body: {
        session_id: sessionId,
        game_id: 'game-1',
        entries: [
          { role: 'user', content: 'Hello', public: true, channel: 'chat' },
          { role: 'assistant', content: 'Reply', public: true, channel: 'chat' },
        ],
      },
    });
    const logRes = createMockResponse();
    await logHandler(logReq, logRes);
    expect(logRes.statusCode).toBe(200);

    // 3) complete-session: send outcome including channel
    const completeHandler = loadApiRoute('rank', 'complete-session');
    const completeReq = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer user-token' },
      body: {
        sessionId: sessionId,
        gameId: 'game-1',
        outcome: {
          entries: [{ key: 'p-1', participant_id: 'p-1', result: 'won', channel: 'chat' }],
          roleSummaries: [],
          overallResult: 'won',
        },
        reason: 'test',
      },
    });
    const completeRes = createMockResponse();
    await completeHandler(completeReq, completeRes);
    expect(completeRes.statusCode).toBe(200);
    expect(rpcMock).toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith('finalize_rank_session_outcome', expect.any(Object));
  });
});
