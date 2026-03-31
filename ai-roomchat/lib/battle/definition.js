import { parseTurnTemplate } from './turnTemplate';

function normalizeNodeId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function mapSlotTypeToTurnKind(slotType = 'ai') {
  if (slotType === 'user_action') return 'user';
  if (slotType === 'system') return 'system';
  return 'ai';
}

function normalizeParticipantScope(scope = []) {
  if (!Array.isArray(scope)) return [];
  return scope.map(value => String(value || '').trim()).filter(Boolean);
}

function buildTurnDefinition(node) {
  const nodeId = normalizeNodeId(node?.id);
  const slotType = node?.data?.slot_type || node?.slot_type || 'ai';
  const parsed = parseTurnTemplate(node?.data?.template ?? node?.template ?? '', slotType);
  const template = typeof parsed.body === 'string' ? parsed.body : '';
  const meta = parsed.meta || {};

  return {
    id: nodeId,
    title: meta.title || node?.data?.name || node?.data?.title || '',
    kind: mapSlotTypeToTurnKind(slotType),
    slotType,
    isStart: Boolean(node?.data?.isStart ?? node?.is_start),
    promptTemplate: template,
    display: meta.display || '',
    input: {
      mode: meta.inputMode || 'none',
      label: meta.inputLabel || '',
      placeholder: meta.inputPlaceholder || '',
      resultKey: meta.resultKey || '',
    },
    participantScope: normalizeParticipantScope(meta.participantScope),
    visibility: {
      invisible: Boolean(node?.data?.invisible ?? node?.invisible),
      visibleSlots: Array.isArray(node?.data?.visible_slots ?? node?.visible_slots)
        ? (node?.data?.visible_slots ?? node?.visible_slots)
            .map(value => Number(value))
            .filter(value => Number.isFinite(value))
        : [],
    },
    variableRules: {
      global: node?.data?.var_rules_global ?? node?.var_rules_global ?? null,
      local: node?.data?.var_rules_local ?? node?.var_rules_local ?? null,
    },
  };
}

function buildTransitionDefinition(edge) {
  return {
    id: normalizeNodeId(edge?.id),
    from: normalizeNodeId(edge?.source),
    to: normalizeNodeId(edge?.target),
    label: edge?.label || '',
    action: edge?.data?.action || edge?.action || 'continue',
    triggerWords: Array.isArray(edge?.data?.trigger_words ?? edge?.trigger_words)
      ? edge?.data?.trigger_words ?? edge?.trigger_words
      : [],
    conditions: Array.isArray(edge?.data?.conditions ?? edge?.conditions)
      ? edge?.data?.conditions ?? edge?.conditions
      : [],
    priority: Number.isFinite(Number(edge?.data?.priority ?? edge?.priority))
      ? Number(edge?.data?.priority ?? edge?.priority)
      : 0,
    probability: Number.isFinite(Number(edge?.data?.probability ?? edge?.probability))
      ? Number(edge?.data?.probability ?? edge?.probability)
      : 1,
    fallback: Boolean(edge?.data?.fallback ?? edge?.fallback),
  };
}

export function buildBattleDefinitionFromGraph({ setInfo = null, nodes = [], edges = [] } = {}) {
  const turnDefinitions = Array.isArray(nodes) ? nodes.map(buildTurnDefinition) : [];
  const transitionDefinitions = Array.isArray(edges) ? edges.map(buildTransitionDefinition) : [];
  const startTurn = turnDefinitions.find(turn => turn.isStart) || turnDefinitions[0] || null;

  return {
    version: 1,
    id: setInfo?.id ? String(setInfo.id) : '',
    name: setInfo?.name || '',
    description: setInfo?.description || '',
    entryTurnId: startTurn?.id || '',
    turns: turnDefinitions,
    transitions: transitionDefinitions,
  };
}
