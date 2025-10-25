const DEFAULT_EVENT_TYPE = 'event';

export interface TimelineEventNormalized {
  id: string;
  type: string;
  ownerId: string | null;
  strike: number | null;
  remaining: number | null;
  limit: number | null;
  reason: string | null;
  status: string | null;
  turn: number | null;
  timestamp: number;
  context: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

function normalizeOwnerId(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

export function normalizeTimelineStatus(value: unknown): string | null {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;

  if (['defeated', 'lost', 'dead', 'eliminated', 'retired', '패배', '탈락'].includes(normalized)) {
    return 'defeated';
  }
  if (['spectator', 'spectating', 'observer', '관전'].includes(normalized)) {
    return 'spectating';
  }
  if (['proxy', 'stand-in', 'ai', 'bot', '대역'].includes(normalized)) {
    return 'proxy';
  }
  if (['active', 'playing', 'alive', '참여', 'in_battle'].includes(normalized)) {
    return 'active';
  }
  if (['pending', 'waiting', '대기'].includes(normalized)) {
    return 'pending';
  }
  return normalized;
}

function parseInteger(value: unknown): number | null {
  if (!Number.isFinite(Number(value))) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function sanitizeContext(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return null;
  }
}

interface NormalizeOptions {
  defaultTurn?: number | null;
  defaultType?: string;
}

export function normalizeTimelineEvent(
  event: unknown,
  { defaultTurn = null, defaultType = DEFAULT_EVENT_TYPE }: NormalizeOptions = {}
): TimelineEventNormalized | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as Record<string, unknown>;

  const rawType =
    typeof record.type === 'string'
      ? record.type.trim()
      : typeof record.eventType === 'string'
        ? record.eventType.trim()
        : typeof record.action === 'string'
          ? record.action.trim()
          : '';

  const type = rawType || defaultType;
  if (!type) return null;

  const ownerId =
    normalizeOwnerId(record.ownerId) ??
    normalizeOwnerId(record.owner_id) ??
    normalizeOwnerId(record.ownerID) ??
    (typeof record.owner === 'string' ? normalizeOwnerId(record.owner) : null);

  const strike = parseInteger(record.strike);
  const remaining = parseInteger(record.remaining);
  const limit = parseInteger(record.limit);
  const turn =
    parseInteger(record.turn) ??
    (Number.isFinite(Number(defaultTurn)) ? parseInteger(defaultTurn ?? null) : null);

  let timestamp = Number.isFinite(Number(record.timestamp))
    ? Number(record.timestamp)
    : Date.parse(String(record.timestamp ?? ''));
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    timestamp = Date.now();
  }

  const reason =
    typeof record.reason === 'string'
      ? record.reason
      : typeof record.reasonCode === 'string'
        ? record.reasonCode
        : null;

  const status = normalizeTimelineStatus(record.status);
  const context = sanitizeContext(record.context ?? record.meta ?? record.metadata);
  const metadata = sanitizeContext(record.metadata ?? record.meta ?? null);

  const baseId =
    (typeof record.id === 'string' && record.id.trim()) ||
    (typeof record.event_id === 'string' && record.event_id.trim()) ||
    (typeof record.eventId === 'string' && record.eventId.trim()) ||
    null;

  const fallbackId = `${type}:${ownerId ?? 'unknown'}:${turn ?? 'na'}:${timestamp}`;
  const id = baseId || fallbackId;

  return {
    id,
    type,
    ownerId,
    strike,
    remaining,
    limit,
    reason,
    status,
    turn,
    timestamp,
    context,
    metadata,
  };
}

function buildTimelineEventKey(event: TimelineEventNormalized): string {
  if (event.id) {
    return `id:${event.id}`;
  }
  const ownerId = event.ownerId ? String(event.ownerId) : 'unknown';
  const type = event.type || DEFAULT_EVENT_TYPE;
  const turn = event.turn != null ? event.turn : 'na';
  const timestamp = event.timestamp ?? 'ts';
  return `${type}:${ownerId}:${turn}:${timestamp}`;
}

export function sanitizeTimelineEvents(
  events: unknown[],
  options: NormalizeOptions = {}
): TimelineEventNormalized[] {
  const map = new Map<string, TimelineEventNormalized>();
  for (const candidate of Array.isArray(events) ? events : []) {
    const normalized = normalizeTimelineEvent(candidate, options);
    if (!normalized) continue;
    const key = buildTimelineEventKey(normalized);
    const existing = map.get(key);
    map.set(key, existing ? { ...existing, ...normalized } : normalized);
  }

  return Array.from(map.values()).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

interface EventRowOptions {
  sessionId?: string | null;
  gameId?: string | null;
}

export function mapTimelineEventToRow(
  event: unknown,
  { sessionId = null, gameId = null }: EventRowOptions = {}
): Record<string, unknown> | null {
  const normalized = normalizeTimelineEvent(event);
  if (!normalized) return null;

  const timestampIso = new Date(normalized.timestamp).toISOString();

  return {
    session_id: sessionId ?? (event as Record<string, unknown>)?.session_id ?? null,
    game_id: gameId ?? (event as Record<string, unknown>)?.game_id ?? null,
    event_id: normalized.id,
    event_type: normalized.type,
    owner_id: normalized.ownerId ?? null,
    reason: normalized.reason ?? null,
    strike: normalized.strike,
    remaining: normalized.remaining,
    limit: normalized.limit,
    status: normalized.status ?? null,
    turn: normalized.turn,
    event_timestamp: timestampIso,
    context: normalized.context ?? null,
    metadata: normalized.metadata ?? null,
  };
}
