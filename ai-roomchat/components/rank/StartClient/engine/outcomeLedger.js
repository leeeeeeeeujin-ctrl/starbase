const RESULT_TOKENS = {
  draw: ['무승부', '무', 'draw', 'stalemate'],
  won: ['승리', '승', 'victory', 'win', 'triumph'],
  lost: ['패배', '패', 'defeat', 'lose', 'loss'],
  eliminated: ['탈락', '퇴장', '추방', 'out', 'eliminate', 'banished', '퇴출'],
};

const META_TOKENS = ['선언', '판정', '결과', '보고', '공지'];

const RESULT_ORDER = ['won', 'lost', 'eliminated'];

function normalizeKey(value) {
  if (!value) return '';
  return String(value).normalize('NFC').replace(/\s+/g, '').toLowerCase();
}

function pickResultToken(text) {
  if (!text) return null;
  const normalized = text.toLowerCase();
  for (const token of RESULT_TOKENS.draw) {
    if (normalized.includes(token.toLowerCase())) {
      return 'draw';
    }
  }
  for (const [key, tokens] of Object.entries(RESULT_TOKENS)) {
    for (const token of tokens) {
      if (!token) continue;
      if (normalized.includes(token.toLowerCase())) {
        return key;
      }
    }
  }
  return null;
}

function sanitizeSegments(line) {
  if (!line) return [];
  const withoutLabel = line.replace(/^(?:결과|Result)\s*[:：-]?/i, '').trim();
  if (!withoutLabel) return [];
  return withoutLabel
    .split(/[\\/\|·]+|,{1}|\s{2,}/)
    .map(segment => segment.trim())
    .filter(Boolean);
}

export function parseResultAssignments(line, fallbackActors = []) {
  if (!line || !line.trim()) return [];
  const normalized = line.trim().toLowerCase();
  if (normalized === '무' || normalized === 'none') {
    return [];
  }

  const segments = sanitizeSegments(line);
  if (!segments.length) {
    return [];
  }

  const assignments = [];
  const fallbackName =
    Array.isArray(fallbackActors) && fallbackActors.length === 1 ? fallbackActors[0] : null;

  segments.forEach(segment => {
    let working = segment;
    if (!working) return;

    const colonMatch = working.match(/^(.*?)\s*[:：-]\s*(.+)$/);
    if (colonMatch) {
      working = `${colonMatch[1].trim()} ${colonMatch[2].trim()}`;
    }

    const result = pickResultToken(working);
    if (!result || result === 'draw') {
      return;
    }

    const resultRegex =
      /(승리|승|victory|win|triumph|패배|패|defeat|lose|loss|탈락|퇴장|추방|out|eliminate|banished|퇴출)/i;
    const match = working.match(resultRegex);

    let heroName = '';
    if (match) {
      const before = working.slice(0, match.index).trim();
      const after = working.slice(match.index + match[0].length).trim();
      heroName = before || after;
    }

    if (!heroName && fallbackName) {
      heroName = fallbackName;
    }

    const normalizedCandidate = normalizeKey(heroName);
    const isMetaToken = META_TOKENS.some(token => normalizeKey(token) === normalizedCandidate);
    if ((!heroName || isMetaToken) && fallbackName) {
      heroName = fallbackName;
    }

    if (!heroName) {
      return;
    }

    assignments.push({
      heroName,
      status: result,
    });
  });

  if (!assignments.length && fallbackName) {
    const inferred = pickResultToken(line);
    if (inferred && inferred !== 'draw') {
      assignments.push({ heroName: fallbackName, status: inferred });
    }
  }

  return assignments;
}

