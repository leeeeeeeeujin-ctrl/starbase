import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';

import { supabase } from '../_shared/supabaseClient.ts';

const DEFAULT_CUTOFF_MINUTES = 360;
const DEFAULT_BATCH_LIMIT = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const LOG_SOURCE = 'edge:rank-session-ttl-cleanup';

async function logCleanupEvent(
  eventType: string,
  payload: Record<string, unknown>,
  errorCode?: string | null
) {
  try {
    await supabase.from('rank_game_logs').insert({
      source: LOG_SOURCE,
      event_type: eventType,
      error_code: errorCode ?? null,
      payload,
    });
  } catch (logError) {
    console.error('[rank-session-ttl-cleanup] Failed to log cleanup result', {
      logError,
      eventType,
    });
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...(init.headers ?? {}) },
    ...init,
  });
}

function parseNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

async function parseRequestConfig(req: Request) {
  let cutoffMinutes = DEFAULT_CUTOFF_MINUTES;
  let batchLimit = DEFAULT_BATCH_LIMIT;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.has('cutoff_minutes')) {
      cutoffMinutes = parseNumber(url.searchParams.get('cutoff_minutes'), cutoffMinutes);
    }
    if (url.searchParams.has('batch_limit')) {
      batchLimit = parseNumber(url.searchParams.get('batch_limit'), batchLimit);
    }
    return { cutoffMinutes, batchLimit };
  }

  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      const payload = await req.json();
      if (payload && typeof payload === 'object') {
        const data = payload as Record<string, unknown>;
        if (data.cutoff_minutes != null) {
          cutoffMinutes = parseNumber(data.cutoff_minutes, cutoffMinutes);
        }
        if (data.batch_limit != null) {
          batchLimit = parseNumber(data.batch_limit, batchLimit);
        }
      }
    }
  } catch (error) {
    console.error('[rank-session-ttl-cleanup] Failed to parse payload', { error });
  }

  return { cutoffMinutes, batchLimit };
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    const errorResponse = { error: 'method_not_allowed' };
    await logCleanupEvent(
      'session_ttl_cleanup_rejected',
      {
        method: req.method,
        allowed_methods: ['GET', 'POST', 'OPTIONS'],
      },
      'method_not_allowed'
    );
    return jsonResponse(errorResponse, { status: 405, headers: { Allow: 'GET, POST, OPTIONS' } });
  }

  const { cutoffMinutes, batchLimit } = await parseRequestConfig(req);

  const { data, error } = await supabase.rpc('cleanup_expired_rank_session_snapshots', {
    p_cutoff_minutes: cutoffMinutes,
    p_batch_limit: batchLimit,
  });

  if (error) {
    console.error('[rank-session-ttl-cleanup] RPC failed', { error, cutoffMinutes, batchLimit });
    await logCleanupEvent(
      'session_ttl_cleanup_failed',
      {
        cutoffMinutes,
        batchLimit,
        error: error.message,
      },
      'rpc_failed'
    );
    return jsonResponse({ error: 'rpc_failed', details: error.message }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  const deletedSessions = rows.filter(row => row.deleted_meta || row.deleted_turn_events > 0);
  const totalDeletedEvents = rows.reduce(
    (acc, row) => acc + (Number(row.deleted_turn_events) || 0),
    0
  );

  const summary = {
    cutoffMinutes,
    batchLimit,
    inspectedSessions: rows.length,
    deletedSessions: deletedSessions.length,
    deletedTurnEvents: totalDeletedEvents,
    results: rows,
  };

  await logCleanupEvent('session_ttl_cleanup_completed', summary);

  return jsonResponse(summary);
});
