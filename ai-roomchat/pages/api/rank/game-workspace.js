import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function buildFallbackNode(slot, index) {
  return {
    id: `n${slot.id}`,
    type: 'prompt',
    position: {
      x: typeof slot?.canvas_x === 'number' ? slot.canvas_x : 120 + (index % 3) * 380,
      y: typeof slot?.canvas_y === 'number' ? slot.canvas_y : 120 + Math.floor(index / 3) * 260,
    },
    data: {
      template: slot?.template || '',
      slot_type: slot?.slot_type || 'ai',
      slot_pick: slot?.slot_pick || '1',
      isStart: !!slot?.is_start,
      invisible: !!slot?.invisible,
      visible_slots: Array.isArray(slot?.visible_slots) ? slot.visible_slots : [],
      slotNo: Number.isFinite(Number(slot?.slot_no)) ? Number(slot.slot_no) : index + 1,
      var_rules_global: slot?.var_rules_global ?? null,
      var_rules_local: slot?.var_rules_local ?? null,
    },
  };
}

function buildFallbackEdge(bridge) {
  return {
    id: `e${bridge.id}`,
    source: `n${bridge.from_slot_id}`,
    target: `n${bridge.to_slot_id}`,
    label: '',
    data: {
      bridgeId: bridge.id,
      trigger_words: Array.isArray(bridge?.trigger_words) ? bridge.trigger_words : [],
      conditions: Array.isArray(bridge?.conditions) ? bridge.conditions : [],
      priority: Number.isFinite(Number(bridge?.priority)) ? Number(bridge.priority) : 0,
      probability: Number.isFinite(Number(bridge?.probability)) ? Number(bridge.probability) : 1,
      fallback: !!bridge?.fallback,
      action: bridge?.action || 'continue',
    },
  };
}

async function buildWorkspaceFromPromptSet(gameId) {
  const { data: gameRow, error: gameError } = await supabaseAdmin
    .from('rank_games')
    .select('id,name,prompt_set_id')
    .eq('id', gameId)
    .maybeSingle();

  if (gameError || !gameRow?.prompt_set_id) {
    return null;
  }

  const [{ data: promptSetRow }, { data: slotRows }, { data: bridgeRows }] = await Promise.all([
    supabaseAdmin
      .from('prompt_sets')
      .select('id,name,description,battle_config')
      .eq('id', gameRow.prompt_set_id)
      .maybeSingle(),
    supabaseAdmin
      .from('prompt_slots')
      .select('*')
      .eq('set_id', gameRow.prompt_set_id)
      .order('slot_no', { ascending: true }),
    supabaseAdmin
      .from('prompt_bridges')
      .select('*')
      .eq('from_set', gameRow.prompt_set_id)
      .order('priority', { ascending: false }),
  ]);

  const nodes = Array.isArray(slotRows) ? slotRows.map(buildFallbackNode) : [];
  const edges = Array.isArray(bridgeRows) ? bridgeRows.map(buildFallbackEdge) : [];
  if (!nodes.length) {
    return null;
  }

  return {
    game_id: gameId,
    prompt_set_id: gameRow.prompt_set_id,
    game_name: gameRow.name || promptSetRow?.name || '새 게임',
    template: {
      description: promptSetRow?.description || '',
      battleConfig:
        promptSetRow?.battle_config && typeof promptSetRow.battle_config === 'object'
          ? promptSetRow.battle_config
          : {},
    },
    graph: {
      nodes,
      edges,
    },
    runtime_config: {
      battleConfig:
        promptSetRow?.battle_config && typeof promptSetRow.battle_config === 'object'
          ? promptSetRow.battle_config
          : {},
    },
    hooks_source: null,
    ui_shell: null,
  };
}

async function loadGamePromptSetId(gameId) {
  if (!gameId) return null;
  const { data, error } = await supabaseAdmin
    .from('rank_games')
    .select('id,prompt_set_id,name')
    .eq('id', gameId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    promptSetId: data.prompt_set_id || null,
    gameName: data.name || '',
  };
}

async function loadPromptSetBattleConfig(promptSetId) {
  if (!promptSetId) return null;
  const { data, error } = await supabaseAdmin
    .from('prompt_sets')
    .select('id,battle_config')
    .eq('id', promptSetId)
    .maybeSingle();
  if (error || !data) return null;
  return data?.battle_config && typeof data.battle_config === 'object' ? data.battle_config : null;
}

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
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      // Missing table or other DB error – surface as generic failure.
      // This API should be best-effort; 메인게임 동작을 막지는 않는다.
      return res
        .status(500)
        .json({ ok: false, error: 'db_error', detail: error.message });
    }

    let row = Array.isArray(data) && data.length ? data[0] : null;
    const gameMeta = await loadGamePromptSetId(gameId);
    const resolvedPromptSetId =
      row?.prompt_set_id || gameMeta?.promptSetId || null;

    const rowHasGraph =
      Array.isArray(row?.graph?.nodes) && row.graph.nodes.length > 0;

    if (!row || !rowHasGraph) {
      row = await buildWorkspaceFromPromptSet(gameId);
    }

    if (row) {
      row = {
        ...row,
        prompt_set_id: row?.prompt_set_id || resolvedPromptSetId || null,
        game_name: row?.game_name || gameMeta?.gameName || row?.template?.name || '새 게임',
      };
    }

    if (row?.prompt_set_id) {
      const latestBattleConfig = await loadPromptSetBattleConfig(row.prompt_set_id);
      if (latestBattleConfig) {
        row = {
          ...row,
          template: {
            ...(row?.template && typeof row.template === 'object' ? row.template : {}),
            battleConfig: latestBattleConfig,
          },
          runtime_config: {
            ...(row?.runtime_config && typeof row.runtime_config === 'object'
              ? row.runtime_config
              : {}),
            battleConfig: latestBattleConfig,
          },
        };
      }
    }

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
