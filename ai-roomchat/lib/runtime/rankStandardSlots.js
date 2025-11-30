// Helpers that connect rankContext → standard data slots.
//
// These utilities are meant to be used by host-side code
// (예: StartClient 엔진, 서버 API) when a rank session is
// 활성화된 상태에서 텍스트 런타임에 정보를 넘길 때 쓴다.

import { updateStandardSlots } from './standardSlots.js';

function pickViewerFromRank(rank) {
  if (!rank || typeof rank !== 'object') return null;

  const viewer = rank.viewer && typeof rank.viewer === 'object' ? rank.viewer : null;
  const players = Array.isArray(rank.players) ? rank.players : [];

  if (viewer && (viewer.ownerId || viewer.owner_id || viewer.heroId || viewer.hero_id)) {
    const ownerId = viewer.ownerId || viewer.owner_id || null;
    const heroId = viewer.heroId || viewer.hero_id || null;
    if (ownerId || heroId) {
      const match =
        players.find(
          (p) =>
            (ownerId && (p.ownerId === ownerId || p.owner_id === ownerId)) ||
            (heroId && (p.heroId === heroId || p.hero_id === heroId))
        ) || {};
      return { viewer, player: match };
    }
  }

  if (players.length > 0) {
    return { viewer: null, player: players[0] };
  }
  return null;
}

/**
 * Derive a standard speaker slot from rankContext and apply it
 * into ctx.variables.speaker.
 *
 * @param {any} ctx - coreRuntime 훅 컨텍스트 또는 { variables } 객체
 * @param {object} [rank] - rankContext (생략 시 ctx.variables.rank 사용)
 */
export function applySpeakerFromRank(ctx, rank) {
  const vars = (ctx && ctx.variables) || {};
  const rankCtx = rank || (vars && vars.rank) || null;
  const picked = pickViewerFromRank(rankCtx);
  if (!picked) return;

  const { viewer, player } = picked;

  const ownerId =
    (viewer && (viewer.ownerId || viewer.owner_id)) ||
    (player && (player.ownerId || player.owner_id)) ||
    null;

  const heroId =
    (viewer && (viewer.heroId || viewer.hero_id)) ||
    (player && (player.heroId || player.hero_id)) ||
    null;

  const role = (viewer && viewer.role) || (player && player.role) || null;

  const avatarUrl =
    (player && (player.avatarUrl || player.avatar_url)) ||
    null;

  const patch = {
    ownerId: ownerId || undefined,
    heroId: heroId || undefined,
    role: role || undefined,
    avatarUrl: avatarUrl || undefined,
  };

  updateStandardSlots(ctx, { speaker: patch });
}

/**
 * Derive a scene hint from rankContext (배경/브금) and apply it
 * into ctx.variables.scene / ctx.variables.effects.
 *
 * @param {any} ctx
 * @param {object} [rank] - rankContext (생략 시 ctx.variables.rank 사용)
 */
export function applySceneFromRank(ctx, rank) {
  const vars = (ctx && ctx.variables) || {};
  const rankCtx = rank || (vars && vars.rank) || null;
  const picked = pickViewerFromRank(rankCtx);
  if (!picked) return;

  const { player } = picked;
  if (!player || typeof player !== 'object') return;

  const backgrounds = Array.isArray(player.backgrounds) ? player.backgrounds : [];
  const bgmUrl = player.bgmUrl || null;

  const scenePatch = {};
  if (backgrounds.length > 0) {
    scenePatch.backgroundKey = backgrounds[0];
  }
  if (bgmUrl) {
    scenePatch.bgmKey = bgmUrl;
  }

  updateStandardSlots(ctx, {
    scene: scenePatch,
  });
}

