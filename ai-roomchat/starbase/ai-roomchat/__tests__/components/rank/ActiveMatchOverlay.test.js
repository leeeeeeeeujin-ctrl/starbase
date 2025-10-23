/**
 * @jest-environment jsdom
 */

import { act, create } from 'react-test-renderer';

const mockReadActiveSession = jest.fn();
const mockSubscribeActiveSession = jest.fn(() => () => {});
const mockClearActiveSessionRecord = jest.fn();

jest.mock('../../../lib/rank/activeSessionStorage', () => ({
  readActiveSession: (...args) => mockReadActiveSession(...args),
  subscribeActiveSession: (...args) => mockSubscribeActiveSession(...args),
  clearActiveSessionRecord: (...args) => mockClearActiveSessionRecord(...args),
}));

const mockWithTable = jest.fn();

jest.mock('../../../lib/supabaseTables', () => ({
  withTable: (...args) => mockWithTable(...args),
}));

const mockFetchLatestSessionRow = jest.fn();

jest.mock('../../../modules/rank/matchRealtimeSync', () => ({
  fetchLatestSessionRow: (...args) => mockFetchLatestSessionRow(...args),
}));

const mockGetUser = jest.fn();

const mockSessionQuery = {
  select: jest.fn(function select() {
    return mockSessionQuery;
  }),
  eq: jest.fn(function eq() {
    return mockSessionQuery;
  }),
  order: jest.fn(function order() {
    return mockSessionQuery;
  }),
  limit: jest.fn(function limit() {
    return mockSessionQuery;
  }),
  maybeSingle: jest.fn(),
};

const mockFrom = jest.fn(() => mockSessionQuery);

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args) => mockGetUser(...args),
    },
    from: (...args) => mockFrom(...args),
  },
}));

jest.mock('next/router', () => ({
  useRouter: () => ({
    asPath: '/',
    push: jest.fn(),
  }),
}));

import ActiveMatchOverlay from '../../../components/rank/ActiveMatchOverlay';

describe('ActiveMatchOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockReadActiveSession.mockReturnValue({
      gameId: 'game-1',
      href: '/rank/game-1/start',
      status: 'active',
      sessionId: 'session-1',
      actorNames: ['Alice'],
      turn: 3,
    });

    mockFetchLatestSessionRow.mockResolvedValue({
      id: 'session-1',
      status: 'active',
      owner_id: 'user-1',
      game_id: 'game-1',
    });

    mockWithTable.mockImplementation(async (_client, logicalName) => {
      if (logicalName === 'rank_games') {
        return { data: { id: 'game-1' }, error: null };
      }
      if (logicalName === 'rank_participants') {
        return {
          data: { id: 'participant-1', status: 'active', hero_id: 'hero-1' },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    mockSessionQuery.select.mockClear();
    mockSessionQuery.eq.mockClear();
    mockSessionQuery.order.mockClear();
    mockSessionQuery.limit.mockClear();
    mockSessionQuery.maybeSingle.mockImplementation(() =>
      Promise.resolve({
        data: { id: 'session-1', status: 'active', owner_id: 'user-1', game_id: 'game-1' },
        error: null,
      })
    );
    mockFrom.mockClear();
  });

  it('renders overlay when the active session is still valid', async () => {
    let renderer;
    await act(async () => {
      renderer = create(<ActiveMatchOverlay />);
    });

    // Force re-render to apply useEffect state changes
    await act(async () => {
      renderer.update(<ActiveMatchOverlay />);
    });

    const tree = renderer.toJSON();
    expect(tree).not.toBeNull();
    expect(mockClearActiveSessionRecord).not.toHaveBeenCalled();
  });

  it('clears stale session storage when participant is missing', async () => {
    mockWithTable.mockImplementation(async (_client, logicalName) => {
      if (logicalName === 'rank_games') {
        return { data: { id: 'game-1' }, error: null };
      }
      if (logicalName === 'rank_participants') {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    let renderer;
    await act(async () => {
      renderer = create(<ActiveMatchOverlay />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const tree = renderer.toJSON();
    expect(tree).toBeNull();
    expect(mockClearActiveSessionRecord).toHaveBeenCalledWith('game-1');
  });
});
