// lib/workspace/syncPromptGraphToVfs.js
//
// Studio → workspace 단방향 sync 헬퍼:
// Supabase의 prompt graph (sets/slots/bridges)를 읽어서
// /graph/prompt-graph.json + /game/runtime.config.json.entryNode 를 생성한다.

import { supabase } from '../supabase';
import { withTableQuery } from '../supabaseTables';

/**
 * Supabase에서 prompt set의 그래프 데이터를 읽어온다.
 * @param {string} setId - prompt_sets.id
 * @returns {Promise<{ slots: Array, bridges: Array, startSlotId: string|null }>}
 */
export async function fetchPromptGraph(setId) {
  if (!setId) {
    return { slots: [], bridges: [], startSlotId: null };
  }

  try {
    const [slotsRes, bridgesRes] = await Promise.all([
      withTableQuery(supabase, 'prompt_slots', (from) =>
        from.select('*').eq('set_id', setId).order('slot_no', { ascending: true })
      ),
      withTableQuery(supabase, 'prompt_bridges', (from) =>
        from.select('*').eq('from_set', setId).order('priority', { ascending: false })
      ),
    ]);

    const slots = slotsRes?.data || [];
    const bridges = bridgesRes?.data || [];

    // 시작 슬롯 찾기
    const startSlot = slots.find((s) => s.is_start === true);
    const startSlotId = startSlot ? String(startSlot.id) : null;

    return { slots, bridges, startSlotId };
  } catch (err) {
    console.warn('[syncPromptGraphToVfs] fetchPromptGraph failed', err);
    return { slots: [], bridges: [], startSlotId: null };
  }
}

/**
 * Supabase 그래프 데이터를 /graph/prompt-graph.json 형태로 변환한다.
 * @param {{ slots: Array, bridges: Array }} graph
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildGraphJson(graph) {
  const { slots = [], bridges = [] } = graph;

  const nodes = slots.map((slot) => ({
    id: `n${slot.id}`,
    type: slot.slot_type || 'prompt',
    label: slot.template ? slot.template.slice(0, 50) : `Slot ${slot.slot_no || slot.id}`,
    data: {
      slotId: slot.id,
      slotNo: slot.slot_no,
      slotType: slot.slot_type,
      template: slot.template,
      invisible: slot.invisible,
      visibleSlots: slot.visible_slots,
    },
  }));

  const edges = bridges
    .filter((b) => b.from_slot_id && b.to_slot_id)
    .map((b) => ({
      id: `e${b.id}`,
      source: `n${b.from_slot_id}`,
      target: `n${b.to_slot_id}`,
      label: buildEdgeLabel(b),
      data: {
        bridgeId: b.id,
        triggerWords: b.trigger_words || [],
        conditions: b.conditions || [],
        priority: b.priority ?? 0,
        probability: b.probability ?? 1,
        fallback: !!b.fallback,
        action: b.action || 'continue',
      },
    }));

  return { nodes, edges };
}

/**
 * 브리지 조건을 간단한 라벨로 변환한다.
 */
function buildEdgeLabel(bridge) {
  const parts = [];
  const conditions = bridge.conditions || [];

  conditions.forEach((cond) => {
    if (cond.type === 'turn_gte') parts.push(`턴≥${cond.value}`);
    if (cond.type === 'turn_lte') parts.push(`턴≤${cond.value}`);
    if (cond.type === 'prev_ai_contains') parts.push(`AI응답:"${cond.value}"`);
    if (cond.type === 'fallback') parts.push('Fallback');
  });

  if (bridge.probability != null && bridge.probability !== 1) {
    parts.push(`확률${Math.round(bridge.probability * 100)}%`);
  }

  return parts.join(' | ');
}

/**
 * 워크스페이스 파일 배열을 생성/업데이트한다.
 * @param {Array} files - 기존 워크스페이스 파일 배열
 * @param {string} setId - prompt_sets.id
 * @returns {Promise<Array>} 업데이트된 파일 배열
 */
export async function syncPromptGraphToVfs(files, setId) {
  if (!setId) return files;

  const graph = await fetchPromptGraph(setId);
  const { nodes, edges } = buildGraphJson(graph);
  const graphContent = JSON.stringify({ nodes, edges }, null, 2) + '\n';

  // /graph/prompt-graph.json 생성/업데이트
  const updatedFiles = [...files];
  const graphPath = '/graph/prompt-graph.json';
  const graphIndex = updatedFiles.findIndex((f) => f.path === graphPath);

  if (graphIndex >= 0) {
    updatedFiles[graphIndex] = {
      ...updatedFiles[graphIndex],
      content: graphContent,
    };
  } else {
    updatedFiles.push({
      path: graphPath,
      content: graphContent,
      language: 'json',
    });
  }

  // /game/runtime.config.json 의 entryNode 업데이트
  if (graph.startSlotId) {
    const runtimeConfigPath = '/game/runtime.config.json';
    const configIndex = updatedFiles.findIndex((f) => f.path === runtimeConfigPath);

    if (configIndex >= 0) {
      try {
        const existing = JSON.parse(updatedFiles[configIndex].content || '{}');
        existing.entryNode = `n${graph.startSlotId}`;
        updatedFiles[configIndex] = {
          ...updatedFiles[configIndex],
          content: JSON.stringify(existing, null, 2) + '\n',
        };
      } catch (err) {
        console.warn('[syncPromptGraphToVfs] failed to update runtime.config.json', err);
      }
    } else {
      // runtime.config.json 이 없으면 기본값으로 생성
      const defaultConfig = {
        engine: 'builtin',
        mode: 'turn',
        entryNode: `n${graph.startSlotId}`,
        roles: ['players', 'observers'],
        turnTimer: {
          timeoutSec: 60,
          roleThreshold: 1,
          requiredRoles: ['players'],
        },
      };
      updatedFiles.push({
        path: runtimeConfigPath,
        content: JSON.stringify(defaultConfig, null, 2) + '\n',
        language: 'json',
      });
    }
  }

  return updatedFiles;
}
