import { createClient } from '@supabase/supabase-js';

import { createSupabaseAuthConfig, supabaseAdmin } from '@/lib/supabaseAdmin';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';
import { withTableQuery } from '@/lib/supabaseTables';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for sync-room-counters API');
}

const anonAuthConfig = createSupabaseAuthConfig(url, {
  apikey: anonKey,
  authorization: `Bearer ${anonKey}`,
});

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: { ...anonAuthConfig.headers },
    fetch: anonAuthConfig.fetch,
  },
});

function parseBody(req) {
  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (error) {
      return { error: 'invalid_payload' };
    }
  }
  if (!payload || typeof payload !== 'object') {
    return { error: 'invalid_payload' };
  }
  return { payload };
}

function toTrimmed(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toOptionalUuid(value) {
  const trimmed = toTrimmed(value);
  if (!trimmed) return null;
  return trimmed;
}

function normaliseNonNegativeInteger(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.floor(numeric));
}

function normaliseHostLimit(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(1, Math.floor(numeric));
}

function normaliseStatus(value) {
  const trimmed = toTrimmed(value);
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  const allowed = new Set([
    'open',
    'in_progress',
    'brawl',
    'battle',
    'ready',
    'preparing',
    'matchmaking',
  ]);
  return allowed.has(lowered) ? lowered : trimmed;
}

function formatRoomRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id ?? null,
    slot_count: row.slot_count ?? null,
    filled_count: row.filled_count ?? null,
    ready_count: row.ready_count ?? null,
    status: row.status ?? null,
    host_role_limit: row.host_role_limit ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function isServiceRoleAuthError(error) {
  if (!error) return false;
  const code = String(error.code || '')
    .trim()
    .toUpperCase();
  if (code === '401' || code === '403' || code === 'PGRST301') return true;
  const status = Number(error.status);
  if (status === 401 || status === 403) return true;
  const merged = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`
    .toLowerCase()
    .trim();
  if (!merged) return false;
  if (merged.includes('no api key')) return true;
  if (merged.includes('invalid api key')) return true;
  if (merged.includes('jwt') && merged.includes('unauthorized')) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  const userId = toOptionalUuid(userData?.user?.id);
  if (userError || !userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { payload, error } = parseBody(req);
  if (error) {
    return res.status(400).json({ error });
  }

  const roomId = toOptionalUuid(payload.room_id ?? payload.roomId);
  if (!roomId) {
    return res.status(400).json({ error: 'missing_room_id' });
  }

  const slotCount = normaliseNonNegativeInteger(payload.slot_count ?? payload.slotCount);
  const filledCount = normaliseNonNegativeInteger(payload.filled_count ?? payload.filledCount);
  const readyCount = normaliseNonNegativeInteger(payload.ready_count ?? payload.readyCount);
  const status = normaliseStatus(payload.status);
  const hostLimit = normaliseHostLimit(payload.host_role_limit ?? payload.hostRoleLimit);

  let roomRow = null;
  let roomError = null;
  try {
    const { data, error: lookupError } = await withTableQuery(supabaseAdmin, 'rank_rooms', from =>
      from.select('id, owner_id, host_user_id').eq('id', roomId).maybeSingle()
    );
    roomRow = data || null;
    roomError = lookupError || null;
  } catch (lookupException) {
    roomError = lookupException;
  }

  if (roomError) {
    console.error('[sync-room-counters] room lookup failed:', roomError);
    return res.status(400).json({ error: 'room_lookup_failed' });
  }

  if (!roomRow) {
    return res.status(404).json({ error: 'room_not_found' });
  }

  const ownerId = toOptionalUuid(roomRow.owner_id);
  const hostUserId = toOptionalUuid(roomRow.host_user_id);
  const authorized = ownerId === userId || hostUserId === userId;
  if (!authorized) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const rpcPayload = {
    p_room_id: roomId,
    p_owner_id: ownerId || hostUserId || userId,
    p_slot_count: slotCount,
    p_filled_count: filledCount,
    p_ready_count: readyCount,
    p_status: status,
    p_host_role_limit: hostLimit,
  };

  let rpcError = null;
  let rpcData = null;

  try {
    const { data, error: serviceError } = await supabaseAdmin.rpc(
      'update_rank_room_counters',
      rpcPayload
    );
    if (serviceError) {
      rpcError = serviceError;
    } else {
      rpcData = data || null;
    }
  } catch (serviceException) {
    rpcError = serviceException;
  }

  if (rpcError && isServiceRoleAuthError(rpcError)) {
    try {
      const userAuthConfig = createSupabaseAuthConfig(url, {
        apikey: anonKey,
        authorization: `Bearer ${token}`,
      });
      const userClient = createClient(url, anonKey, {
        auth: { persistSession: false },
        global: {
          headers: { ...userAuthConfig.headers },
          fetch: userAuthConfig.fetch,
        },
      });
      const { data, error: fallbackError } = await userClient.rpc(
        'update_rank_room_counters',
        rpcPayload
      );
      if (fallbackError) {
        rpcError = fallbackError;
      } else {
        rpcError = null;
        rpcData = data || null;
      }
    } catch (fallbackException) {
      rpcError = fallbackException;
    }
  }

  if (rpcError) {
    console.error('[sync-room-counters] update rpc failed:', rpcError);
    return res.status(500).json({ error: 'room_counter_sync_failed', supabaseError: rpcError });
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  return res.status(200).json({ room: formatRoomRow(row) });
}
