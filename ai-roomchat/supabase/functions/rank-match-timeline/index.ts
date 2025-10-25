import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';

import { supabase } from '../_shared/supabaseClient.ts';
import { mapTimelineEventToRow, sanitizeTimelineEvents } from '../_shared/timeline.ts';
import { broadcastTimelineEvents, notifyTimelineWebhook } from '../_shared/notifications.ts';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

async function parsePayload(req: Request): Promise<Record<string, unknown> | null> {
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      const data = await req.json();
      return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    }
    const text = await req.text();
    if (!text) return null;
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch (error) {
    console.error('[rank-match-timeline] Failed to parse payload', { error });
    return null;
  }
}

function safeString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function safeNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function safeClone<T>(value: T): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return null;
  }
}

function buildMatchingMetadata(payload: Record<string, unknown>) {
  const matching = (payload.matching as Record<string, unknown>) || {};
  const storedAt =
    safeNumber(matching.stored_at) ??
    safeNumber(matching.storedAt) ??
    safeNumber(payload.stored_at) ??
    safeNumber(payload.storedAt) ??
    Date.now();

  const assignments = Array.isArray(matching.assignments)
    ? (safeClone(matching.assignments) ?? [])
    : Array.isArray(payload.assignments)
      ? (safeClone(payload.assignments) ?? [])
      : [];

  const dropInMeta =
    safeClone(matching.drop_in_meta) ??
    safeClone(matching.dropInMeta) ??
    safeClone(payload.drop_in_meta) ??
    safeClone(payload.dropInMeta) ??
    null;

  const sampleMeta =
    safeClone(matching.sample_meta) ??
    safeClone(matching.sampleMeta) ??
    safeClone(payload.sample_meta) ??
    safeClone(payload.sampleMeta) ??
    null;

  const roleStatus =
    safeClone(matching.role_status) ??
    safeClone(matching.roleStatus) ??
    safeClone(payload.role_status) ??
    safeClone(payload.roleStatus) ??
    null;

  const dropInTarget =
    safeClone(matching.drop_in_target) ??
    safeClone(matching.dropInTarget) ??
    safeClone(payload.drop_in_target) ??
    safeClone(payload.dropInTarget) ??
    null;

  return {
    matching: {
      source:
        safeString(matching.source) ?? safeString(payload.source) ?? 'edge:rank-match-timeline',
      matchType:
        safeString(matching.match_type) ??
        safeString(matching.matchType) ??
        safeString(payload.match_type) ??
        safeString(payload.matchType) ??
        null,
      matchCode:
        safeString(matching.match_code) ??
        safeString(matching.matchCode) ??
        safeString(payload.match_code) ??
        safeString(payload.matchCode) ??
        null,
      dropInTarget,
      dropInMeta,
      sampleMeta,
      roleStatus,
      assignments: assignments ?? [],
      queueSize:
        safeNumber(matching.queue_size) ??
        safeNumber(matching.queueSize) ??
        safeNumber(payload.queue_size) ??
        safeNumber(payload.queueSize) ??
        null,
      storedAt,
      mode: safeString(matching.mode) ?? safeString(payload.mode) ?? null,
      turnTimer:
        safeNumber(matching.turn_timer) ??
        safeNumber(matching.turnTimer) ??
        safeNumber(payload.turn_timer) ??
        safeNumber(payload.turnTimer) ??
        null,
    },
  };
}

serve(async req => {
  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'method_not_allowed' },
      {
        status: 405,
        headers: { Allow: 'POST' },
      }
    );
  }

  const payload = await parsePayload(req);
  if (!payload) {
    return jsonResponse({ error: 'invalid_payload' }, { status: 400 });
  }

  const sessionId = safeString(payload.session_id) ?? safeString(payload.sessionId) ?? null;
  const gameId = safeString(payload.game_id) ?? safeString(payload.gameId) ?? null;

  if (!sessionId) {
    return jsonResponse({ error: 'missing_session_id' }, { status: 400 });
  }

  const metadata = buildMatchingMetadata(payload);
  const storedAt = metadata.matching.storedAt ?? Date.now();

  const context = {
    actorLabel: '매칭',
    matchType: metadata.matching.matchType,
    mode: metadata.matching.mode,
    sessionLabel: safeString(payload.session_label) ?? safeString(payload.sessionLabel) ?? null,
    sessionCreatedAt:
      safeString(payload.session_created_at) ?? safeString(payload.sessionCreatedAt) ?? null,
  };

  const event = {
    type: 'drop_in_matching_context',
    ownerId: null,
    reason: metadata.matching.matchType ?? 'matched',
    turn: 0,
    timestamp: storedAt,
    context,
    metadata,
    sessionId,
    gameId,
  };

  const row = mapTimelineEventToRow(event, { sessionId, gameId });
  if (!row || !row.event_id) {
    return jsonResponse({ error: 'invalid_event' }, { status: 400 });
  }

  const { error } = await supabase
    .from('rank_session_timeline_events')
    .upsert(row, { onConflict: 'event_id' });

  if (error) {
    console.error('[rank-match-timeline] Failed to persist timeline event', {
      sessionId,
      error,
    });
    return jsonResponse(
      { error: 'timeline_persist_failed', detail: error.message },
      { status: 500 }
    );
  }

  await Promise.allSettled([
    broadcastTimelineEvents(sessionId, [event], { source: 'edge:rank-match-timeline' }),
    notifyTimelineWebhook([event], { sessionId, gameId }),
  ]);

  const [sanitized] = sanitizeTimelineEvents([event], { defaultTurn: 0 });

  return jsonResponse({ success: true, event: sanitized ?? null });
});
