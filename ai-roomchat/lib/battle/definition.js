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

function normalizeVisibilityScope(scope = []) {
  if (!Array.isArray(scope)) return ['all'];
  const normalized = scope.map(value => String(value || '').trim()).filter(Boolean);
  return normalized.length ? normalized : ['all'];
}

function normalizeRoleEntry(role, index = 0) {
  if (!role || typeof role !== 'object') return null;
  const name = String(role.name || role.id || '').trim();
  if (!name) return null;
  const team = String(role.team || '').trim();
  const limit = Number.isFinite(Number(role.limit)) ? Math.max(1, Number(role.limit)) : 1;
  return {
    id: String(role.id || `role-${index + 1}`).trim(),
    name,
    team,
    limit,
  };
}

export function normalizeBattleConfig(rawConfig = {}) {
  const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const maxPlayers = Number.isFinite(Number(source.maxPlayers))
    ? Math.max(1, Number(source.maxPlayers))
    : 2;
  const minPlayers = Number.isFinite(Number(source.minPlayers))
    ? Math.max(1, Math.min(maxPlayers, Number(source.minPlayers)))
    : 1;
  const mode = String(source.mode || '').trim() === 'multi' ? 'multi' : 'single';
  const roles = Array.isArray(source.roles)
    ? source.roles
        .map((role, index) => normalizeRoleEntry(role, index))
        .filter(Boolean)
    : [];

  return {
    mode,
    minPlayers,
    maxPlayers,
    roles,
  };
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
    visibilityScope: normalizeVisibilityScope(meta.visibilityScope),
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

export function buildBattleDefinitionFromGraph({ setInfo = null, nodes = [], edges = [], config = null } = {}) {
  const turnDefinitions = Array.isArray(nodes) ? nodes.map(buildTurnDefinition) : [];
  const transitionDefinitions = Array.isArray(edges) ? edges.map(buildTransitionDefinition) : [];
  const startTurn = turnDefinitions.find(turn => turn.isStart) || turnDefinitions[0] || null;
  const battleConfig = normalizeBattleConfig(config);

  return {
    version: 1,
    id: setInfo?.id ? String(setInfo.id) : '',
    name: setInfo?.name || '',
    description: setInfo?.description || '',
    mode: battleConfig.mode,
    minPlayers: battleConfig.minPlayers,
    maxPlayers: battleConfig.maxPlayers,
    roles: battleConfig.roles,
    entryTurnId: startTurn?.id || '',
    turns: turnDefinitions,
    transitions: transitionDefinitions,
  };
}
