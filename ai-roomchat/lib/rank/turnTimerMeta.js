'use client';

export const TURN_TIMER_OPTIONS = [15, 30, 60, 120, 180];

export function sanitizeSecondsOption(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}

export function formatSecondsLabel(seconds) {
  const normalized = sanitizeSecondsOption(seconds);
  if (!normalized) return '미정';
  if (normalized < 60) {
    return `${normalized}초`;
  }
  const minutes = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  if (remainder === 0) {
    return `${minutes}분`;
  }
  return `${minutes}분 ${remainder}초`;
}

export function sanitizeTurnTimerVote(vote) {
  const base = {
    selections: {},
    voters: {},
    lastSelection: null,
    updatedAt: 0,
  };
  if (!vote || typeof vote !== 'object') {
    return base;
  }

  const selections =
    vote.selections && typeof vote.selections === 'object' ? vote.selections : vote;
  if (selections && typeof selections === 'object') {
    for (const [key, value] of Object.entries(selections)) {
      const option = sanitizeSecondsOption(key);
      const count = Number(value);
      if (option && Number.isFinite(count) && count > 0) {
        base.selections[String(option)] = Math.floor(count);
      }
    }
  }

  const voters = vote.voters && typeof vote.voters === 'object' ? vote.voters : null;
  if (voters) {
    for (const [key, value] of Object.entries(voters)) {
      const voterId = String(key || '').trim();
      const choice = sanitizeSecondsOption(value);
      if (voterId) {
        base.voters[voterId] = choice;
      }
    }
  }

  const lastSelection = sanitizeSecondsOption(vote.lastSelection);
  if (lastSelection) {
    base.lastSelection = lastSelection;
  }

  const updatedAt = Number(vote.updatedAt);
  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    base.updatedAt = updatedAt;
  }

  return base;
}

export function buildTurnTimerVotePatch(previousVote, selection, voterId) {
  const normalized = sanitizeSecondsOption(selection);
  if (!normalized) {
    return previousVote && typeof previousVote === 'object' ? { ...previousVote } : {};
  }

  const existing = sanitizeTurnTimerVote(previousVote?.turnTimer || previousVote);
  const selections = { ...existing.selections };
  const voters = { ...existing.voters };

  if (voterId) {
    const previousSelection = sanitizeSecondsOption(voters[voterId]);
    if (previousSelection) {
      const key = String(previousSelection);
      if (selections[key] && selections[key] > 0) {
        const decremented = selections[key] - 1;
        if (decremented > 0) {
          selections[key] = decremented;
        } else {
          delete selections[key];
        }
      }
    }
    voters[voterId] = normalized;
  }

  const key = String(normalized);
  selections[key] = (Number(selections[key]) || 0) + 1;

  const now = Date.now();
  const nextVote = previousVote && typeof previousVote === 'object' ? { ...previousVote } : {};

  nextVote.turnTimer = {
    selections,
    voters,
    lastSelection: normalized,
    updatedAt: now,
  };

  return nextVote;
}
