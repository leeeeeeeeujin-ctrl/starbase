import { releaseStaleSlots } from '@/lib/rank/slotCleanup';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const SECRET = process.env.RANK_SLOT_SWEEPER_SECRET || '';

function extractBearerToken(value) {
  if (!value) return '';
  if (value.startsWith('Bearer ')) {
    return value.slice(7);
  }
  return value;
}

function readSingle(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.find(item => typeof item === 'string') || '';
  }
  return '';
}

function normalizeMinutes(value) {
  const numeric = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(numeric)) return undefined;
  if (numeric < 0) return 0;
  return numeric;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const payload = req.method === 'POST' ? req.body : req.query;
  let parsed = payload;

  if (req.method === 'POST' && typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload || '{}');
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
  }

  if (SECRET) {
    const headerToken = extractBearerToken(req.headers.authorization || '');
    const workerToken = extractBearerToken(req.headers['x-worker-secret'] || '');
    const queryToken = extractBearerToken(readSingle(parsed?.secret));
    const token = headerToken || workerToken || queryToken;

    if (!token || token !== SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const rawGameId = readSingle(parsed?.game_id);
  const gameId = rawGameId ? rawGameId.trim() : null;
  const olderThanMinutes = normalizeMinutes(parsed?.older_than_minutes);

  try {
    const result = await releaseStaleSlots(supabaseAdmin, {
      gameId: gameId || null,
      olderThanMinutes,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('slot-sweeper failed:', error);
    return res.status(500).json({
      error: 'slot_sweep_failed',
      detail: error?.message || 'failed to release stale slots',
    });
  }
}