function createEntryFromParticipant(participant, index = 0) {
  const slotIndex = participant?.slotIndex ?? participant?.slot_index ?? participant?.slot_no;
  const numericSlot = Number.isInteger(Number(slotIndex)) ? Number(slotIndex) : null;
  const heroName =
    participant?.hero?.name ||
    participant?.hero_name ||
    participant?.display_name ||
    participant?.name ||
    (numericSlot != null ? `슬롯 ${numericSlot + 1}` : `참가자 ${index + 1}`);
  const ownerIdRaw =
    participant?.owner_id ??
    participant?.ownerId ??
    participant?.ownerID ??
    participant?.owner?.id ??
    null;
  const ownerId = ownerIdRaw != null ? String(ownerIdRaw).trim() || null : null;

  const baseScore = Number.isFinite(Number(participant?.score)) ? Number(participant.score) : null;

  return {
    key:
      participant?.id ||
      participant?.participant_id ||
      participant?.hero_id ||
      (numericSlot != null ? `slot-${numericSlot}` : `participant-${index}`),
    slotIndex: numericSlot,
    heroId:
      participant?.hero?.id ??
      participant?.hero_id ??
      participant?.heroId ??
      participant?.heroes_id ??
      null,
    heroName,
    normalizedHero: normalizeKey(heroName),
    ownerId,
    role: participant?.role || null,
    wins: 0,
    losses: 0,
    eliminated: false,
    result: 'pending',
    history: [],
    lastTurn: null,
    scoreDelta: 0,
    baseScore,
    projectedScore: baseScore,
    lastVariables: [],
    lastActors: [],
    lastResultLine: '',
    inactive: false,
  };
}

function cloneEntry(entry) {
  if (!entry) return null;
  return {
    key: entry.key,
    slotIndex: entry.slotIndex,
    heroId: entry.heroId,
    heroName: entry.heroName,
    normalizedHero: entry.normalizedHero,
    ownerId: entry.ownerId,
    role: entry.role,
    wins: entry.wins,
    losses: entry.losses,
    eliminated: entry.eliminated,
    result: entry.result,
    history: entry.history.map(item => ({ ...item })),
    lastTurn: entry.lastTurn,
    scoreDelta: entry.scoreDelta,
    baseScore: entry.baseScore,
    projectedScore: entry.projectedScore,
    lastVariables: Array.isArray(entry.lastVariables) ? [...entry.lastVariables] : [],
    lastActors: Array.isArray(entry.lastActors) ? [...entry.lastActors] : [],
    lastResultLine: entry.lastResultLine,
    inactive: entry.inactive,
  };
}

function ensureRoleRangeMap(roleSettings = {}) {
  const map = new Map();
  if (Array.isArray(roleSettings)) {
    roleSettings.forEach(entry => {
      if (!entry) return;
      const role = entry.role || entry.name || entry.key || '';
      const normalizedRole = normalizeKey(role);
      if (!normalizedRole) return;
      const min = Number.isFinite(Number(entry.score_delta_min))
        ? Number(entry.score_delta_min)
        : null;
      const max = Number.isFinite(Number(entry.score_delta_max))
        ? Number(entry.score_delta_max)
        : null;
      if (min == null && max == null) return;
      map.set(normalizedRole, {
        role,
        min: min != null ? Math.max(0, Math.floor(min)) : null,
        max: max != null ? Math.max(0, Math.floor(max)) : null,
      });
    });
    return map;
  }
  if (roleSettings && typeof roleSettings === 'object') {
    Object.entries(roleSettings).forEach(([role, range]) => {
      const normalizedRole = normalizeKey(role);
      if (!normalizedRole) return;
      if (range && typeof range === 'object') {
        const min = Number.isFinite(Number(range.min || range.score_delta_min))
          ? Number(range.min || range.score_delta_min)
          : null;
        const max = Number.isFinite(Number(range.max || range.score_delta_max))
          ? Number(range.max || range.score_delta_max)
          : null;
        if (min == null && max == null) return;
        map.set(normalizedRole, {
          role,
          min: min != null ? Math.max(0, Math.floor(min)) : null,
          max: max != null ? Math.max(0, Math.floor(max)) : null,
        });
      }
    });
  }
  return map;
}

