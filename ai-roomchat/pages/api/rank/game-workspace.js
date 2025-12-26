import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const gameId = typeof req.query.gameId === 'string' ? req.query.gameId.trim() : '';
  if (!gameId) {
    return res.status(400).json({ ok: false, error: 'missing_game_id' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ ok: false, error: 'supabase_not_configured' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('rank_game_workspaces')
      .select('*')
      .eq('game_id', gameId)
      .limit(1);

    if (error) {
      // Missing table or other DB error – surface as generic failure.
      // This API should be best-effort; 메인게임 동작을 막지는 않는다.
      return res
        .status(500)
        .json({ ok: false, error: 'db_error', detail: error.message });
    }

    let row = Array.isArray(data) && data.length ? data[0] : null;

    // hooks_source 가 비어 있거나, 기본 워크스페이스 스텁(/game/hooks/automation.js)에서
    // 그대로 복사된 경우라면, 워크스페이스 공용 텍스트 배틀 훅을 기본값으로 주입한다.
    if (row) {
      const rawHooks = typeof row.hooks_source === 'string' ? row.hooks_source : '';
      const trimmed = rawHooks.trim();

      // CodeWorkspaceProvider 기본 훅 스텁의 시그니처 조각들
      const isStub =
        trimmed.length > 0 &&
        (trimmed.includes('기본 텍스트 배틀용 /game/hooks/automation.js') ||
          trimmed.includes('User automation hooks for the prompt-graph runtime.'));

      if (!trimmed || isStub) {
        try {
          const baseDir = process.cwd();
          const hooksPath = path.join(baseDir, 'workspace', 'hooks', 'automation.js');
          const hooksSource = fs.readFileSync(hooksPath, 'utf8');
          row = { ...row, hooks_source: hooksSource };
        } catch {
          // 훅 소스를 읽지 못해도 rank_game_workspaces 행 자체는 그대로 반환한다.
        }
      }
    }

    return res.status(200).json({ ok: true, workspace: row });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, error: 'unexpected_error', detail: e?.message || String(e) });
  }
}
