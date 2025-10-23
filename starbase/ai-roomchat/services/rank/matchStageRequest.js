import { normalizeRoster } from './matchRoster';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pick(body, keys, fallback = undefined) {
  if (!body || typeof body !== 'object') return fallback;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return body[key];
    }
  }
  return fallback;
}

function asUuid(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return UUID_PATTERN.test(text) ? text : null;
}

function asBoolean(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (!lowered) return fallback;
    if (['true', '1', 'yes', 'y'].includes(lowered)) return true;
    if (['false', '0', 'no', 'n'].includes(lowered)) return false;
  }
  return fallback;
}

function asObject(value) {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value)) return {};
  return value;
}

function asJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch (error) {
    return null;
  }
}

function asTrimmedString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function asIsoTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildSlotTemplate(raw = {}) {
  const canonical = asObject(raw);
  const version = pick(canonical, ['version', 'slot_template_version', 'slotTemplateVersion']);
  const source = pick(canonical, ['source', 'slot_template_source', 'slotTemplateSource']);
  const updatedAt = pick(canonical, ['updated_at', 'updatedAt', 'slotTemplateUpdatedAt']);

  const normalized = {};
  if (Number.isFinite(Number(version))) {
    normalized.version = Math.trunc(Number(version));
  }
  const sourceText = asTrimmedString(source);
  if (sourceText) {
    normalized.source = sourceText;
  }
  const timestamp = asIsoTimestamp(updatedAt);
  if (timestamp) {
    normalized.updatedAt = timestamp;
  }
  return normalized;
}

export function extractBearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization || '';
  if (typeof header !== 'string') return null;
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function parseStageRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid_payload' };
  }

  const matchInstanceRaw = pick(body, ['match_instance_id', 'matchInstanceId']);
  const roomRaw = pick(body, ['room_id', 'roomId']);
  const gameRaw = pick(body, ['game_id', 'gameId']);

  const matchInstanceId = asUuid(matchInstanceRaw);
  if (!matchInstanceId) {
    return { ok: false, error: 'missing_match_instance_id' };
  }

  const roomId = asUuid(roomRaw);
  if (!roomId) {
    return { ok: false, error: 'missing_room_id' };
  }

  const gameId = asUuid(gameRaw);
  if (!gameId) {
    return { ok: false, error: 'missing_game_id' };
  }

  const rosterRaw = pick(body, ['roster', 'slots', 'slot_map'], []);
  const normalizedRoster = normalizeRoster(Array.isArray(rosterRaw) ? rosterRaw : []);
  if (!normalizedRoster.length) {
    return { ok: false, error: 'empty_roster' };
  }

  const heroMap = asObject(pick(body, ['hero_map', 'heroMap'], {}));
  const allowPartial = asBoolean(pick(body, ['allow_partial', 'allowPartial'], false));
  const asyncFillMeta = asJson(pick(body, ['async_fill_meta', 'asyncFillMeta']));
  const readyVote = asJson(pick(body, ['ready_vote', 'readyVote']));
  const matchMode = asTrimmedString(pick(body, ['match_mode', 'mode', 'matchMode']));
  const slotTemplateRaw = pick(body, ['slot_template', 'slotTemplate'], {});
  const verificationRoles = Array.isArray(slotTemplateRaw?.roles)
    ? slotTemplateRaw.roles
    : Array.isArray(pick(body, ['roles']))
      ? pick(body, ['roles'])
      : [];
  const verificationSlots = Array.isArray(slotTemplateRaw?.slots)
    ? slotTemplateRaw.slots
    : Array.isArray(slotTemplateRaw?.slot_map)
      ? slotTemplateRaw.slot_map
      : Array.isArray(pick(body, ['slots']))
        ? pick(body, ['slots'])
        : [];
  const slotTemplate = buildSlotTemplate(slotTemplateRaw);

  return {
    ok: true,
    value: {
      matchInstanceId,
      roomId,
      gameId,
      roster: normalizedRoster,
      heroMap,
      allowPartial,
      asyncFillMeta,
      readyVote,
      matchMode,
      slotTemplate,
      verificationRoles: Array.isArray(verificationRoles) ? verificationRoles : [],
      verificationSlots: Array.isArray(verificationSlots) ? verificationSlots : [],
    },
  };
}