export function createOutcomeLedger({ participants = [], roleSettings = {} } = {}) {
  const entries = [];
  const heroMap = new Map();
  const slotMap = new Map();
  const ownerMap = new Map();

  participants.forEach((participant, index) => {
    const entry = createEntryFromParticipant(participant, index);
    entries.push(entry);
    if (entry.normalizedHero) {
      heroMap.set(entry.normalizedHero, entry);
    }
    if (entry.slotIndex != null) {
      slotMap.set(entry.slotIndex, entry);
    }
    if (entry.ownerId) {
      ownerMap.set(entry.ownerId, entry);
    }
  });

  const ledger = {
    entries,
    heroMap,
    slotMap,
    ownerMap,
    roleRanges: ensureRoleRangeMap(roleSettings),
    roleSummary: new Map(),
    completed: false,
    lastCompletionTurn: null,
    lastVariables: [],
    lastActors: [],
    lastResultLine: '',
    gameAverageScore: computeGameAverageScore(entries),
  };

  computeRoleSummary(ledger);
  applyScoreModel(ledger);

  return ledger;
}

function computeGameAverageScore(entries = []) {
  const scores = entries
    .map(entry => (Number.isFinite(entry.baseScore) ? Number(entry.baseScore) : null))
    .filter(value => value != null);
  if (!scores.length) return null;
  const sum = scores.reduce((total, value) => total + value, 0);
  return sum / scores.length;
}

export function syncOutcomeLedger(ledger, { participants = [], roleSettings = {} } = {}) {
  if (!ledger) return false;
  let changed = false;
  const seenKeys = new Set();
  const roleRanges = ensureRoleRangeMap(roleSettings);
  if (roleRanges.size) {
    ledger.roleRanges = roleRanges;
  }

  participants.forEach((participant, index) => {
    if (!participant) return;
    const slotIndex = participant?.slotIndex ?? participant?.slot_index ?? participant?.slot_no;
    const numericSlot = Number.isInteger(Number(slotIndex)) ? Number(slotIndex) : null;
    const normalizedHero = normalizeKey(
      participant?.hero?.name ||
        participant?.hero_name ||
        participant?.display_name ||
        participant?.name ||
        ''
    );

    let entry = null;
    if (normalizedHero && ledger.heroMap.has(normalizedHero)) {
      entry = ledger.heroMap.get(normalizedHero);
    }
    if (!entry && numericSlot != null && ledger.slotMap.has(numericSlot)) {
      entry = ledger.slotMap.get(numericSlot);
    }
    if (!entry && participant?.id) {
      entry = ledger.entries.find(candidate => candidate.key === participant.id);
    }

    if (!entry) {
      const created = createEntryFromParticipant(participant, index);
      ledger.entries.push(created);
      if (created.normalizedHero) {
        ledger.heroMap.set(created.normalizedHero, created);
      }
      if (created.slotIndex != null) {
        ledger.slotMap.set(created.slotIndex, created);
      }
      if (created.ownerId) {
        ledger.ownerMap.set(created.ownerId, created);
      }
      entry = created;
      changed = true;
    } else {
      const heroName =
        participant?.hero?.name ||
        participant?.hero_name ||
        participant?.display_name ||
        participant?.name ||
        entry.heroName;
      const normalizedHeroName = normalizeKey(heroName);
      if (heroName && heroName !== entry.heroName) {
        entry.heroName = heroName;
        entry.normalizedHero = normalizedHeroName;
        changed = true;
      }
      const ownerIdRaw =
        participant?.owner_id ??
        participant?.ownerId ??
        participant?.ownerID ??
        participant?.owner?.id ??
        null;
      const ownerId = ownerIdRaw != null ? String(ownerIdRaw).trim() || null : null;
      if (ownerId && ownerId !== entry.ownerId) {
        entry.ownerId = ownerId;
        ledger.ownerMap.set(ownerId, entry);
        changed = true;
      }
      const baseScore = Number.isFinite(Number(participant?.score))
        ? Number(participant.score)
        : null;
      if (baseScore != null && baseScore !== entry.baseScore) {
        entry.baseScore = baseScore;
        changed = true;
      }
      const roleValue = participant?.role || null;
      if (roleValue !== entry.role) {
        entry.role = roleValue;
        changed = true;
      }
      if (numericSlot != null && numericSlot !== entry.slotIndex) {
        entry.slotIndex = numericSlot;
        ledger.slotMap.set(numericSlot, entry);
        changed = true;
      }
      entry.inactive = false;
    }
    seenKeys.add(entry.key);
  });

  ledger.entries.forEach(entry => {
    if (!seenKeys.has(entry.key)) {
      entry.inactive = true;
    }
  });

  const averageScore = computeGameAverageScore(ledger.entries);
  if (
    averageScore !== ledger.gameAverageScore &&
    !(Number.isNaN(averageScore) && Number.isNaN(ledger.gameAverageScore))
  ) {
    ledger.gameAverageScore = averageScore;
    changed = true;
  }

  if (changed) {
    computeRoleSummary(ledger);
    applyScoreModel(ledger);
  }

  return changed;
}

