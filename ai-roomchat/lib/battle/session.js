function toId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function toList(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function indexTurns(turns = []) {
  const map = new Map();
  toList(turns).forEach(turn => {
    const id = toId(turn?.id);
    if (!id) return;
    map.set(id, turn);
  });
  return map;
}

function indexParticipants(participants = []) {
  const list = toList(participants)
    .map((participant, index) => {
      const id =
        toId(participant?.id) ||
        toId(participant?.ownerId) ||
        toId(participant?.heroId) ||
        `participant-${index + 1}`;
      return {
        id,
        ownerId: toId(participant?.ownerId),
        heroId: toId(participant?.heroId),
        team: toId(participant?.team),
        role: toId(participant?.role),
        name: participant?.name || participant?.heroName || id,
        meta: participant?.meta && typeof participant.meta === 'object' ? participant.meta : {},
      };
    })
    .filter(Boolean);

  const byId = new Map();
  list.forEach(participant => byId.set(participant.id, participant));
  return { list, byId };
}

function normalizeDefinition(definition) {
  const turns = toList(definition?.turns);
  const transitions = toList(definition?.transitions)
    .map(transition => ({
      ...transition,
      id: toId(transition?.id),
      from: toId(transition?.from),
      to: toId(transition?.to),
      priority: Number.isFinite(Number(transition?.priority)) ? Number(transition.priority) : 0,
      fallback: Boolean(transition?.fallback),
    }))
    .filter(transition => transition.from && transition.to)
    .sort((left, right) => right.priority - left.priority);

  const turnMap = indexTurns(turns);
  const entryTurnId = toId(definition?.entryTurnId) || toId(turns[0]?.id);

  return {
    version: Number.isFinite(Number(definition?.version)) ? Number(definition.version) : 1,
    id: toId(definition?.id),
    name: definition?.name || '',
    description: definition?.description || '',
    entryTurnId,
    turns,
    turnMap,
    transitions,
  };
}

function buildScopeView(session, currentTurn, actorId = '') {
  const { participants } = session;
  const actor = actorId ? participants.byId.get(actorId) || null : null;
  const actorTeam = actor?.team || '';
  const actorRole = actor?.role || '';

  return {
    self: actor ? [actor] : [],
    actor,
    all: participants.list,
    allies: actorTeam ? participants.list.filter(entry => entry.team === actorTeam) : [],
    enemies: actorTeam ? participants.list.filter(entry => entry.team && entry.team !== actorTeam) : [],
    role: actorRole ? participants.list.filter(entry => entry.role === actorRole) : [],
    turn: currentTurn,
  };
}

function matchParticipantScope(scope = [], view) {
  const values = toList(scope);
  if (!values.length) return [];

  const bucket = [];
  values.forEach(entry => {
    if (entry === 'self' || entry === 'actor') {
      if (view.actor) bucket.push(view.actor);
      return;
    }
    if (entry === 'all') {
      bucket.push(...view.all);
      return;
    }
    if (entry === 'allies') {
      bucket.push(...view.allies);
      return;
    }
    if (entry === 'enemies' || entry === 'opponents') {
      bucket.push(...view.enemies);
      return;
    }
    if (entry.startsWith('team:')) {
      const team = entry.slice(5).trim();
      bucket.push(...view.all.filter(participant => participant.team === team));
      return;
    }
    if (entry.startsWith('role:')) {
      const role = entry.slice(5).trim();
      bucket.push(...view.all.filter(participant => participant.role === role));
    }
  });

  const seen = new Set();
  return bucket.filter(participant => {
    if (!participant?.id) return false;
    if (seen.has(participant.id)) return false;
    seen.add(participant.id);
    return true;
  });
}

function selectParticipantsForActorScope(actorScope = 'self', view) {
  const scope = toId(actorScope) || 'self';
  if (scope === 'self' || scope === 'actor') {
    return view.actor ? [view.actor] : [];
  }
  if (scope === 'all') {
    return view.all;
  }
  if (scope === 'allies') {
    return view.allies;
  }
  if (scope === 'enemies' || scope === 'opponents') {
    return view.enemies;
  }
  if (scope.startsWith('team:')) {
    const team = scope.slice(5).trim();
    return view.all.filter(participant => participant.team === team);
  }
  if (scope.startsWith('role:')) {
    const role = scope.slice(5).trim();
    return view.all.filter(participant => participant.role === role);
  }
  return view.actor ? [view.actor] : [];
}

function pickNextTransition({ definition, currentTurnId, resultKey, sessionValues }) {
  const candidates = definition.transitions.filter(transition => transition.from === currentTurnId);
  if (!candidates.length) return null;

  const nonFallback = candidates.filter(transition => !transition.fallback);
  const fallback = candidates.find(transition => transition.fallback) || null;

  const matched = nonFallback.find(transition => {
    const conditions = toList(transition.conditions);
    if (!conditions.length) return true;

    return conditions.every(condition => {
      if (!condition || typeof condition !== 'object') return true;
      const key = toId(condition.key || condition.resultKey || condition.variable);
      if (!key) return true;
      const expected = condition.equals ?? condition.value ?? condition.is ?? null;
      const actual = sessionValues[key];
      return expected == null ? actual != null : actual === expected;
    });
  });

  if (matched) return matched;
  if (resultKey && sessionValues[resultKey] != null) {
    const direct = nonFallback.find(transition => {
      const triggerWords = toList(transition.triggerWords);
      return triggerWords.some(word => String(word).trim() === String(sessionValues[resultKey]).trim());
    });
    if (direct) return direct;
  }
  return fallback;
}

export function createBattleSession({
  definition,
  participants = [],
  sessionId = '',
  actorId = '',
  values = {},
} = {}) {
  const normalizedDefinition = normalizeDefinition(definition);
  const normalizedParticipants = indexParticipants(participants);
  const currentTurn = normalizedDefinition.turnMap.get(normalizedDefinition.entryTurnId) || null;

  return {
    id: toId(sessionId) || `battle-session-${Date.now()}`,
    status: currentTurn ? 'ready' : 'empty',
    actorId: toId(actorId),
    definition: normalizedDefinition,
    participants: normalizedParticipants,
    currentTurnId: currentTurn?.id || '',
    turnIndex: currentTurn ? 0 : -1,
    values: values && typeof values === 'object' ? { ...values } : {},
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function rehydrateBattleSession(session = {}) {
  const rebuilt = createBattleSession({
    definition: session?.definition,
    participants: Array.isArray(session?.participants?.list)
      ? session.participants.list
      : Array.isArray(session?.participants)
        ? session.participants
        : [],
    sessionId: session?.id || '',
    actorId: session?.actorId || '',
    values: session?.values && typeof session.values === 'object' ? session.values : {},
  });

  return {
    ...rebuilt,
    status: session?.status || rebuilt.status,
    currentTurnId: toId(session?.currentTurnId) || rebuilt.currentTurnId,
    turnIndex: Number.isFinite(Number(session?.turnIndex))
      ? Number(session.turnIndex)
      : rebuilt.turnIndex,
    logs: Array.isArray(session?.logs) ? session.logs : rebuilt.logs,
    createdAt: session?.createdAt || rebuilt.createdAt,
    updatedAt: session?.updatedAt || rebuilt.updatedAt,
  };
}

export function getCurrentTurn(session) {
  if (!session?.definition?.turnMap) return null;
  return session.definition.turnMap.get(session.currentTurnId) || null;
}

export function getTurnScopeParticipants(session, turn = getCurrentTurn(session), actorId = session?.actorId) {
  if (!session || !turn) return [];
  const view = buildScopeView(session, turn, actorId);
  return matchParticipantScope(turn.participantScope, view);
}

export function resolveTurnActorId(
  session,
  turn = getCurrentTurn(session),
  fallbackActorId = session?.actorId
) {
  if (!session || !turn) return toId(fallbackActorId);
  const resolvedFallback = toId(fallbackActorId);
  const fallbackActor = resolvedFallback ? session?.participants?.byId?.get(resolvedFallback) || null : null;
  const fallbackView = buildScopeView(session, turn, resolvedFallback);
  if (!fallbackView.actor && fallbackActor) {
    fallbackView.actor = fallbackActor;
  }
  if (!fallbackView.actor && !resolvedFallback && session?.participants?.list?.length) {
    fallbackView.actor = session.participants.list[0];
  }
  const actorScope = turn?.execution?.actorScope || 'self';
  const candidates = selectParticipantsForActorScope(actorScope, fallbackView);
  return toId(candidates[0]?.id || fallbackView.actor?.id || resolvedFallback);
}

export function buildTurnPromptContext(session, turn = getCurrentTurn(session), actorId = session?.actorId) {
  const resolvedActorId = resolveTurnActorId(session, turn, actorId);
  const scopeParticipants = getTurnScopeParticipants(session, turn, resolvedActorId);
  return {
    sessionId: session?.id || '',
    actorId: resolvedActorId,
    turn,
    values: cloneJson(session?.values || {}),
    participants: cloneJson(session?.participants?.list || []),
    scopedParticipants: cloneJson(scopeParticipants),
  };
}

export function submitBattleTurn(session, payload = {}) {
  const currentTurn = getCurrentTurn(session);
  if (!session || !currentTurn) return session;

  const nextValues = {
    ...(session.values || {}),
  };

  const resultKey = currentTurn?.input?.resultKey || '';
  if (resultKey && payload.input != null) {
    nextValues[resultKey] = payload.input;
  }

  const logEntry = {
    turnId: currentTurn.id,
    turnIndex: session.turnIndex,
    title: currentTurn.title || currentTurn.id,
    kind: currentTurn.kind,
    actorId: toId(payload.actorId || session.actorId),
    input: payload.input ?? null,
    result: payload.result ?? null,
    display: currentTurn.display || '',
    promptTemplate: currentTurn.promptTemplate || '',
    createdAt: Date.now(),
  };

  const nextTransition = pickNextTransition({
    definition: session.definition,
    currentTurnId: currentTurn.id,
    resultKey,
    sessionValues: nextValues,
  });
  const nextTurnId = nextTransition?.to || '';
  const nextTurn = nextTurnId ? session.definition.turnMap.get(nextTurnId) || null : null;
  const nextActorId = nextTurn
    ? resolveTurnActorId(session, nextTurn, payload.actorId || session.actorId)
    : toId(payload.actorId || session.actorId);

  return {
    ...session,
    actorId: nextActorId,
    currentTurnId: nextTurn?.id || '',
    turnIndex: nextTurn ? session.turnIndex + 1 : session.turnIndex,
    status: nextTurn ? 'running' : 'completed',
    values: nextValues,
    logs: [...toList(session.logs), logEntry],
    updatedAt: Date.now(),
  };
}
