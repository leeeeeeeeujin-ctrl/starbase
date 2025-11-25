import { supabase as supabaseAnon } from '@/lib/rank/db';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (!supabaseAdmin || !supabaseAnon) {
    return res
      .status(500)
      .json({ ok: false, error: 'supabase_not_configured' });
  }

  // 인증: register-game 과 동일하게 Bearer 토큰 사용
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const {
    data: { user },
    error: userErr,
  } = await supabaseAnon.auth.getUser(token);
  if (userErr || !user) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  let gameId = null;
  let workspace = null;

  try {
    gameId = typeof req.body?.gameId === 'string' ? req.body.gameId.trim() : '';
    workspace = req.body?.workspace ?? null;
  } catch {
    // fall through to validation below
  }

  if (!gameId) {
    return res.status(400).json({ ok: false, error: 'missing_game_id' });
  }
  if (!workspace || typeof workspace !== 'object') {
    return res.status(400).json({ ok: false, error: 'missing_workspace_payload' });
  }

  // 권한: 요청자가 해당 게임의 owner 인지 확인
  const { data: gameRow, error: gameErr } = await supabaseAdmin
    .from('rank_games')
    .select('id, owner_id')
    .eq('id', gameId)
    .single();

  if (gameErr || !gameRow) {
    return res
      .status(404)
      .json({ ok: false, error: 'game_not_found' });
  }

  if (gameRow.owner_id !== user.id) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  // 최소 필드만 추려서 넘긴다 (불필요한 데이터는 버림)
  const payload = {
    template: workspace.template ?? null,
    graph: workspace.graph ?? null,
    runtime_config: workspace.runtime_config ?? null,
    hooks_source: workspace.hooks_source ?? null,
    ui_shell: workspace.ui_shell ?? null,
  };

  try {
    // save_rank_game_workspace RPC가 배포된 경우 우선 사용
    const { error: rpcError } = await supabaseAdmin.rpc(
      'save_rank_game_workspace',
      {
        p_game_id: gameId,
        p_workspace: payload,
      }
    );

    if (!rpcError) {
      return res.status(200).json({ ok: true });
    }

    const missingRpc =
      /save_rank_game_workspace/i.test(rpcError.message || '') &&
      /function/i.test(rpcError.message || '');
    if (!missingRpc) {
      console.warn(
        '[save-game-workspace] RPC failed:',
        rpcError?.message || rpcError
      );
      return res
        .status(500)
        .json({ ok: false, error: 'rpc_failed', detail: rpcError.message });
    }
  } catch (err) {
    console.warn('[save-game-workspace] RPC call threw:', err);
    // fall through to direct upsert
  }

  // RPC 미배포 환경에선 직접 upsert로 폴백
  try {
    const { error: upsertError } = await supabaseAdmin
      .from('rank_game_workspaces')
      .upsert({
        game_id: gameId,
        template: payload.template,
        graph: payload.graph,
        runtime_config: payload.runtime_config,
        hooks_source: payload.hooks_source,
        ui_shell: payload.ui_shell,
      });

    if (upsertError) {
      console.warn(
        '[save-game-workspace] upsert failed:',
        upsertError?.message || upsertError
      );
      return res
        .status(500)
        .json({ ok: false, error: 'upsert_failed', detail: upsertError.message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.warn('[save-game-workspace] unexpected error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'unexpected_error', detail: err?.message || String(err) });
  }
}
