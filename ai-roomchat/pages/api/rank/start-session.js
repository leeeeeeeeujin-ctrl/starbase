import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withTableQuery } from '@/lib/supabaseTables';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// If a rank session stays "active" for longer than this without being updated,
// treat it as stale and start a fresh session instead of reusing it.
// This enforces "one recent game per user per game" while allowing old
// stuck sessions to be ignored.
const STALE_SESSION_THRESHOLD_MINUTES = 60;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for start-session API');
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
});

function buildSessionSummary({ mode, role, matchCode, turnTimer, createdAt }) {
  const lines = ['랭크 세션이 시작되었습니다.'];

  if (typeof mode === 'string' && mode.trim()) {
    lines.push(`모드: ${mode.trim()}`);
  }

  if (typeof role === 'string' && role.trim()) {
    lines.push(`담당 역할: ${role.trim()}`);
  }

  if (typeof matchCode === 'string' && matchCode.trim()) {
    lines.push(`매치 코드: ${matchCode.trim()}`);
  }

  const numericTimer = Number(turnTimer);
  if (Number.isFinite(numericTimer) && numericTimer > 0) {
    lines.push(`턴 제한: ${numericTimer}초`);
  }

  if (createdAt) {
    lines.push(`시작 시각: ${createdAt}`);
  }

  return lines.join('\n');
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
  const user = userData?.user || null;
  if (userError || !user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
  }

  const { game_id, mode, role, match_code, turn_timer, session_policy } = payload || {};

  if (!game_id) {
    return res.status(400).json({ error: 'missing_game_id' });
  }

  const ownerId = user.id;
  const now = new Date().toISOString();

  const sessionPolicy =
    typeof session_policy === 'string' && session_policy.trim()
      ? session_policy.trim()
      : '';
  const forceNewSession = sessionPolicy === 'new_per_match';

  const { data: participant, error: participantError } = await withTableQuery(
    supabaseAdmin,
    'rank_participants',
    async from => {
      const qRes = await from
        .select('id, status, role, hero_id')
        .eq('game_id', game_id)
        .eq('owner_id', ownerId)
        .limit(1);
      return {
        data: Array.isArray(qRes.data) ? qRes.data[0] || null : qRes.data,
        error: qRes.error,
      };
    }
  );

  if (participantError) {
    return res.status(400).json({ error: participantError.message });
  }

  if (!participant || !participant.hero_id) {
    return res.status(403).json({ error: 'participant_not_found' });
  }

  if (participant.status && participant.status === 'out') {
    return res.status(409).json({ error: 'participant_inactive' });
  }

  const { data: existingSession, error: existingError } = await withTableQuery(
    supabaseAdmin,
    'rank_sessions',
    async from => {
      const qRes = await from
        .select('id, status, created_at, updated_at')
        .eq('game_id', game_id)
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(1);
      return {
        data: Array.isArray(qRes.data) ? qRes.data[0] || null : qRes.data,
        error: qRes.error,
      };
    }
  );

  if (existingError) {
    return res.status(400).json({ error: existingError.message });
  }

  let session = existingSession || null;
  let created = false;

  // Determine whether an existing "active" session is still recent enough
  // to be reused. If it's too old, we treat it as stale and create a new one.
  let reuseExisting = false;
  if (!forceNewSession && session && session.status === 'active') {
    const thresholdMs = STALE_SESSION_THRESHOLD_MINUTES * 60 * 1000;
    const updatedAtRaw = session.updated_at || session.created_at;
    const updatedAtMs = updatedAtRaw ? Date.parse(updatedAtRaw) : NaN;
    if (Number.isFinite(updatedAtMs)) {
      const ageMs = Date.now() - updatedAtMs;
      if (ageMs <= thresholdMs) {
        reuseExisting = true;
      }
    }
  }

  if (!session || !reuseExisting) {
    // If there was a stale "active" session, mark it aborted so it no longer
    // participates in future lookups or analytics as a live game.
    if (session && session.status === 'active' && !reuseExisting) {
      await withTableQuery(supabaseAdmin, 'rank_sessions', from =>
        from
          .update({ status: 'aborted', updated_at: now })
          .eq('id', session.id)
      );
    }

    const { data: inserted, error: insertError } = await withTableQuery(
      supabaseAdmin,
      'rank_sessions',
      async from => {
        const insertResultOrChain = from.insert({
          game_id,
          owner_id: ownerId,
          status: 'active',
          turn: 0,
          created_at: now,
          updated_at: now,
        });

        let qRes;
        // Some mocks return a Promise directly from insert(...). Other clients
        // (real supabase) return a chain allowing .select(...).limit(...).
        if (insertResultOrChain && typeof insertResultOrChain.then === 'function') {
          qRes = await insertResultOrChain;
        } else if (insertResultOrChain && typeof insertResultOrChain.select === 'function') {
          qRes = await insertResultOrChain.select('id, status, created_at').limit(1);
        } else {
          qRes = { data: null, error: null };
        }

        return {
          data: Array.isArray(qRes.data) ? qRes.data[0] || null : qRes.data,
          error: qRes.error,
        };
      }
    );

    if (insertError) {
      return res.status(400).json({ error: insertError.message });
    }

    session = inserted;
    created = true;
  } else {
    const { error: touchError } = await withTableQuery(supabaseAdmin, 'rank_sessions', from =>
      from.update({ updated_at: now }).eq('id', session.id)
    );
    if (touchError) {
      return res.status(400).json({ error: touchError.message });
    }
  }

  if (created) {
    const summary = buildSessionSummary({
      mode,
      role: role || participant.role,
      matchCode: match_code,
      turnTimer: turn_timer,
      createdAt: session.created_at || now,
    });

    const { error: turnError } = await withTableQuery(supabaseAdmin, 'rank_turns', from =>
      from.insert({
        session_id: session.id,
        idx: 0,
        role: 'system',
        public: true,
        content: summary,
        created_at: now,
      })
    );

    if (turnError) {
      return res.status(400).json({ error: turnError.message });
    }
  }

  return res.status(200).json({
    ok: true,
    session: {
      id: session.id,
      status: session.status,
      created_at: session.created_at,
      reused: !created,
      turn_timer:
        Number.isFinite(Number(turn_timer)) && Number(turn_timer) > 0 ? Number(turn_timer) : null,
    },
  });
}