function updateEntryResult(entry, { status, turn, variables, actors, resultLine }) {
  if (!entry) return false;
  if (!status) return false;

  const normalizedStatus = (() => {
    if (status === 'won' || status === 'lost' || status === 'eliminated') return status;
    if (status === 'win') return 'won';
    if (status === 'lose') return 'lost';
    if (status === 'out') return 'eliminated';
    return status;
  })();

  const lastHistory = entry.history.length ? entry.history[entry.history.length - 1] : null;
  if (lastHistory && lastHistory.turn === turn && lastHistory.status === normalizedStatus) {
    entry.lastTurn = turn;
    entry.lastVariables = Array.isArray(variables) ? [...variables] : [];
    entry.lastActors = Array.isArray(actors) ? [...actors] : [];
    entry.lastResultLine = resultLine || entry.lastResultLine;
    return false;
  }

  if (normalizedStatus === 'won') {
    entry.wins += 1;
    entry.result = 'won';
  } else if (normalizedStatus === 'lost') {
    entry.losses += 1;
    if (entry.result !== 'won') {
      entry.result = 'lost';
    }
  } else if (normalizedStatus === 'eliminated') {
    entry.losses += 1;
    entry.eliminated = true;
    if (entry.result !== 'won') {
      entry.result = 'eliminated';
    }
  }

  entry.lastTurn = turn;
  entry.lastVariables = Array.isArray(variables) ? [...variables] : [];
  entry.lastActors = Array.isArray(actors) ? [...actors] : [];
  entry.lastResultLine = resultLine || entry.lastResultLine;
  entry.history.push({
    turn,
    status: normalizedStatus,
    variables: Array.isArray(variables) ? [...variables] : [],
    actors: Array.isArray(actors) ? [...actors] : [],
    resultLine: resultLine || '',
  });

  return true;
}

function computeRoleSummary(ledger) {
  if (!ledger) return;
  const summaryMap = new Map();

  ledger.entries.forEach(entry => {
    const roleKey = normalizeKey(entry.role || `slot-${entry.slotIndex}`);
    if (!summaryMap.has(roleKey)) {
      const range = ledger.roleRanges.get(roleKey) || null;
      summaryMap.set(roleKey, {
        role: entry.role || null,
        key: roleKey,
        entries: [],
        total: 0,
        pending: 0,
        won: 0,
        lost: 0,
        eliminated: 0,
        scoreRange: range
          ? {
              min: range.min != null ? range.min : null,
              max: range.max != null ? range.max : null,
            }
          : null,
      });
    }
    const bucket = summaryMap.get(roleKey);
    bucket.entries.push(entry);
    bucket.total += 1;
    if (entry.result === 'won') {
      bucket.won += 1;
    } else if (entry.result === 'lost') {
      bucket.lost += 1;
    } else if (entry.result === 'eliminated') {
      bucket.eliminated += 1;
      bucket.lost += 1;
    } else {
      bucket.pending += 1;
    }
  });

  summaryMap.forEach(bucket => {
    if (bucket.total === 0) {
      bucket.status = 'pending';
      return;
    }
    if (bucket.pending > 0) {
      bucket.status = 'pending';
      return;
    }
    if (bucket.won > 0 && bucket.lost === 0) {
      bucket.status = 'won';
      return;
    }
    if (bucket.won === 0 && bucket.eliminated === bucket.total) {
      bucket.status = 'lost';
      return;
    }
    if (bucket.won === 0 && bucket.lost > 0) {
      bucket.status = 'lost';
      return;
    }
    bucket.status = bucket.won >= bucket.lost ? 'won' : 'lost';
  });

  ledger.roleSummary = summaryMap;

  const allResolved = Array.from(summaryMap.values()).every(bucket => {
    if (bucket.total === 0) return true;
    return bucket.status && bucket.status !== 'pending';
  });

  if (allResolved) {
    ledger.completed = true;
  }
}

