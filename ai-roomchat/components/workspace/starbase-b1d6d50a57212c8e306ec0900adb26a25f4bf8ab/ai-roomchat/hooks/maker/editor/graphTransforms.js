'use client';

import { sanitizeVariableRules } from '../../../lib/variableRules';

export function normalizeVisibleList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(value => Number(value)).filter(value => Number.isFinite(value));
}

export function readSlotPosition(slot, index) {
  const fallbackX = 120 + (index % 3) * 380;
  const fallbackY = 120 + Math.floor(index / 3) * 260;
  const posX = typeof slot?.canvas_x === 'number' ? slot.canvas_x : fallbackX;
  const posY = typeof slot?.canvas_y === 'number' ? slot.canvas_y : fallbackY;
  return { x: posX, y: posY };
}

export function normalizeSlotId(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const str = String(value);
  if (str.startsWith('n')) {
    const num = Number(str.slice(1));
    return Number.isFinite(num) ? num : str;
  }
  const num = Number(str);
  return Number.isFinite(num) ? num : str;
}

export function describeBridge(data) {
  const parts = [];
  const conditions = data?.conditions || [];

  conditions.forEach(condition => {
    if (condition?.type === 'turn_gte' && (condition.value ?? condition.gte) != null) {
      parts.push(`턴 ≥ ${condition.value ?? condition.gte}`);
    }
    if (condition?.type === 'turn_lte' && (condition.value ?? condition.lte) != null) {
      parts.push(`턴 ≤ ${condition.value ?? condition.lte}`);
    }
    if (condition?.type === 'prev_ai_contains') {
      parts.push(`이전응답 "${condition.value}"`);
    }
    if (condition?.type === 'prev_prompt_contains') {
      parts.push(`이전프롬프트 "${condition.value}"`);
    }
    if (condition?.type === 'prev_ai_regex') {
      parts.push(`이전응답 /${condition.pattern}/${condition.flags || ''}`);
    }
    if (condition?.type === 'visited_slot') {
      parts.push(`경유 #${condition.slot_id ?? '?'}`);
    }
    if (condition?.type === 'role_alive_gte') {
      parts.push(`[${condition.role}] 생존≥${condition.count}`);
    }
    if (condition?.type === 'role_dead_gte') {
      parts.push(`[${condition.role}] 탈락≥${condition.count}`);
    }
    if (condition?.type === 'custom_flag_on') {
      parts.push(`변수:${condition.name}=ON`);
    }
    if (condition?.type === 'fallback') {
      parts.push('Fallback');
    }
  });

  if (data?.probability != null && data.probability !== 1) {
    parts.push(`확률 ${Math.round(Number(data.probability) * 100)}%`);
  }
  if (data?.action && data.action !== 'continue') {
    parts.push(`→ ${data.action}`);
  }

  return parts.join(' | ');
}

export function buildPromptNode(slot, index) {
  const flowId = `n${slot.id}`;
  return {
    id: flowId,
    type: 'prompt',
    position: readSlotPosition(slot, index),
    data: {
      template: slot.template || '',
      slot_type: slot.slot_type || 'ai',
      slot_pick: slot.slot_pick || '1',
      isStart: !!slot.is_start,
      invisible: !!slot.invisible,
      visible_slots: normalizeVisibleList(slot.visible_slots),
      slotNo: Number.isFinite(Number(slot.slot_no)) ? Number(slot.slot_no) : index + 1,
      var_rules_global: sanitizeVariableRules(slot.var_rules_global),
      var_rules_local: sanitizeVariableRules(slot.var_rules_local),
    },
  };
}

export function mapSlotRowsToNodes(slotRows = []) {
  const slotMap = new Map();
  const nodes = slotRows.map((slot, index) => {
    const node = buildPromptNode(slot, index);
    slotMap.set(node.id, slot.id);
    return node;
  });
  return { slotMap, nodes };
}

export function createEdgesFromBridges(bridgeRows = []) {
  return bridgeRows
    .filter(bridge => bridge.from_slot_id && bridge.to_slot_id)
    .map(bridge => ({
      id: `e${bridge.id}`,
      source: `n${bridge.from_slot_id}`,
      target: `n${bridge.to_slot_id}`,
      label: describeBridge(bridge),
      data: {
        bridgeId: bridge.id,
        trigger_words: bridge.trigger_words || [],
        conditions: bridge.conditions || [],
        priority: bridge.priority ?? 0,
        probability: bridge.probability ?? 1,
        fallback: !!bridge.fallback,
        action: bridge.action || 'continue',
      },
    }));
}

export function buildEdgeLabel(data) {
  return describeBridge(data);
}
