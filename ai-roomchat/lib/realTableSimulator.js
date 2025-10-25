// 실제 테이블을 사용하는 게임 시뮬레이터
// rank_sessions, rank_session_meta, rank_battles, rank_battle_logs 만 사용하고
// 슬롯/점수 상태는 rank_session_meta.extras에 기록합니다.

import { matchRankParticipants, matchCasualParticipants } from './rank/matching.js';

function createMockQueue(heroes, roles) {
  const queue = [];
  const now = Date.now();

  // 역할별로 필요한 수만큼 영웅 할당
  let heroIndex = 0;

  for (const role of roles) {
    for (let i = 0; i < role.slot_count; i++) {
      if (heroIndex >= heroes.length) break;

      const hero = heroes[heroIndex];
      const score = 1000 + Math.floor(Math.random() * 400) - 200; // 800-1200

      queue.push({
        id: `queue-${heroIndex}`,
        owner_id: null,
        hero_id: hero.id,
        role: role.name,
        score,
        joined_at: new Date(now + heroIndex * 1000).toISOString(),
        entry: {
          id: `queue-${heroIndex}`,
          owner_id: null,
          hero_id: hero.id,
        },
      });

      heroIndex++;
    }
  }

  return queue;
}

export async function createRealSimulation(supabase, options) {
  const { gameId, mode, heroIds, turnLimit = 10, config = {} } = options || {};
  if (!gameId || !mode || !Array.isArray(heroIds) || heroIds.length === 0) {
    throw new Error('게임 ID, 모드, 히어로 ID가 필요합니다.');
  }

  const { data: game, error: gameError } = await supabase
    .from('rank_games')
    .select('*')
    .eq('id', gameId)
    .single();
  if (gameError || !game) throw new Error(`게임을 찾을 수 없습니다: ${gameError?.message}`);

  const { data: roles, error: rolesError } = await supabase
    .from('rank_game_roles')
    .select('*')
    .eq('game_id', gameId)
    .order('id', { ascending: true });
  if (rolesError) throw new Error(`역할 정보를 가져올 수 없습니다: ${rolesError.message}`);

  const { data: heroes, error: heroesError } = await supabase
    .from('heroes')
    .select('id, name')
    .in('id', heroIds);
  if (heroesError || !heroes || heroes.length === 0) {
    throw new Error(`히어로 정보를 가져올 수 없습니다: ${heroesError?.message}`);
  }

  // 역할별 필요한 슬롯 수 계산
  const totalSlots = roles.reduce((sum, r) => sum + r.slot_count, 0);
  console.log(
    `[realTableSimulator] Total slots needed: ${totalSlots}, Heroes provided: ${heroes.length}`
  );

  // 정확히 필요한 수만큼만 사용
  const usableHeroes = heroes.slice(0, totalSlots);
  console.log(`[realTableSimulator] Using ${usableHeroes.length} heroes for matching`);

  const queue = createMockQueue(usableHeroes, roles);

  // 디버그: 큐와 역할 정보 출력
  console.log('[realTableSimulator] Queue:', JSON.stringify(queue, null, 2));
  console.log(
    '[realTableSimulator] Roles for matching:',
    JSON.stringify(
      roles.map(r => ({ name: r.name, slotCount: r.slot_count })),
      null,
      2
    )
  );

  let matchResult;
  if (mode === 'casual_match') {
    matchResult = matchCasualParticipants({
      roles: roles.map(r => ({ name: r.name, slotCount: r.slot_count })),
      queue,
      partySize: 1,
    });
  } else {
    matchResult = matchRankParticipants({
      roles: roles.map(r => ({ name: r.name, slotCount: r.slot_count })),
      queue,
      scoreWindows: [100, 200],
    });
  }

  // 디버그: 매칭 결과 출력
  console.log(
    '[realTableSimulator] Match result:',
    JSON.stringify(
      {
        ready: matchResult?.ready,
        error: matchResult?.error,
        assignmentsCount: matchResult?.assignments?.length,
        firstRoomMembers: matchResult?.assignments?.[0]?.members?.length,
      },
      null,
      2
    )
  );

  if (!matchResult?.ready) {
    throw new Error(`매칭 실패: ${matchResult?.error?.type || '알 수 없는 오류'}`);
  }

  // 첫 방만 사용
  const firstRoom = matchResult.assignments?.[0];
  const members = firstRoom?.members || [];
  const slots = members.map((m, idx) => ({
    slot_no: idx,
    role: m.role,
    hero_ids: m.heroIds || [m.hero_id],
    hero_names: (m.heroIds || [m.hero_id])
      .map(hid => heroes.find(h => h.id === hid)?.name)
      .filter(Boolean),
    score: 0,
    owner_id: null,
  }));

  const { data: session, error: sessionError } = await supabase
    .from('rank_sessions')
    .insert({ game_id: gameId, owner_id: null, status: 'active', turn: 0, mode })
    .select()
    .single();
  if (sessionError || !session) throw new Error(`세션 생성 실패: ${sessionError?.message}`);

  const extras = {
    simulation: true,
    simulation_config: config,
    match_result: matchResult,
    slots,
  };

  const { error: metaError } = await supabase
    .from('rank_session_meta')
    .insert({ session_id: session.id, turn_limit: turnLimit, extras });
  if (metaError) throw new Error(`세션 메타 생성 실패: ${metaError.message}`);

  return {
    sessionId: session.id,
    participants: members.length,
    roles: roles.map(r => r.role),
  };
}