function computeScoreDelta(range, biasRatio, direction) {
  const defaultMin = 20;
  const defaultMax = 40;
  const min = range?.min != null ? Math.max(0, range.min) : defaultMin;
  const max = range?.max != null ? Math.max(min, range.max) : Math.max(min, defaultMax);
  const span = Math.max(0, max - min);

  const clamped = Math.max(-1, Math.min(1, biasRatio));
  const normalized = (1 - clamped) / 2; // 0..1, 낮을수록 강자
  if (direction === 'positive') {
    return Math.round(min + span * normalized);
  }
  return -Math.round(min + span * (1 - normalized));
}

function applyScoreModel(ledger, { brawlEnabled = false } = {}) {
  if (!ledger) return;
  const averageScore = ledger.gameAverageScore;
  const roleStats = ledger.roleSummary;

  ledger.entries.forEach(entry => {
    const roleKey = normalizeKey(entry.role || `slot-${entry.slotIndex}`);
    const bucket = roleStats.get(roleKey);
    const entries = bucket?.entries || [];
    const roleAverage = (() => {
      const scores = entries
        .map(candidate =>
          Number.isFinite(candidate.baseScore) ? Number(candidate.baseScore) : null
        )
        .filter(value => value != null);
      if (!scores.length) return averageScore;
      const sum = scores.reduce((total, value) => total + value, 0);
      return sum / scores.length;
    })();

    let biasRatio = 0;
    if (averageScore != null && roleAverage != null && averageScore !== 0) {
      biasRatio = (roleAverage - averageScore) / Math.abs(averageScore);
    }

    const positiveDelta = computeScoreDelta(bucket?.scoreRange, biasRatio, 'positive');
    const negativeDelta = computeScoreDelta(bucket?.scoreRange, biasRatio, 'negative');

    let delta = 0;
    if (entry.result === 'won') {
      const winCount = Math.max(1, entry.wins || 1);
      delta = positiveDelta * winCount;
    } else if (entry.result === 'lost') {
      const lossCount = Math.max(1, entry.losses || 1);
      delta = negativeDelta * lossCount;
    } else if (entry.result === 'eliminated') {
      if (brawlEnabled) {
        const winBonus = Math.max(0, entry.wins);
        delta = positiveDelta * winBonus + negativeDelta;
      } else {
        const lossCount = Math.max(1, entry.losses || 1);
        delta = negativeDelta * lossCount;
      }
    } else {
      delta = 0;
    }

    entry.scoreDelta = delta;
    entry.projectedScore = Number.isFinite(entry.baseScore) ? entry.baseScore + delta : delta;
  });
}

export function recordOutcomeLedger(
  ledger,
  {
    turn,
    slotIndex = null,
    resultLine = '',
    variables = [],
    actors = [],
    participantsSnapshot = [],
    brawlEnabled = false,
  } = {}
) {
  if (!ledger || !turn) {
    return { changed: false };
  }

  syncOutcomeLedger(ledger, { participants: participantsSnapshot });

  const assignments = parseResultAssignments(resultLine, actors);
  if (!assignments.length) {
    ledger.lastVariables = Array.isArray(variables) ? [...variables] : [];
    ledger.lastActors = Array.isArray(actors) ? [...actors] : [];
    ledger.lastResultLine = resultLine || ledger.lastResultLine;
    return { changed: false };
  }

  const processedKeys = new Set();
  let changed = false;

  assignments.forEach(assignment => {
    if (!assignment || !assignment.heroName) return;
    const normalizedHero = normalizeKey(assignment.heroName);
    let entry = normalizedHero ? ledger.heroMap.get(normalizedHero) : null;
    if (!entry && Number.isInteger(Number(slotIndex))) {
      entry = ledger.slotMap.get(Number(slotIndex)) || null;
    }
    if (!entry && actors.length === 1) {
      const fallbackKey = normalizeKey(actors[0]);
      entry = fallbackKey ? ledger.heroMap.get(fallbackKey) : null;
    }
    if (!entry) return;
    if (processedKeys.has(entry.key)) {
      return;
    }
    processedKeys.add(entry.key);
    const updated = updateEntryResult(entry, {
      status: assignment.status,
      turn,
      variables,
      actors,
      resultLine,
    });
    if (updated) {
      changed = true;
    }
  });

  if (!changed) {
    ledger.lastVariables = Array.isArray(variables) ? [...variables] : [];
    ledger.lastActors = Array.isArray(actors) ? [...actors] : [];
    ledger.lastResultLine = resultLine || ledger.lastResultLine;
    return { changed: false };
  }

  computeRoleSummary(ledger);
  applyScoreModel(ledger, { brawlEnabled });

  ledger.lastVariables = Array.isArray(variables) ? [...variables] : [];
  ledger.lastActors = Array.isArray(actors) ? [...actors] : [];
  ledger.lastResultLine = resultLine || ledger.lastResultLine;

  if (ledger.completed && !ledger.lastCompletionTurn) {
    ledger.lastCompletionTurn = turn;
  }

  return { changed: true, completed: ledger.completed };
}

