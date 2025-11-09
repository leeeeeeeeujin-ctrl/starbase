// Simple in-memory mock game server for local testing (no external deps)
// NOTE: This is ephemeral; process restart resets everything.

const defaultTurn = () => ({
  idx: 0,
  role: 'system',
  content: 'ready',
  createdAt: new Date().toISOString(),
});

class MockGameServer {
  constructor() {
    this.games = new Map(); // gameId -> { id, createdAt, slots: [], turns: [], session: { id } }
  }

  createGame(gameId) {
    const id = String(gameId || Date.now());
    if (!this.games.has(id)) {
      this.games.set(id, {
        id,
        createdAt: new Date().toISOString(),
        slots: [],
        turns: [defaultTurn()],
        session: { id: `session-${id}` },
        updatedAt: Date.now(),
      });
    }
    return this.getSnapshot(id);
  }

  listGames() {
    return Array.from(this.games.values()).map(g => ({
      id: g.id,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
  }

  joinGame(gameId, { ownerId, heroId, role }) {
    const g = this.games.get(String(gameId));
    if (!g) throw new Error('game_not_found');
    const slotIndex = g.slots.length;
    g.slots.push({
      slotIndex,
      ownerId: String(ownerId || `owner-${slotIndex}`),
      heroId: String(heroId || ''),
      role: String(role || 'player'),
      ready: true,
    });
    g.updatedAt = Date.now();
    return this.getSnapshot(gameId);
  }

  addTurn(gameId, { role, content }) {
    const g = this.games.get(String(gameId));
    if (!g) throw new Error('game_not_found');
    const idx = g.turns.length;
    g.turns.push({
      idx,
      role: String(role || 'player'),
      content: String(content || ''),
      createdAt: new Date().toISOString(),
    });
    g.updatedAt = Date.now();
    return this.getSnapshot(gameId);
  }

  resetGame(gameId) {
    const id = String(gameId);
    if (!this.games.has(id)) return this.createGame(id);
    this.games.set(id, {
      id,
      createdAt: new Date().toISOString(),
      slots: [],
      turns: [defaultTurn()],
      session: { id: `session-${id}` },
      updatedAt: Date.now(),
    });
    return this.getSnapshot(id);
  }

  getSnapshot(gameId) {
    const g = this.games.get(String(gameId));
    if (!g) throw new Error('game_not_found');
    return {
      gameId: g.id,
      session: g.session,
      slots: g.slots,
      history: {
        sessionId: g.session.id,
        turns: g.turns,
        totalCount: g.turns.length,
        updatedAt: g.updatedAt,
      },
      updatedAt: g.updatedAt,
    };
  }
}

const singleton = new MockGameServer();
export function getMockGameServer() {
  return singleton;
}
