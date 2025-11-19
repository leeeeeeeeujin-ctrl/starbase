/**
 * simpleMatchEngine
 *
 * 텍스트 배틀 1세대(소규모 인원, 역할/슬롯 기반) 매칭을
 * DB 없이도 실험·디버그할 수 있는 얇은 래퍼입니다.
 *
 * - 입력: "역할 구성" + "후보 리스트"
 * - 내부: 기존 `matchRankParticipants` 알고리즘을 그대로 사용
 * - 출력: 어떤 후보가 어떤 슬롯/역할로 배정되었는지에 대한 계획 객체
 *
 * 이 모듈은:
 * - 순수 함수만 제공하므로 Node 스크립트나 브라우저 양쪽에서 안전하게 사용할 수 있고,
 * - Supabase 테이블에서 읽어온 데이터를 JS 객체로 변환한 뒤 그대로 넣어 테스트할 수 있습니다.
 */

import { matchRankParticipants } from './matching';

/**
 * 간단한 역할 정의를 정상화한다.
 *
 * 허용 입력 예:
 * - ['공격', '수비'] → 각 1슬롯
 * - [{ name: '공격', slotCount: 1 }, { name: '수비', slotCount: 1 }]
 * - `rank_game_roles` / `/game/roles.rank.json`에서 가져온 객체 배열
 */
export function normalizeSimpleRoles(rawRoles) {
  if (!Array.isArray(rawRoles)) return [];
  const result = [];

  for (const raw of rawRoles) {
    if (!raw) continue;

    if (typeof raw === 'string') {
      // 문자열만 주어진 경우 슬롯 1개짜리 역할로 취급
      result.push({ name: raw, slotCount: 1 });
      continue;
    }

    const name =
      typeof raw.name === 'string'
        ? raw.name
        : typeof raw.role === 'string'
          ? raw.role
          : null;
    const slotCountValue =
      raw.slotCount ?? raw.slot_count ?? raw.slots ?? raw.capacity ?? 0;
    const slotCount = Number.isFinite(Number(slotCountValue))
      ? Math.max(0, Number(slotCountValue))
      : 0;

    if (!name || slotCount <= 0) continue;

    // `/game/roles.rank.json`의 `{ active: false }` 역할은 무시
    if (raw.active === false) continue;

    result.push({ name, slotCount });
  }

  return result;
}

/**
 * 간단한 큐 엔트리를 매칭 엔진이 기대하는 형태에 가깝게 정리한다.
 *
 * 허용 입력 예:
 * - { id, userId, role, score, joinedAt, heroId }
 * - rank_match_queue에서 SELECT 한 행을 그대로 JS 객체로 옮긴 것
 */
export function normalizeSimpleQueue(candidates) {
  if (!Array.isArray(candidates)) return [];

  const result = [];

  for (const entry of candidates) {
    if (!entry) continue;

    const role =
      entry.role ??
      entry.role_name ??
      entry.roleName ??
      (typeof entry.desiredRole === 'string' ? entry.desiredRole : null);
    if (!role) continue;

    const scoreValue =
      entry.score ??
      entry.rating ??
      entry.mmr ??
      entry.rank_score ??
      entry.rankScore ??
      null;
    const numericScore = Number(scoreValue);
    const score = Number.isFinite(numericScore) ? numericScore : 1000;

    const joinedRaw =
      entry.joinedAt ??
      entry.joined_at ??
      entry.created_at ??
      entry.enqueuedAt ??
      Date.now();
    const joinedTimestamp =
      typeof joinedRaw === 'number'
        ? joinedRaw
        : Date.parse(joinedRaw) || Date.now();

    const heroId =
      entry.hero_id ??
      entry.heroId ??
      (entry.hero && entry.hero.id != null ? entry.hero.id : null);

    result.push({
      // 매칭 알고리즘은 `entry`를 그대로 보존하므로 원본도 함께 넣어둔다.
      entry,
      role,
      score,
      joinedAt: joinedTimestamp,
      hero_id: heroId,
      owner_id: entry.owner_id ?? entry.ownerId ?? null,
      partyKey: entry.partyKey ?? entry.party_key ?? null,
      groupKey: entry.groupKey ?? null,
    });
  }

  return result;
}

/**
 * 간단한 1회차 매칭 실행.
 *
 * @param {Object} params
 * @param {Array} params.roles   역할/슬롯 정의 (문자열 또는 객체 배열)
 * @param {Array} params.queue   후보 리스트
 * @param {Array} [params.scoreWindows] 점수 허용 구간 배열(예: [100, 200])
 *
 * @returns {Object} matchRankParticipants와 동일한 결과 형태에,
 *                   디버그용 요약 필드 `debug`가 추가된 객체
 */
export function runSimpleMatch({ roles, queue, scoreWindows } = {}) {
  const normalizedRoles = normalizeSimpleRoles(roles);
  const normalizedQueue = normalizeSimpleQueue(queue);

  const result = matchRankParticipants({
    roles: normalizedRoles,
    queue: normalizedQueue,
    scoreWindows,
  });

  return {
    ...result,
    debug: {
      roleSummary: normalizedRoles.map(role => ({
        name: role.name,
        slots: role.slotCount,
      })),
      queueSummary: normalizedQueue.map(candidate => ({
        role: candidate.role,
        score: candidate.score,
        joinedAt: candidate.joinedAt,
        ownerId: candidate.owner_id ?? null,
      })),
    },
  };
}