function deriveOverallResult(ledger) {
  if (!ledger || !ledger.completed) return 'pending';
  let wins = 0;
  let losses = 0;
  ledger.roleSummary.forEach(bucket => {
    if (bucket.status === 'won') wins += 1;
    else if (bucket.status === 'lost') losses += 1;
  });
  if (wins > 0 && losses === 0) return 'won';
  if (losses > 0 && wins === 0) return 'lost';
  if (wins === losses) return 'draw';
  return wins > losses ? 'won' : 'lost';
}

export function buildOutcomeSnapshot(ledger) {
  if (!ledger) {
    return {
      entries: [],
      bySlotIndex: {},
      byOwnerId: {},
      byHeroName: {},
      roleSummaries: [],
      completed: false,
      completedTurn: null,
      lastVariables: [],
      lastActors: [],
      lastResultLine: '',
      overallResult: 'pending',
    };
  }

  const entries = ledger.entries.map(entry => cloneEntry(entry));
  const bySlotIndex = {};
  const byOwnerId = {};
  const byHeroName = {};
  entries.forEach(entry => {
    if (entry.slotIndex != null) {
      bySlotIndex[entry.slotIndex] = entry;
    }
    if (entry.ownerId) {
      byOwnerId[entry.ownerId] = entry;
    }
    if (entry.heroName) {
      byHeroName[normalizeKey(entry.heroName)] = entry;
    }
  });

  const roleSummaries = Array.from(ledger.roleSummary.values()).map(bucket => ({
    role: bucket.role,
    key: bucket.key,
    total: bucket.total,
    pending: bucket.pending,
    won: bucket.won,
    lost: bucket.lost,
    eliminated: bucket.eliminated,
    status: bucket.status,
    scoreRange: bucket.scoreRange
      ? {
          min: bucket.scoreRange.min != null ? bucket.scoreRange.min : null,
          max: bucket.scoreRange.max != null ? bucket.scoreRange.max : null,
        }
      : null,
  }));

  return {
    entries,
    bySlotIndex,
    byOwnerId,
    byHeroName,
    roleSummaries,
    completed: ledger.completed,
    completedTurn: ledger.lastCompletionTurn,
    lastVariables: Array.isArray(ledger.lastVariables) ? [...ledger.lastVariables] : [],
    lastActors: Array.isArray(ledger.lastActors) ? [...ledger.lastActors] : [],
    lastResultLine: ledger.lastResultLine,
    overallResult: deriveOverallResult(ledger),
    averageScore: ledger.gameAverageScore,
  };
}

export function sortEntriesByOutcome(entries = []) {
  const weight = entry => {
    if (!entry) return 0;
    const index = RESULT_ORDER.indexOf(entry.result);
    if (index >= 0) return index;
    return 99;
  };
  return [...entries].sort((a, b) => {
    const weightA = weight(a);
    const weightB = weight(b);
    if (weightA !== weightB) return weightA - weightB;
    if (a.slotIndex != null && b.slotIndex != null) return a.slotIndex - b.slotIndex;
    return a.heroName.localeCompare(b.heroName);
  });
}
