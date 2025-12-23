// Client-side helper to publish a runtime workspace snapshot for a rank game.
//
// This is used by the Maker editor after saving a prompt set + workspace VFS,
// so that 텍스트 배틀 메인게임(StartClient) can consume runtime_config/hooks/ui_shell
// from rank_game_workspaces without duplicating the full prompt graph.

import { supabase } from '../supabase';
import { applySupabaseAccessToken, requireSupabaseAccessToken } from '../api/authHeaders';

function pickWorkspaceSnapshot(filesMap) {
  if (!filesMap || typeof filesMap !== 'object') return null;

  const snapshot = {};

  try {
    const templateMeta = filesMap['/template.json'];
    if (templateMeta && typeof templateMeta.content === 'string') {
      try {
        snapshot.template = JSON.parse(templateMeta.content || '{}');
      } catch {
        snapshot.template = null;
      }
    }

    const graphMeta = filesMap['/graph/prompt-graph.json'];
    if (graphMeta && typeof graphMeta.content === 'string') {
      try {
        snapshot.graph = JSON.parse(graphMeta.content || '{}');
      } catch {
        snapshot.graph = null;
      }
    }

    const runtimeMeta = filesMap['/game/runtime.config.json'];
    if (runtimeMeta && typeof runtimeMeta.content === 'string') {
      try {
        snapshot.runtime_config = JSON.parse(runtimeMeta.content || '{}');
      } catch {
        snapshot.runtime_config = null;
      }
    }

    const uiShellMeta = filesMap['/game/ui.shell.json'] || filesMap['/game/ui.shell.jsonc'];
    if (uiShellMeta && typeof uiShellMeta.content === 'string') {
      try {
        snapshot.ui_shell = JSON.parse(uiShellMeta.content || '{}');
      } catch {
        snapshot.ui_shell = null;
      }
    }
  } catch {
    // 실패해도 전체 publish 흐름을 막지는 않는다.
  }

  const hasAnyUsefulField =
    (snapshot.template && Object.keys(snapshot.template || {}).length > 0) ||
    (snapshot.graph && Object.keys(snapshot.graph || {}).length > 0) ||
    (snapshot.runtime_config && Object.keys(snapshot.runtime_config || {}).length > 0) ||
    (snapshot.ui_shell && Object.keys(snapshot.ui_shell || {}).length > 0);

  if (!hasAnyUsefulField) {
    return null;
  }

  return snapshot;
}

export async function publishRankWorkspaceForPromptSet(setId, filesForSave) {
  const rawSetId = setId && String(setId).trim();
  if (!rawSetId) return;

  const workspace = pickWorkspaceSnapshot(filesForSave || {});
  // workspace가 완전히 비어있으면 굳이 rank_game_workspaces 를 건드리지 않는다.
  if (!workspace) return;

  try {
    // 현재 로그인 사용자 확인
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return;
    }
    const userId = authData.user.id;
    if (!userId) return;

    // 이 prompt_set을 사용하는 랭크 게임 찾기 (owner 기준으로 제한)
    const { data: gameRows, error: gameError } = await supabase
      .from('rank_games')
      .select('id, owner_id, prompt_set_id')
      .eq('prompt_set_id', rawSetId)
      .eq('owner_id', userId)
      .limit(5);

    if (gameError || !Array.isArray(gameRows) || !gameRows.length) {
      return;
    }

    const token = await requireSupabaseAccessToken();
    const baseHeaders = applySupabaseAccessToken(
      { 'Content-Type': 'application/json' },
      token
    );

    await Promise.all(
      gameRows.map((row) =>
        fetch('/api/rank/save-game-workspace', {
          method: 'POST',
          headers: baseHeaders,
          body: JSON.stringify({ gameId: row.id, workspace }),
        }).catch(() => {
          // 개별 게임 publish 실패는 전체 saveAll 을 막지 않는다.
        })
      )
    );
  } catch {
    // best-effort publish; 실패해도 메이커 저장 흐름은 계속된다.
  }
}
