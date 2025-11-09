// 테스트용 게임 시뮬레이터
// 실제 매칭 로직을 사용하되 test_ 테이블에 저장
// 자동으로 매칭 → 세션 생성 → 턴 진행 → 결과 확인

import { matchRankParticipants, matchCasualParticipants } from './rank/matching.js';

/**
 * 테스트 시뮬레이션 생성
 * @param {object} supabaseClient - Supabase 클라이언트 (admin)
 * @param {object} options - 옵션
 * @param {string} options.gameId - 게임 ID
 * @param {string} options.mode - 모드 (rank_solo, rank_duo, casual_match)
 * @param {string[]} options.heroIds - 히어로 ID 배열
 * @param {number} [options.turnLimit=10] - 최대 턴 수
 * @param {object} [options.config] - 추가 설정
 */
export async function createTestSimulation(supabaseClient, options) {
  const { gameId, mode, heroIds, turnLimit = 10, config = {} } = options;

  if (!gameId || !mode || !Array.isArray(heroIds) || heroIds.length === 0) {
    throw new Error('게임 ID, 모드, 히어로 ID가 필요합니다.');
  }

  // 1. 게임 정보 가져오기
  const { data: game, error: gameError } = await supabaseClient
    .from('rank_games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    throw new Error(`게임을 찾을 수 없습니다: ${gameError?.message}`);
  }

  // 2. 역할 정보 가져오기
  const { data: roles, error: rolesError } = await supabaseClient
    .from('rank_game_roles')
    .select('*')
    .eq('game_id', gameId)
    .order('display_order', { ascending: true });

  if (rolesError) {
    throw new Error(`역할 정보를 가져올 수 없습니다: ${rolesError.message}`);
  }

  // 3. 히어로 정보 가져오기
  const { data: heroes, error: heroesError } = await supabaseClient
    .from('heroes')
    .select('*')
    .in('id', heroIds);

  if (heroesError || !heroes || heroes.length === 0) {
    throw new Error(`히어로 정보를 가져올 수 없습니다: ${heroesError?.message}`);
  }

  // 4. 가상 대기열 생성
  const queue = createMockQueue(heroes, roles, mode);

  // 5. 매칭 실행
  let matchResult;
  if (mode === 'casual_match') {
    matchResult = matchCasualParticipants({
      roles: roles.map(r => ({ name: r.role, slotCount: r.slot_count })),
      queue,
      partySize: 1,
    });
  } else {
    matchResult = matchRankParticipants({
      roles: roles.map(r => ({ name: r.role, slotCount: r.slot_count })),
      queue,
      scoreWindows: [100, 200],
    });
  }

  if (!matchResult.ready) {
    throw new Error(`매칭 실패: ${matchResult.error?.type || '알 수 없는 오류'}`);
  }

  // 6. 세션 생성 (test_rank_sessions)
  const { data: session, error: sessionError } = await supabaseClient
    .from('test_rank_sessions')
    .insert({
      game_id: gameId,
      owner_id: null, // 테스트용이므로 null
      status: 'active',
      turn: 0,
      mode,
    })
    .select()
    .single();

  if (sessionError || !session) {
    throw new Error(`세션 생성 실패: ${sessionError?.message}`);
  }

  // 7. 세션 메타 생성
  await supabaseClient.from('test_rank_session_meta').insert({
    session_id: session.id,
    turn_limit: turnLimit,
    extras: {
      simulation_config: config,
      match_result: matchResult,
    },
  });

  // 8. 슬롯 생성 (첫 번째 방만 사용)
  const firstRoom = matchResult.assignments[0];
  if (firstRoom && firstRoom.members) {
    const slots = firstRoom.members.map((member, index) => ({
      session_id: session.id,
      slot_no: index,
      owner_id: member.owner_id || null,
      hero_ids: member.heroIds || [member.hero_id],
      role: member.role,
      score: 0,
      status: 'active',
    }));

    const { error: slotsError } = await supabaseClient
      .from('test_rank_session_slots')
      .insert(slots);

    if (slotsError) {
      throw new Error(`슬롯 생성 실패: ${slotsError.message}`);
    }
  }

  // 9. 참가자 생성 (test_rank_participants)
  const participants = firstRoom.members.map(member => ({
    game_id: gameId,
    owner_id: member.owner_id || null,
    hero_ids: member.heroIds || [member.hero_id],
    slot_no: member.slot_no,
    role: member.role,
    rating: member.score || 1000,
    status: 'active',
  }));

  await supabaseClient.from('test_rank_participants').insert(participants);

  return {
    sessionId: session.id,
    matchResult,
    participants: firstRoom.members.length,
    roles: roles.map(r => r.role),
  };
}

/**
 * 테스트 세션 정보 조회
 */
export async function getTestSimulation(supabaseClient, sessionId) {
  const { data: session, error: sessionError } = await supabaseClient
    .from('test_rank_sessions')
    .select(
      `
      *,
      test_rank_session_meta(*),
      test_rank_session_slots(*)
    `
    )
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error(`세션을 찾을 수 없습니다: ${sessionError?.message}`);
  }

  // 배틀 로그 가져오기
  const { data: battles } = await supabaseClient
    .from('test_rank_battles')
    .select(
      `
      *,
      test_rank_battle_logs(*)
    `
    )
    .eq('game_id', session.game_id)
    .order('created_at', { ascending: true });

  return {
    session,
    battles: battles || [],
  };
}

/**
 * 자동으로 N턴 진행
 */
export async function autoAdvanceSimulation(supabaseClient, sessionId, turns = 1, aiClient = null) {
  const results = [];

  for (let i = 0; i < turns; i++) {
    try {
      const result = await advanceSimulationTurn(supabaseClient, sessionId, aiClient);
      results.push(result);

      if (result.sessionEnded) {
        break;
      }
    } catch (error) {
      results.push({
        turn: i + 1,
        error: error.message,
      });
      break;
    }
  }

  return results;
}

