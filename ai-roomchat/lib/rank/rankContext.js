import { extractMatchingToggles } from '@/lib/rank/matchingPipeline';

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTrimmedOrNull(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeRules(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Build a unified rank/match context object suitable for injecting into
 * coreRuntime via initialVariables.rank and for use inside hooks
 * as ctx.variables.rank.
 */
export function buildRankContext({ game, session, participants, room } = {}) {
  const sessionId = toTrimmedOrNull(session?.id || session?.session_id);
  const gameMode =
    toTrimmedOrNull(session?.mode) ||
    toTrimmedOrNull(room?.mode) ||
    'rank_shared';

  const rules = normalizeRules(game?.rules);
  const toggles = extractMatchingToggles(game || {}, rules);

  const players = Array.isArray(participants)
    ? participants
        .map((p) => {
          if (!p) return null;
          const ownerId =
            toTrimmedOrNull(p.owner_id) ||
            toTrimmedOrNull(p.ownerId);
          const heroId =
            toTrimmedOrNull(p.hero_id) ||
            toTrimmedOrNull(p.heroId) ||
            toTrimmedOrNull(p.hero?.id);

          if (!ownerId || !heroId) return null;

          const heroName =
            (p.hero && typeof p.hero.name === 'string' && p.hero.name) ||
            (typeof p.hero_name === 'string' && p.hero_name) ||
            (typeof p.heroName === 'string' && p.heroName) ||
            '';

          return {
            ownerId,
            heroId,
            heroName: heroName || '',
            role: typeof p.role === 'string' ? p.role.trim() : '',
            score: toNumberOrNull(p.score),
            rating: toNumberOrNull(p.rating),
          };
        })
        .filter(Boolean)
    : [];

  return {
    sessionId,
    gameMode,
    realtimeEnabled: !!toggles.realtimeEnabled,
    dropInEnabled: !!toggles.dropInEnabled,
    players,
  };
}

