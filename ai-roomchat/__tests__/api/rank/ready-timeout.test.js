const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
} = require('../testUtils');

let mockCreateClientImplementation;
let mockWithTableQuery;
let roomQueryResponse;
let rosterQueryResponse;

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mockCreateClientImplementation(...args),
}));

jest.mock('@/lib/supabaseTables', () => ({
  withTableQuery: (...args) => mockWithTableQuery(...args),
}));

function loadHandler() {
  return loadApiRoute('rank', 'ready-timeout');
}

describe('POST /api/rank/ready-timeout', () => {
  let getUserMock;
  let rpcMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    getUserMock = jest.fn().mockResolvedValue({ data: { user: { id: 'host-1' } }, error: null });
    mockCreateClientImplementation = jest.fn((urlArg, keyArg, options = {}) => {
      const authHeader = options?.global?.headers?.Authorization;
      if (authHeader === `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`) {
        return {
          auth: { getUser: getUserMock },
        };
      }
      throw new Error(`Unexpected Authorization header: ${authHeader}`);
    });

    rpcMock = jest.fn(async fnName => {
      if (fnName === 'fetch_rank_async_standin_pool') {
        return {
          data: [
            {
              owner_id: 'candidate-1',
              hero_id: 'hero-standin',
              hero_name: 'AI Stand-in',
              role: '딜러',
              score: 1520,
              rating: 1710,
              battles: 40,
              win_rate: 52.4,
              status: 'active',
              updated_at: '2025-01-01T00:00:00Z',
              score_gap: 10,
              rating_gap: 15,
            },
          ],
          error: null,
        };
      }
      if (fnName === 'sync_rank_match_roster') {
        return { data: [], error: null };
      }
      throw new Error(`Unexpected RPC call: ${fnName}`);
    });

    registerSupabaseAdminMock(jest.fn(), rpcMock);

    const rosterRows = [
      {
        match_instance_id: 'match-1',
        room_id: 'room-1',
        game_id: 'game-1',
        slot_index: 0,
        slot_id: 'slot-0',
        role: '탱커',
        owner_id: 'player-1',
        hero_id: 'hero-1',
        hero_name: 'Tank Hero',
        ready: true,
        joined_at: '2025-01-01T00:00:00Z',
        score: 1480,
        rating: 1680,
        battles: 55,
        win_rate: 53.2,
        status: 'active',
        standin: false,
        match_source: 'queue',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        slot_template_version: 100,
        slot_template_source: 'room-stage',
        slot_template_updated_at: '2025-01-01T00:00:00Z',
      },
      {
        match_instance_id: 'match-1',
        room_id: 'room-1',
        game_id: 'game-1',
        slot_index: 1,
        slot_id: 'slot-1',
        role: '딜러',
        owner_id: 'player-2',
        hero_id: 'hero-2',
        hero_name: 'Damage Hero',
        ready: false,
        joined_at: '2025-01-01T00:00:00Z',
        score: 1500,
        rating: 1690,
        battles: 35,
        win_rate: 50.1,
        status: 'active',
        standin: false,
        match_source: 'queue',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        slot_template_version: 100,
        slot_template_source: 'room-stage',
        slot_template_updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    roomQueryResponse = { data: { owner_id: 'host-1' }, error: null };
    rosterQueryResponse = { data: rosterRows, error: null };

    mockWithTableQuery = jest.fn(async (_client, logicalName) => {
      if (logicalName === 'rank_rooms') {
        return roomQueryResponse;
      }
      if (logicalName === 'rank_match_roster') {
        return rosterQueryResponse;
      }
      return { data: null, error: null };
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('requires authorization', async () => {
    const handler = loadHandler();
    const req = createApiRequest({ method: 'POST' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('skips updates when no owners are missing', async () => {
    const handler = loadHandler();
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer session-token' },
      body: {
        match_instance_id: 'match-1',
        game_id: 'game-1',
        room_id: 'room-1',
        missing_owner_ids: [],
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      updated: false,
      assignments: [],
      message: 'no_missing_owners',
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('replaces unready owners with stand-in candidates', async () => {
    const handler = loadHandler();
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer session-token' },
      body: {
        match_instance_id: 'match-1',
        game_id: 'game-1',
        room_id: 'room-1',
        missing_owner_ids: ['player-2'],
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      updated: true,
      assignments: [{ slotIndex: 1, ownerId: 'candidate-1' }],
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'fetch_rank_async_standin_pool',
      expect.objectContaining({ p_game_id: 'game-1' })
    );
    expect(rpcMock).toHaveBeenCalledWith(
      'sync_rank_match_roster',
      expect.objectContaining({ p_match_instance_id: 'match-1', p_request_owner_id: 'host-1' })
    );
  });

  it('returns 404 when the room owner cannot be resolved', async () => {
    const handler = loadHandler();
    roomQueryResponse = { data: null, error: null };

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer session-token' },
      body: {
        match_instance_id: 'match-1',
        game_id: 'game-1',
        room_id: 'room-1',
        missing_owner_ids: ['player-2'],
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'room_not_found' });
    expect(rpcMock).not.toHaveBeenCalledWith('sync_rank_match_roster', expect.anything());
  });
});
