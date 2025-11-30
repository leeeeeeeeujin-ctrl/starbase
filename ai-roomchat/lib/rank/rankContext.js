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
 *
 * NOTE: 기존 필드(sessionId, gameMode, realtimeEnabled, dropInEnabled, players)는
 *       하위 호환을 위해 그대로 유지하고, 새 구조(game/session/viewer/toggles)는
 *       에디터/훅에서 사용하는 권장 경로로 추가한다.
 */
export function buildRankContext({ game, session, participants, room, viewer } = {}) {
  const gameId = toTrimmedOrNull(game?.id);
  const gameName = toTrimmedOrNull(game?.name);
  const realtimeMatch = toTrimmedOrNull(game?.realtime_match);

  const sessionId = toTrimmedOrNull(session?.id || session?.session_id);
  const roomId = toTrimmedOrNull(session?.room_id || session?.roomId || room?.id);
  const sessionStatus = toTrimmedOrNull(session?.status);
  const sessionTurn = toNumberOrNull(session?.turn);

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

          const hero =
            (p.hero && typeof p.hero === 'object' && p.hero) ||
            (p.heroes && typeof p.heroes === 'object' && p.heroes) ||
            {};

          const heroName =
            (typeof hero.name === 'string' && hero.name) ||
            (typeof p.hero_name === 'string' && p.hero_name) ||
            (typeof p.heroName === 'string' && p.heroName) ||
            '';

          const avatarUrl =
            toTrimmedOrNull(hero.avatar_url) ||
            toTrimmedOrNull(hero.image_url) ||
            toTrimmedOrNull(p.hero_avatar_url) ||
            toTrimmedOrNull(p.avatar_url);

          let backgrounds = [];
          if (Array.isArray(hero.background_urls)) {
            backgrounds = hero.background_urls
              .map((v) => toTrimmedOrNull(v))
              .filter(Boolean);
          } else {
            const bgOne =
              toTrimmedOrNull(hero.background_url) ||
              toTrimmedOrNull(p.background_url);
            if (bgOne) backgrounds = [bgOne];
          }

          const bgmUrl = toTrimmedOrNull(hero.bgm_url);
          const bgmDurationSeconds = toNumberOrNull(
            hero.bgm_duration_seconds ?? hero.bgm_duration
          );

          const audioProfile =
            (hero.audio_profile && typeof hero.audio_profile === 'object'
              ? hero.audio_profile
              : toTrimmedOrNull(hero.audio_profile)) || null;

          return {
            ownerId,
            heroId,
            heroName: heroName || '',
            role: typeof p.role === 'string' ? p.role.trim() : '',
            score: toNumberOrNull(p.score),
            rating: toNumberOrNull(p.rating),
            avatarUrl: avatarUrl || null,
            backgrounds,
            bgmUrl: bgmUrl || null,
            bgmDurationSeconds,
            audioProfile,
          };
        })
        .filter(Boolean)
    : [];

  const viewerOwnerId =
    toTrimmedOrNull(viewer?.ownerId) ||
    toTrimmedOrNull(viewer?.owner_id);
  const viewerHeroId =
    toTrimmedOrNull(viewer?.heroId) ||
    toTrimmedOrNull(viewer?.hero_id);
  const viewerRole =
    typeof viewer?.role === 'string' ? viewer.role.trim() : '';

  const viewerSummary =
    viewerOwnerId || viewerHeroId || viewerRole
      ? {
          ownerId: viewerOwnerId,
          heroId: viewerHeroId,
          role: viewerRole,
        }
      : null;

  return {
    // 권장 구조
    game: {
      id: gameId,
      name: gameName,
      realtime_match: realtimeMatch,
      rules,
    },
    session: {
      id: sessionId,
      roomId,
      status: sessionStatus,
      turn: sessionTurn,
    },
    viewer: viewerSummary,
    toggles: {
      realtimeEnabled: !!toggles.realtimeEnabled,
      dropInEnabled: !!toggles.dropInEnabled,
    },
    players,
    // 하위 호환 필드
    sessionId,
    gameMode,
    realtimeEnabled: !!toggles.realtimeEnabled,
    dropInEnabled: !!toggles.dropInEnabled,
  };
}
