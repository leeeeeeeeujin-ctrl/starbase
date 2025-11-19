import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';
import { runSimpleMatch } from '../../../lib/rank/simpleMatchEngine.js';

/**
 * 텍스트 배틀용 매칭 조인 + 커밋 API (단순 버전)
 *
 * - 요청: POST /api/text-battle/match-join
 *   body: {
 *     gameId: string,           // rank_games.id
 *     mode?: string,            // 예: 'rank_shared', 기본값 'rank_shared'
 *     ownerId: string,          // auth.users.id (요청자)
 *     heroId?: string | null,   // 선택: 해당 영웅 id
 *     role?: string,            // 선택: 미지정 시 첫 번째 활성 역할 사용
 *     score?: number | null     // 선택: ELO/점수, 기본 1000
 *   }
 *
 * - 동작 순서:
 *   1) 이 유저를 rank_match_queue에 status='waiting'으로 upsert.
 *   2) 같은 gameId/mode 대기열을 읽어 JS 매칭 엔진(runSimpleMatch)으로 1회 매칭 계산.
 *   3) 결과 중 "이 ownerId가 포함된 ready=true 방"이 있으면:
 *      - rank_rooms / rank_room_slots / rank_sessions에 단순 방/슬롯/세션을 생성하고,
 *      - 매칭에 사용된 queue row들의 status를 'matched', match_code를 room.code로 업데이트.
 *   4) 아직 준비가 안 됐으면 matched=false 상태로 대기열 정보만 반환.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ ok: false, error: 'method_not_allowed' });
  }

  if (!supabaseAdmin || typeof supabaseAdmin.from !== 'function') {
    return res
      .status(500)
      .json({ ok: false, error: 'supabase_not_configured' });
  }

  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return res
      .status(400)
      .json({ ok: false, error: 'invalid_json' });
  }

  const {
    gameId,
    mode,
    ownerId,
    heroId = null,
    role: requestedRole,
    score: requestedScore,
  } = body || {};

  if (!gameId || !ownerId) {
    return res.status(400).json({
      ok: false,
      error: 'missing_fields',
      detail: 'gameId와 ownerId는 필수입니다.',
    });
  }

  const queueMode = mode || 'rank_shared';
  const score = Number.isFinite(Number(requestedScore))
    ? Number(requestedScore)
    : 1000;

  try {
    // 1) 게임 역할 구성 로드
    const { data: roleRows, error: rolesError } = await supabaseAdmin
      .from('rank_game_roles')
      .select('name, slot_count, active')
      .eq('game_id', gameId)
      .order('id', { ascending: true });

    if (rolesError) {
      return res.status(500).json({
        ok: false,
        error: 'roles_query_failed',
        detail: rolesError.message || null,
      });
    }

    const activeRoles = Array.isArray(roleRows)
      ? roleRows.filter(r => r && r.active !== false)
      : [];
    if (!activeRoles.length) {
      return res.status(400).json({
        ok: false,
        error: 'no_active_roles',
        detail: '해당 게임에 활성화된 역할이 없습니다.',
      });
    }

    // 요청된 역할이 없으면 첫 번째 활성 역할 사용
    const normalizedRequestedRole =
      (requestedRole && String(requestedRole).trim()) || null;
    const chosenRole =
      normalizedRequestedRole ||
      (activeRoles[0] && activeRoles[0].name) ||
      null;

    if (!chosenRole) {
      return res.status(400).json({
        ok: false,
        error: 'role_not_resolved',
        detail: '역할(role)을 결정할 수 없습니다.',
      });
    }

    // 2) 이 유저의 기존 waiting 큐 엔트리 조회 / upsert
    const { data: existingQueueRows, error: findQueueError } =
      await supabaseAdmin
        .from('rank_match_queue')
        .select('id, game_id, mode, owner_id, hero_id, role, score, status')
        .eq('game_id', gameId)
        .eq('mode', queueMode)
        .eq('owner_id', ownerId)
        .eq('status', 'waiting')
        .limit(1);

    if (findQueueError) {
      return res.status(500).json({
        ok: false,
        error: 'queue_lookup_failed',
        detail: findQueueError.message || null,
      });
    }

    let queueEntry;
    if (Array.isArray(existingQueueRows) && existingQueueRows.length) {
      const current = existingQueueRows[0];
      const { data: updatedRows, error: updateError } = await supabaseAdmin
        .from('rank_match_queue')
        .update({
          hero_id: heroId || current.hero_id || null,
          role: chosenRole,
          score,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id)
        .select('*')
        .limit(1);

      if (updateError) {
        return res.status(500).json({
          ok: false,
          error: 'queue_update_failed',
          detail: updateError.message || null,
        });
      }
      queueEntry =
        Array.isArray(updatedRows) && updatedRows.length
          ? updatedRows[0]
          : current;
    } else {
      const { data: insertedRows, error: insertError } = await supabaseAdmin
        .from('rank_match_queue')
        .insert({
          game_id: gameId,
          mode: queueMode,
          owner_id: ownerId,
          hero_id: heroId,
          role: chosenRole,
          score,
          simulated: false,
          status: 'waiting',
        })
        .select('*')
        .limit(1);

      if (insertError) {
        return res.status(500).json({
          ok: false,
          error: 'queue_insert_failed',
          detail: insertError.message || null,
        });
      }

      queueEntry =
        Array.isArray(insertedRows) && insertedRows.length
          ? insertedRows[0]
          : null;
    }

    if (!queueEntry) {
      return res.status(500).json({
        ok: false,
        error: 'queue_entry_missing',
      });
    }

    // 3) 현재 게임/모드의 전체 waiting 큐 로드
    const { data: queueRows, error: queueError } = await supabaseAdmin
      .from('rank_match_queue')
      .select(
        'id, game_id, mode, owner_id, hero_id, role, score, joined_at, status'
      )
      .eq('game_id', gameId)
      .eq('mode', queueMode)
      .eq('status', 'waiting')
      .order('joined_at', { ascending: true });

    if (queueError) {
      return res.status(500).json({
        ok: false,
        error: 'queue_query_failed',
        detail: queueError.message || null,
      });
    }

    // 4) JS 매칭 엔진으로 1회 매칭 계획 계산
    const matchResult = runSimpleMatch({
      roles: activeRoles,
      queue: queueRows || [],
    });

    // 이 요청자의 ownerId가 포함된 ready assignment 찾기
    const myAssignments = Array.isArray(matchResult.assignments)
      ? matchResult.assignments.filter(a => {
          if (!a || !Array.isArray(a.roleSlots)) return false;
          return a.roleSlots.some(slot => {
            if (!slot || !Array.isArray(slot.members)) return false;
            return slot.members.some(member => {
              if (!member) return false;
              const mOwner =
                member.owner_id ??
                member.ownerId ??
                member.entry?.owner_id ??
                member.entry?.ownerId;
              return mOwner && String(mOwner) === String(ownerId);
            });
          });
        })
      : [];

    const myReadyAssignment =
      myAssignments.find(a => a.ready) || null;

    if (!myReadyAssignment) {
      // 아직 이 유저가 포함된 완성된 방이 없다 → 대기 상태만 반환
      return res.status(200).json({
        ok: true,
        matched: false,
        gameId,
        mode: queueMode,
        queueEntry,
        matchPreview: matchResult,
      });
    }

    // 5) 방/슬롯/세션 생성 및 큐 소비
    // 매칭에 포함된 queue id 목록 추출
    const matchedQueueIds = [];
    myReadyAssignment.roleSlots.forEach(slot => {
      if (!slot || !Array.isArray(slot.members)) return;
      slot.members.forEach(member => {
        if (!member) return;
        const qid =
          member.entry?.id ??
          member.entry?.queue_id ??
          member.id ??
          null;
        if (qid && !matchedQueueIds.includes(qid)) {
          matchedQueueIds.push(qid);
        }
      });
    });

    // 간단한 방 코드 생성
    const roomCode =
      'TB-' +
      Math.random().toString(36).slice(2, 6).toUpperCase() +
      '-' +
      Date.now().toString(36).slice(-4).toUpperCase();

    // rank_rooms 생성
    const slotCount = Number(myReadyAssignment.slots || 0);
    const filledCount = myReadyAssignment.filledSlots ?? 0;
    const readyCount = myReadyAssignment.filledSlots ?? 0;

    const { data: roomRows, error: roomError } = await supabaseAdmin
      .from('rank_rooms')
      .insert({
        game_id: gameId,
        owner_id: ownerId,
        code: roomCode,
        mode: queueMode,
        realtime_mode: 'standard',
        status: 'active',
        slot_count: slotCount,
        filled_count: filledCount,
        ready_count: readyCount,
      })
      .select('*')
      .limit(1);

    if (roomError) {
      return res.status(500).json({
        ok: false,
        error: 'room_insert_failed',
        detail: roomError.message || null,
      });
    }

    const room =
      Array.isArray(roomRows) && roomRows.length ? roomRows[0] : null;
    if (!room) {
      return res.status(500).json({
        ok: false,
        error: 'room_missing_after_insert',
      });
    }

    // rank_room_slots 생성
    const slotInserts = [];
    myReadyAssignment.roleSlots.forEach(slot => {
      if (!slot) return;

      const occupant = Array.isArray(slot.members)
        ? slot.members[0] || null
        : null;

      const occupantOwner =
        occupant?.owner_id ??
        occupant?.ownerId ??
        occupant?.entry?.owner_id ??
        occupant?.entry?.ownerId ??
        null;
      const occupantHero =
        occupant?.hero_id ??
        occupant?.heroId ??
        occupant?.entry?.hero_id ??
        occupant?.entry?.heroId ??
        null;

      slotInserts.push({
        room_id: room.id,
        slot_index: slot.slotIndex,
        role: slot.role,
        occupant_owner_id: occupantOwner,
        occupant_hero_id: occupantHero,
        occupant_ready: Boolean(occupantOwner),
        joined_at: occupantOwner ? new Date().toISOString() : null,
      });
    });

    if (slotInserts.length) {
      const { error: slotsError } = await supabaseAdmin
        .from('rank_room_slots')
        .insert(slotInserts);
      if (slotsError) {
        return res.status(500).json({
          ok: false,
          error: 'room_slots_insert_failed',
          detail: slotsError.message || null,
        });
      }
    }

    // rank_sessions 생성
    const { data: sessionRows, error: sessionError } =
      await supabaseAdmin
        .from('rank_sessions')
        .insert({
          game_id: gameId,
          owner_id: ownerId,
          status: 'active',
          turn: 0,
          room_id: room.id,
          mode: queueMode,
          rating_hint: score,
          vote_snapshot: {},
        })
        .select('*')
        .limit(1);

    if (sessionError) {
      return res.status(500).json({
        ok: false,
        error: 'session_insert_failed',
        detail: sessionError.message || null,
      });
    }

    const session =
      Array.isArray(sessionRows) && sessionRows.length
        ? sessionRows[0]
        : null;

    // 매칭된 큐 엔트리 status / match_code 업데이트
    if (matchedQueueIds.length) {
      await supabaseAdmin
        .from('rank_match_queue')
        .update({
          status: 'matched',
          match_code: room.code,
          updated_at: new Date().toISOString(),
        })
        .in('id', matchedQueueIds);
    }

    return res.status(200).json({
      ok: true,
      matched: true,
      gameId,
      mode: queueMode,
      room,
      session,
      matchedQueueIds,
      assignment: myReadyAssignment,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      detail: e?.message || String(e),
    });
  }
}

