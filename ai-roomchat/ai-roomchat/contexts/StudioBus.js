const listeners = new Map();

export function subscribe(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => {
    try { listeners.get(event)?.delete(fn); } catch {}
  };
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of Array.from(set)) {
    try { fn(payload); } catch {}
  }
}