export async function getRealSimulation(supabase, sessionId) {
  const { data: session, error: sessionError } = await supabase
    .from('rank_sessions')
    .select(`*, rank_session_meta(*), rank_games(name)`) // for UI list consistency
    .eq('id', sessionId)
    .single();
  if (sessionError || !session)
    throw new Error(`세션을 찾을 수 없습니다: ${sessionError?.message}`);

  const meta = (session.rank_session_meta && session.rank_session_meta[0]) || null;

  // 이 시뮬레이션에서 생성된 배틀만 조회: 로그 meta.session_id 로 필터링 후 battle_ids 수집
  const { data: logs, error: logsErr } = await supabase
    .from('rank_battle_logs')
    .select('id, battle_id, meta, turn_no, created_at')
    .eq('game_id', session.game_id);
  if (logsErr) throw new Error(`배틀 로그 조회 실패: ${logsErr.message}`);
  const battleIds = Array.from(
    new Set(
      (logs || []).filter(l => l.meta && l.meta.session_id === sessionId).map(l => l.battle_id)
    )
  );

  let battles = [];
  if (battleIds.length > 0) {
    const { data: battleRows } = await supabase
      .from('rank_battles')
      .select('*, rank_battle_logs(*)')
      .in('id', battleIds)
      .order('created_at', { ascending: true });
    battles = battleRows || [];
  }

  return {
    session: {
      id: session.id,
      game_id: session.game_id,
      mode: session.mode,
      status: session.status,
      turn: session.turn,
      created_at: session.created_at,
      updated_at: session.updated_at,
      turn_limit: meta?.turn_limit || null,
      extras: meta?.extras || {},
      rank_games: session.rank_games || null,
    },
    battles,
  };
}