/**
 * 시뮬레이션 1턴 진행
 */
export async function advanceSimulationTurn(supabaseClient, sessionId, aiClient = null) {
  // 1. 세션 정보 가져오기
  const { data: session } = await supabaseClient
    .from('test_rank_sessions')
    .select(
      `
      *,
      test_rank_session_meta(*),
      test_rank_session_slots(*)
    `
    )
    .eq('id', sessionId)
    .single();

  if (!session) {
    throw new Error('세션을 찾을 수 없습니다.');
  }

  const meta = session.test_rank_session_meta[0];
  const currentTurn = session.turn + 1;

  if (meta?.turn_limit && currentTurn > meta.turn_limit) {
    throw new Error('턴 제한 초과');
  }

  // 2. 슬롯 정보로 가상 배틀 생성
  const slots = session.test_rank_session_slots || [];
  if (slots.length < 2) {
    throw new Error('배틀을 진행할 슬롯이 부족합니다.');
  }

  // 랜덤으로 2개 슬롯 선택
  const attacker = slots[Math.floor(Math.random() * slots.length)];
  let defender;
  do {
    defender = slots[Math.floor(Math.random() * slots.length)];
  } while (defender.slot_no === attacker.slot_no);

  // 3. AI 응답 생성 (또는 더미 응답)
  let aiResponse = '자동 진행 중...';
  let outcome = Math.random() > 0.5 ? 'attacker_win' : 'defender_win';

  if (aiClient) {
    try {
      const prompt = `턴 ${currentTurn}: ${attacker.role} vs ${defender.role}의 대결을 묘사해주세요.`;
      const completion = await aiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
      });
      aiResponse = completion.choices[0]?.message?.content || aiResponse;
    } catch (error) {
      console.error('AI 응답 생성 실패:', error);
    }
  }

  // 4. 배틀 기록 저장
  const { data: battle } = await supabaseClient
    .from('test_rank_battles')
    .insert({
      game_id: session.game_id,
      attacker_owner_id: attacker.owner_id,
      attacker_hero_ids: attacker.hero_ids,
      defender_owner_id: defender.owner_id,
      defender_hero_ids: defender.hero_ids,
      result: outcome,
      score_delta: 10,
    })
    .select()
    .single();

  // 5. 배틀 로그 저장
  if (battle) {
    await supabaseClient.from('test_rank_battle_logs').insert({
      game_id: session.game_id,
      battle_id: battle.id,
      turn_no: currentTurn,
      prompt: `턴 ${currentTurn}`,
      ai_response: aiResponse,
      meta: { outcome },
    });
  }

  // 6. 세션 턴 증가
  await supabaseClient
    .from('test_rank_sessions')
    .update({
      turn: currentTurn,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  // 7. 슬롯 점수 업데이트
  if (outcome === 'attacker_win') {
    await supabaseClient
      .from('test_rank_session_slots')
      .update({ score: (attacker.score || 0) + 10 })
      .eq('session_id', sessionId)
      .eq('slot_no', attacker.slot_no);
  } else {
    await supabaseClient
      .from('test_rank_session_slots')
      .update({ score: (defender.score || 0) + 10 })
      .eq('session_id', sessionId)
      .eq('slot_no', defender.slot_no);
  }

  const sessionEnded = meta?.turn_limit && currentTurn >= meta.turn_limit;

  if (sessionEnded) {
    await supabaseClient
      .from('test_rank_sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId);
  }

  return {
    turn: currentTurn,
    attacker: attacker.role,
    defender: defender.role,
    outcome,
    aiResponse,
    sessionEnded,
  };
}

/**
 * 모든 테스트 시뮬레이션 목록
 */
export async function listTestSimulations(supabaseClient) {
  const { data: sessions } = await supabaseClient
    .from('test_rank_sessions')
    .select(
      `
      *,
      test_rank_session_meta(*),
      rank_games(name)
    `
    )
    .order('created_at', { ascending: false })
    .limit(50);

  return sessions || [];
}

/**
 * 테스트 시뮬레이션 삭제
 */
export async function deleteTestSimulation(supabaseClient, sessionId) {
  // CASCADE로 자동 삭제되지만 명시적으로 순서대로 삭제
  await supabaseClient
    .from('test_rank_battle_logs')
    .delete()
    .in(
      'battle_id',
      supabaseClient
        .from('test_rank_battles')
        .select('id')
        .eq(
          'game_id',
          supabaseClient.from('test_rank_sessions').select('game_id').eq('id', sessionId)
        )
    );

  await supabaseClient.from('test_rank_session_slots').delete().eq('session_id', sessionId);

  await supabaseClient.from('test_rank_session_meta').delete().eq('session_id', sessionId);

  await supabaseClient.from('test_rank_sessions').delete().eq('id', sessionId);
}

/**
 * 가상 대기열 생성 헬퍼
 */
function createMockQueue(heroes, roles, mode) {
  const queue = [];
  const now = Date.now();

  heroes.forEach((hero, index) => {
    const role = roles[index % roles.length];
    const score = 1000 + Math.floor(Math.random() * 400) - 200; // 800-1200

    queue.push({
      role: role.role,
      score,
      joinedAt: now + index * 1000,
      groupKey: `test-${hero.id}`,
      partyKey: null,
      heroIds: [hero.id],
      entry: {
        id: `queue-${index}`,
        owner_id: `test-owner-${index}`,
        hero_id: hero.id,
        heroIds: [hero.id],
        role: role.role,
        score,
        rating: score,
        joined_at: new Date(now + index * 1000).toISOString(),
      },
    });
  });

  return queue;
}
