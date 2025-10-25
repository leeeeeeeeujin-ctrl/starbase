import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildTurnSummaryPayload } from '@/lib/rank/turnSummary';
import {
  broadcastRealtimeTimeline,
  notifyRealtimeTimelineWebhook,
} from '@/lib/rank/realtimeEventNotifications';
import { mapTimelineEventToRow, sanitizeTimelineEvents } from '@/lib/rank/timelineEvents';
import { withTableQuery } from '@/lib/supabaseTables';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for log-turn API');
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

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const normalized = [];
  entries.forEach(entry => {
    if (!entry) return;
    const rawRole = typeof entry.role === 'string' ? entry.role.trim() : '';
    const role = rawRole || 'narration';
    let content = '';
    if (typeof entry.content === 'string') {
      content = entry.content;
    } else if (entry.content != null) {
      try {
        content = JSON.stringify(entry.content);
      } catch (error) {
        content = String(entry.content);
      }
    }
    if (!content || !content.trim()) {
      return;
    }

    const visibility = determineVisibility(entry);
    const summary = extractSummary(entry);
    const prompt = typeof entry.prompt === 'string' ? entry.prompt : null;
    const actors = Array.isArray(entry.actors) ? entry.actors : null;
    const extra = typeof entry.extra === 'object' && entry.extra !== null ? entry.extra : null;

    normalized.push({
      role,
      content,
      public: entry.public !== false,
      isVisible: visibility,
      summary,
      prompt,
      actors,
      extra,
    });
  });
  return normalized;
}

function determineVisibility(entry) {
  if (!entry || typeof entry !== 'object') {
    return true;
  }

  if (typeof entry.isVisible === 'boolean') {
    return entry.isVisible;
  }

  const visibilityValue =
    typeof entry.visibility === 'string' ? entry.visibility.trim().toLowerCase() : null;

  if (visibilityValue) {
    if (['hidden', 'private', 'invisible', 'internal'].includes(visibilityValue)) {
      return false;
    }
    if (['public', 'party', 'visible', 'shared'].includes(visibilityValue)) {
      return true;
    }
  }

  return entry.public !== false;
}