export async function advanceRealSimulationTurn(supabase, sessionId, aiClient = null) {
  const { data: s } = await supabase
    .from('rank_sessions')
    .select('*, rank_session_meta(*)')
    .eq('id', sessionId)
    .single();
  if (!s) throw new Error('세션을 찾을 수 없습니다.');
  const meta = (s.rank_session_meta && s.rank_session_meta[0]) || null;
  const turnLimit = meta?.turn_limit || 0;
  const extras = meta?.extras || {};
  const slots = extras?.slots || [];

  const currentTurn = (s.turn || 0) + 1;
  if (turnLimit && currentTurn > turnLimit) throw new Error('턴 제한 초과');
  if (!Array.isArray(slots) || slots.length < 2)
    throw new Error('배틀을 진행할 슬롯이 부족합니다.');

  const attacker = slots[Math.floor(Math.random() * slots.length)];
  let defender;
  do {
    defender = slots[Math.floor(Math.random() * slots.length)];
  } while (defender.slot_no === attacker.slot_no);

  let aiResponse = '자동 진행 중...';
  const outcome = Math.random() > 0.5 ? 'attacker_win' : 'defender_win';
  if (aiClient) {
    try {
      const prompt = `턴 ${currentTurn}: ${attacker.role} vs ${defender.role}의 대결을 묘사해주세요.`;
      const completion = await aiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
      });
      aiResponse = completion.choices?.[0]?.message?.content || aiResponse;
    } catch (e) {
      // ignore AI failure
    }
  }

  // 배틀/로그 기록
  const { data: battle } = await supabase
    .from('rank_battles')
    .insert({
      game_id: s.game_id,
      attacker_owner_id: attacker.owner_id || null,
      attacker_hero_ids: attacker.hero_ids || [],
      defender_owner_id: defender.owner_id || null,
      defender_hero_ids: defender.hero_ids || [],
      result: outcome,
      score_delta: 10,
    })
    .select()
    .single();

  if (battle) {
    await supabase.from('rank_battle_logs').insert({
      game_id: s.game_id,
      battle_id: battle.id,
      turn_no: currentTurn,
      prompt: `턴 ${currentTurn}`,
      ai_response: aiResponse,
      meta: { outcome, session_id: sessionId },
    });
  }

  // 세션 턴 업데이트
  await supabase
    .from('rank_sessions')
    .update({ turn: currentTurn, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  // 점수 업데이트 (extras.slots)
  const winner = outcome === 'attacker_win' ? attacker : defender;
  const updatedSlots = slots.map(slt =>
    slt.slot_no === winner.slot_no ? { ...slt, score: (slt.score || 0) + 10 } : slt
  );
  await supabase
    .from('rank_session_meta')
    .update({ extras: { ...(extras || {}), slots: updatedSlots } })
    .eq('session_id', sessionId);

  const sessionEnded = turnLimit && currentTurn >= turnLimit;
  if (sessionEnded) {
    await supabase.from('rank_sessions').update({ status: 'completed' }).eq('id', sessionId);
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

export async function autoAdvanceRealSimulation(supabase, sessionId, turns = 1, aiClient = null) {
  const results = [];
  for (let i = 0; i < turns; i++) {
    try {
      const r = await advanceRealSimulationTurn(supabase, sessionId, aiClient);
      results.push(r);
      if (r.sessionEnded) break;
    } catch (e) {
      results.push({ turn: i + 1, error: e.message });
      break;
    }
  }
  return results;
}

export async function listRealSimulations(supabase) {
  const { data: sessions } = await supabase
    .from('rank_sessions')
    .select('*, rank_session_meta(*), rank_games(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (sessions || []).filter(s => {
    const meta = (s.rank_session_meta && s.rank_session_meta[0]) || null;
    return !!(meta && meta.extras && meta.extras.simulation === true);
  });

  return rows.map(s => {
    const meta = (s.rank_session_meta && s.rank_session_meta[0]) || null;
    return {
      id: s.id,
      game_id: s.game_id,
      mode: s.mode,
      status: s.status,
      turn: s.turn,
      created_at: s.created_at,
      updated_at: s.updated_at,
      turn_limit: meta?.turn_limit || null,
      rank_games: s.rank_games || null,
    };
  });
}

export async function deleteRealSimulation(supabase, sessionId) {
  // 1) 해당 세션 로그에서 battle_id 수집
  const { data: logs } = await supabase.from('rank_battle_logs').select('id, battle_id, meta');
  const battleIds = Array.from(
    new Set(
      (logs || []).filter(l => l.meta && l.meta.session_id === sessionId).map(l => l.battle_id)
    )
  );

  // 2) 해당 로그/배틀 삭제
  if (battleIds.length > 0) {
    await supabase.from('rank_battle_logs').delete().in('battle_id', battleIds);
    await supabase.from('rank_battles').delete().in('id', battleIds);
  }

  // 3) 메타/세션 삭제 (CASCADE)
  await supabase.from('rank_session_meta').delete().eq('session_id', sessionId);
  await supabase.from('rank_sessions').delete().eq('id', sessionId);
}
