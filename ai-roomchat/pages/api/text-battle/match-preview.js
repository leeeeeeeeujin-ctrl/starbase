import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';
import { runSimpleMatch } from '../../../lib/rank/simpleMatchEngine.js';

/**
 * 텍스트 배틀용 간단 매칭 프리뷰 API (dev/debug)
 *
 * - 입력: gameId (필수), mode(선택)
 * - 처리:
 *   - rank_game_roles / rank_match_queue에서 현재 역할/대기열 상태를 읽어온 뒤
 *   - lib/rank/simpleMatchEngine.runSimpleMatch(...)로 1회 매칭 계획을 계산한다.
 * - 출력:
 *   - roles, queue 요약 + 매칭 결과(result)와 디버그 정보(debug)를 JSON으로 반환
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const { gameId, game_id, mode } = req.query || {};
  const gid = gameId || game_id || null;

  if (!gid) {
    return res
      .status(400)
      .json({ ok: false, error: 'missing_game_id', message: 'gameId 쿼리 파라미터가 필요합니다.' });
  }

  if (!supabaseAdmin || typeof supabaseAdmin.from !== 'function') {
    return res
      .status(500)
      .json({ ok: false, error: 'supabase_not_configured' });
  }

  try {
    // 1) 역할 구성 로드 (rank_game_roles)
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('rank_game_roles')
      .select('name, slot_count, active')
      .eq('game_id', gid)
      .order('id', { ascending: true });

    if (rolesError) {
      return res.status(500).json({
        ok: false,
        error: 'roles_query_failed',
        detail: rolesError.message || null,
      });
    }

    // 2) 대기열 로드 (rank_match_queue)
    let queueQuery = supabaseAdmin
      .from('rank_match_queue')
      .select(
        'id, game_id, owner_id, hero_id, role, score, joined_at, mode, status'
      )
      .eq('game_id', gid)
      .eq('status', 'waiting');

    if (mode) {
      queueQuery = queueQuery.eq('mode', mode);
    }

    const { data: queue, error: queueError } = await queueQuery;

    if (queueError) {
      return res.status(500).json({
        ok: false,
        error: 'queue_query_failed',
        detail: queueError.message || null,
      });
    }

    // 3) JS 매칭 엔진으로 1회 매칭 계획 계산
    const result = runSimpleMatch({
      roles: roles || [],
      queue: queue || [],
      // scoreWindows는 일단 기본값 사용; 필요 시 쿼리 파라미터로 확장 가능
    });

    return res.status(200).json({
      ok: true,
      gameId: gid,
      mode: mode || null,
      roles: Array.isArray(roles) ? roles : [],
      queue: Array.isArray(queue) ? queue : [],
      result,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      detail: e?.message || String(e),
    });
  }
}