function extractSummary(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidates = [entry.summary, entry.summary_payload, entry.summaryPayload];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      try {
        return JSON.parse(JSON.stringify(candidate));
      } catch (error) {
        return null;
      }
    }
  }
  return null;
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

  const {
    session_id: sessionId,
    game_id: gameId,
    entries,
    turn_number: turnNumber,
  } = payload || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'missing_session_id' });
  }

  const normalizedEntries = normalizeEntries(entries);
  if (!normalizedEntries.length) {
    return res.status(400).json({ error: 'missing_entries' });
  }

  const { data: session, error: sessionError } = await withTableQuery(
    supabaseAdmin,
    'rank_sessions',
    from => from.select('id, owner_id, game_id, turn').eq('id', sessionId).maybeSingle()
  );

  if (sessionError) {
    return res.status(400).json({ error: sessionError.message });
  }

  if (!session || session.owner_id !== user.id) {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (gameId && session.game_id && session.game_id !== gameId) {
    return res.status(409).json({ error: 'session_game_mismatch' });
  }

  const { data: lastTurn, error: lastError } = await withTableQuery(
    supabaseAdmin,
    'rank_turns',
    from =>
      from
        .select('idx')
        .eq('session_id', sessionId)
        .order('idx', { ascending: false })
        .limit(1)
        .maybeSingle()
  );

  if (lastError) {
    return res.status(400).json({ error: lastError.message });
  }

  let startIdx = 0;
  const lastIdx = Number(lastTurn?.idx);
  if (Number.isFinite(lastIdx)) {
    startIdx = Math.floor(lastIdx) + 1;
  }

  const currentTurn = Number(session.turn);

  const rows = normalizedEntries.map((entry, offset) => {
    const idx = startIdx + offset;
    const summaryPayload =
      entry.summary && typeof entry.summary === 'object'
        ? entry.summary
        : buildTurnSummaryPayload({
            role: entry.role,
            content: entry.content,
            prompt: entry.prompt,
            session: { id: sessionId, turn: currentTurn },
            idx,
            actors: entry.actors,
            extra: entry.extra,
          });

    return {
      session_id: sessionId,
      idx,
      role: entry.role,
      public: entry.public,
      is_visible: entry.isVisible,
      content: entry.content,
      summary_payload: summaryPayload,
    };
  });

  const { data: inserted, error: insertError } = await withTableQuery(
    supabaseAdmin,
    'rank_turns',
    from => from.insert(rows).select('id, idx, role, public, content, created_at')
  );

  if (insertError) {
    return res.status(400).json({ error: insertError.message });
  }

  const now = new Date().toISOString();
  const numericTurn = Number(turnNumber);
  const updatePayload = { updated_at: now };
  if (Number.isFinite(numericTurn) && numericTurn > 0) {
    updatePayload.turn = Math.max(session.turn || 0, numericTurn);
  }

  const { error: updateError } = await withTableQuery(supabaseAdmin, 'rank_sessions', from =>
    from.update(updatePayload).eq('id', sessionId)
  );

  if (updateError) {
    return res.status(400).json({ error: updateError.message });
  }

  const resolvedTurn =
    Number.isFinite(numericTurn) && numericTurn > 0 ? numericTurn : Number(session.turn) || null;
  const timelineEvents = extractRealtimeTimelineEvents(normalizedEntries, {
    sessionId,
    gameId: gameId || session.game_id || null,
    turn: resolvedTurn,
  });

  if (timelineEvents.length) {
    const timelineRows = timelineEvents
      .map(event =>
        mapTimelineEventToRow(event, {
          sessionId,
          gameId: gameId || session.game_id || null,
        })
      )
      .filter(Boolean);

    if (timelineRows.length) {
      try {
        await withTableQuery(supabaseAdmin, 'rank_session_timeline_events', from =>
          from.upsert(timelineRows, { onConflict: 'event_id', ignoreDuplicates: false })
        );
      } catch (timelineError) {
        console.error('[log-turn] failed to persist timeline events', timelineError);
      }
    }

    await broadcastRealtimeTimeline(sessionId, timelineEvents, {
      turn: resolvedTurn,
      gameId: gameId || session.game_id || null,
    });

    await notifyRealtimeTimelineWebhook(timelineEvents, {
      sessionId,
      gameId: gameId || session.game_id || null,
    });
  }

  return res.status(200).json({ ok: true, entries: inserted });
}

function extractRealtimeTimelineEvents(entries = [], { sessionId, gameId, turn } = {}) {
  if (!Array.isArray(entries)) return [];

  const events = [];

  entries.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const extra = entry.extra;
    if (!extra || typeof extra !== 'object') return;
    const type =
      typeof extra.eventType === 'string'
        ? extra.eventType.trim()
        : typeof extra.type === 'string'
          ? extra.type.trim()
          : '';
    if (!type) return;

    const ownerId =
      extra.ownerId ??
      extra.owner_id ??
      extra.ownerID ??
      (typeof extra.owner === 'string' ? extra.owner : null) ??
      null;

    const strike = Number.isFinite(Number(extra.strike)) ? Number(extra.strike) : null;
    const remaining = Number.isFinite(Number(extra.remaining)) ? Number(extra.remaining) : null;
    const limit = Number.isFinite(Number(extra.limit)) ? Number(extra.limit) : null;
    const eventTurn = Number.isFinite(Number(extra.turn)) ? Number(extra.turn) : (turn ?? null);
    const timestamp = Number.isFinite(Number(extra.timestamp))
      ? Number(extra.timestamp)
      : Date.parse(extra.timestamp);

    events.push({
      id: extra.eventId || extra.id || null,
      type,
      ownerId,
      strike,
      remaining,
      limit,
      reason: extra.reason || null,
      turn: eventTurn,
      timestamp,
      status: extra.status || null,
      context: extra.context || null,
      metadata: extra.metadata || null,
      sessionId: sessionId || null,
      gameId: gameId || null,
    });
  });

  return sanitizeTimelineEvents(events, { defaultTurn: turn });
}
