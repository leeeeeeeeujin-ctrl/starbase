// Workspace → rank_game_workspaces snapshot helpers
// -----------------------------------------------
// 워크스페이스 파일 맵에서 텍스트 런타임에 필요한 핵심 파일들을 추려
// Supabase rank_game_workspaces.* 컬럼 형태로 변환한다.
//
// - /template.json             → template (jsonb)
// - /graph/prompt-graph.json  → graph (jsonb)
// - /game/runtime.config.json → runtime_config (jsonb)
// - /game/hooks/automation.js → hooks_source (text)
// - /game/ui.shell.json       → ui_shell (jsonb, optional)

function safeParseJson(text) {
  try {
    const obj = JSON.parse(String(text || '{}'));
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function extractUiShellFromFiles(files = {}) {
  const raw = files['/game/ui.shell.json'];
  if (!raw || typeof raw.content !== 'string') return null;
  const obj = safeParseJson(raw.content);
  return Object.keys(obj).length > 0 ? obj : null;
}

export function buildRankGameWorkspaceSnapshot(files = {}) {
  const templateFile = files['/template.json'];
  const graphFile = files['/graph/prompt-graph.json'];
  const runtimeFile = files['/game/runtime.config.json'];
  const hooksFile = files['/game/hooks/automation.js'];

  const snapshot = {
    template: templateFile ? safeParseJson(templateFile.content) : null,
    graph: graphFile ? safeParseJson(graphFile.content) : null,
    runtime_config: runtimeFile ? safeParseJson(runtimeFile.content) : null,
    hooks_source: hooksFile ? String(hooksFile.content ?? '') : null,
    ui_shell: extractUiShellFromFiles(files),
  };

  return snapshot;
}

