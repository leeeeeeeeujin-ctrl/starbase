const MAX_EVENTS = 200;

const events = [];
const listeners = new Set();

function cloneEvents() {
  return events.map(event => ({ ...event }));
}

function notify() {
  const snapshot = cloneEvents();
  listeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch (error) {
      // Swallow listener errors to keep the collector resilient
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[DebugCollector] listener error', error);
      }
    }
  });
}

export function addDebugEvent(entry = {}) {
  const timestamp = entry.timestamp || new Date().toISOString();
  const event = {
    id: entry.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    level: entry.level || entry.severity || 'info',
    source: entry.source || 'unknown',
    message: entry.message || '',
    details: entry.details || null,
    payload: entry.payload || null,
    timestamp,
    meta: entry.meta || null,
  };

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  notify();
  return event;
}

export function clearDebugEvents() {
  events.splice(0, events.length);
  notify();
}

export function getDebugEvents() {
  return cloneEvents();
}

export function subscribeDebugEvents(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  try {
    listener(cloneEvents());
  } catch (error) {
    // Ignore initial delivery errors
  }
  return () => {
    listeners.delete(listener);
  };
}

export function addSupabaseDebugEvent(context) {
  if (!context) return null;
  const {
    error,
    source = 'supabase',
    operation = 'unknown',
    level = 'warn',
    message,
    details,
    hint,
    status,
    payload,
  } = context;

  const baseMessage =
    message || error?.message || error?.code || error?.hint || 'Supabase operation failed';

  return addDebugEvent({
    level,
    source,
    message: `[${operation}] ${baseMessage}`.trim(),
    details: {
      code: error?.code || null,
      message: error?.message || null,
      details: error?.details || details || null,
      hint: error?.hint || hint || null,
      status: status ?? error?.status ?? null,
    },
    payload: payload || null,
    meta: {
      operation,
      source,
    },
  });
}

export function addClientErrorDebugEvent(message, context = {}) {
  return addDebugEvent({
    level: context.level || 'error',
    source: context.source || 'client-error',
    message,
    details: context.details || null,
    payload: context.payload || null,
    meta: context.meta || null,
  });
}
