import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withTableQuery } from '@/lib/supabaseTables'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

import {
  buildHeroSummaryMap,
  buildParticipantMap,
  collectHeroIds,
  collectOwnerIds,
  hydrateRoster,
  rosterToSupabasePayload,
} from './matchRoster'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for rank match services')
}

function isMissingRpc(error, name) {
  if (!error) return false
  const text = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return text.includes(name.toLowerCase()) && text.includes('does not exist')
}

export function createAnonClient(token) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: {
      headers,
    },
  })
}

export async function fetchUserByToken(token) {
  const client = createAnonClient(token)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) {
    return { ok: false, error: 'unauthorized' }
  }
  return { ok: true, user: data.user }
}

export async function fetchRoomContext(roomId) {
  const { data, error } = await withTableQuery(
    supabaseAdmin,
    'rank_rooms',
    (from) =>
      from
        .select(
          'id, owner_id, mode, slot_template_version, slot_template_source, slot_template_updated_at',
        )
        .eq('id', roomId)
        .limit(1)
        .maybeSingle(),
  )

  if (error) {
    return {
      ok: false,
      status: 400,
      body: { error: error.message || 'room_lookup_failed' },
    }
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      body: { error: 'room_not_found' },
    }
  }

  return {
    ok: true,
    room: data,
    ownerId: data.owner_id || null,
    mode: data.mode || null,
    slotTemplate: {
      version: data.slot_template_version ?? null,
      source: data.slot_template_source ?? null,
      updatedAt: data.slot_template_updated_at ?? null,
    },
  }
}

export async function verifyRolesAndSlots(roles = [], slots = []) {
  if (!Array.isArray(roles) || !Array.isArray(slots) || slots.length === 0) {
    return { ok: true }
  }

  const { error } = await supabaseAdmin.rpc('verify_rank_roles_and_slots', {
    p_roles: roles,
    p_slots: slots,
  })

  if (error && !isMissingRpc(error, 'verify_rank_roles_and_slots')) {
    return {
      ok: false,
      status: 400,
      body: { error: 'roles_slots_invalid', detail: error.message || null },
    }
  }

  return { ok: true }
}

export async function fetchParticipantStats(gameId, roster) {
  const ownerIds = collectOwnerIds(roster)
  if (!ownerIds.length) {
    return { ok: true, map: new Map() }
  }

  const { data, error } = await withTableQuery(
    supabaseAdmin,
    'rank_participants',
    (from) =>
      from
        .select('owner_id, score, rating, battles, win_rate, status, standin, match_source')
        .eq('game_id', gameId)
        .in('owner_id', ownerIds),
  )

  if (error) {
    return {
      ok: false,
      status: 400,
      body: { error: error.message || 'participant_lookup_failed' },
    }
  }

  return { ok: true, map: buildParticipantMap(Array.isArray(data) ? data : []) }
}

export async function fetchHeroSummaries(roster, heroMapFromRequest = {}) {
  const heroIds = collectHeroIds(roster)
  if (!heroIds.length) {
    return { ok: true, map: new Map() }
  }

  const { data, error } = await withTableQuery(supabaseAdmin, 'heroes', (from) =>
    from
      .select(
        'id, name, description, image_url, background_url, bgm_url, bgm_duration_seconds, ability1, ability2, ability3, ability4',
      )
      .in('id', heroIds),
  )

  if (error) {
    return {
      ok: false,
      status: 400,
      body: { error: error.message || 'hero_lookup_failed' },
    }
  }

  return {
    ok: true,
    map: buildHeroSummaryMap(Array.isArray(data) ? data : []),
    heroMapFromRequest,
  }
}

export async function callPrepareMatchSession({
  roomId,
  gameId,
  matchInstanceId,
  requestOwnerId,
  roster,
  readyVote,
  asyncFillMeta,
  mode,
  slotTemplate,
  allowPartial,
}) {
  const payload = rosterToSupabasePayload(roster)
  const slotPayload = {
    version: slotTemplate?.version ?? null,
    source: slotTemplate?.source ?? null,
    updated_at: slotTemplate?.updatedAt ?? null,
  }

  const { data, error } = await supabaseAdmin.rpc('prepare_rank_match_session', {
    p_room_id: roomId,
    p_game_id: gameId,
    p_match_instance_id: matchInstanceId,
    p_request_owner_id: requestOwnerId,
    p_mode: mode || null,
    p_vote: readyVote || {},
    p_async_fill: asyncFillMeta || null,
    p_roster: payload,
    p_slot_template: slotPayload,
    p_allow_partial: allowPartial === true,
  })

  if (error) {
    if (isMissingRpc(error, 'prepare_rank_match_session')) {
      return {
        ok: false,
        status: 500,
        body: {
          error: 'missing_prepare_rank_match_session',
          detail:
            'Supabase에 prepare_rank_match_session(...) 함수를 배포하고 authenticated/service_role 권한을 부여하세요.',
        },
      }
    }

    return {
      ok: false,
      status: 400,
      body: { error: error.message || 'prepare_match_failed' },
    }
  }

  const resultRow = Array.isArray(data) ? data[0] : data
  return {
    ok: true,
    data: {
      sessionId: resultRow?.session_id || null,
      slotTemplateVersion: resultRow?.slot_template_version || null,
      slotTemplateUpdatedAt: resultRow?.slot_template_updated_at || null,
      queueReconciled: resultRow?.queue_reconciled || 0,
      queueInserted: resultRow?.queue_inserted || 0,
      queueRemoved: resultRow?.queue_removed || 0,
      sanitizedRoster: Array.isArray(resultRow?.sanitized_roster)
        ? resultRow.sanitized_roster
        : [],
    },
  }
}

export function mergeRosterMetadata({ roster, participantMap, heroSummaryResult }) {
  const heroMap = heroSummaryResult?.heroMapFromRequest || {}
  const heroSummaryMap = heroSummaryResult?.map || new Map()
  return hydrateRoster({ roster, heroMap, participantMap, heroSummaryMap })
}
