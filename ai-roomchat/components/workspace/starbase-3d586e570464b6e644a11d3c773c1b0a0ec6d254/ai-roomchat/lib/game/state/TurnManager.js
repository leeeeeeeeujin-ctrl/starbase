// Minimal turn manager and finite-state helper for turn-based games.

export function createTurnManager(players = []) {
  let idx = 0;
  const subs = new Set();
  const api = {
    current() { return players[idx] || null; },
    order() { return players.slice(); },
    setOrder(arr) { players = arr.slice(); idx = 0; api._emit('order', players); },
    next() { idx = players.length ? (idx + 1) % players.length : 0; api._emit('turn', api.current()); return api.current(); },
    on(event, fn) { subs.add({ event, fn }); return () => subs.forEach(s => (s === fn ? subs.delete(s) : 0)); },
    _emit(event, payload) { subs.forEach(s => { if (s.event === event) s.fn(payload); }); },
    snapshot() { return { players: players.slice(), idx }; },
    apply({ players: p, idx: i }) { players = p.slice(); idx = i|0; api._emit('sync', api.current()); },
  };
  return api;
}

export function createFSM(initial, transitions) {
  // transitions: { [state]: { [event]: (ctx) => nextState } }
  let state = initial;
  const subs = new Set();
  return {
    state: () => state,
    send(event, ctx) {
      const table = transitions[state];
      const fn = table && table[event];
      if (!fn) return state;
      const next = fn(ctx);
      if (next && next !== state) { state = next; subs.forEach((f) => f(state)); }
      return state;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

