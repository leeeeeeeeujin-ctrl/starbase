import {
  normalizePokerogueProfileDraft,
  serializePokerogueProfileDraft,
  textToList,
} from './profileDraft.js';

const TEST_RIVAL_PROFILE = normalizePokerogueProfileDraft({
  primaryType: 'normal',
  secondaryType: 'light',
  growthType: 'balanced',
  starterCost: 3,
  ability: 'spotlight',
  secondaryAbility: 'quick-feet',
  hiddenAbility: 'rival-heart',
  passive: 'stage-presence',
  signatureMoves: ['Curtain Call', 'Flash Step'],
  movePool: ['tackle', 'quick-attack', 'protect', 'swift'],
  spawnWeight: 1,
  biography: '개발용 첫 라이벌전 고정 엔트리.',
  baseStats: {
    hp: 72,
    attack: 84,
    defense: 66,
    spAttack: 84,
    spDefense: 66,
    speed: 88,
  },
});

const TEST_RIVAL_STARTING_MOVES = ['tackle', 'quick-attack', 'curtain-call', 'flash-step'];

function buildMoveSet(serialized) {
  const signature = Array.isArray(serialized.signatureMoves) ? serialized.signatureMoves : [];
  const levelUp = Array.isArray(serialized.movePool) ? serialized.movePool : [];
  const starting = [...signature, ...levelUp].filter(Boolean).slice(0, 4);

  return {
    signature,
    levelUp,
    starting,
    levelUpSet: levelUp.map((moveId, index) => ({
      level: index === 0 ? 1 : Math.min(100, (index + 1) * 7),
      moveId,
    })),
    egg: [],
    tm: [],
  };
}

function slugify(value, fallback = 'hero') {
  const source = String(value || fallback)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  return source || fallback;
}

export function buildPokerogueProfileDraft(hero) {
  const normalized = normalizePokerogueProfileDraft(hero?.pokerogue_profile);
  const serialized = serializePokerogueProfileDraft(normalized);

  return {
    speciesId: hero?.id ? `hero-${hero.id}` : null,
    slug: slugify(hero?.name || hero?.id || 'hero'),
    types: serialized.types,
    type1: serialized.types[0] || null,
    type2: serialized.types[1] || null,
    baseStats: serialized.baseStats,
    growthType: serialized.growthType,
    starterCost: serialized.starterCost,
    passive: serialized.passive || null,
    ability: serialized.ability || null,
    secondaryAbility: serialized.secondaryAbility || null,
    hiddenAbility: serialized.hiddenAbility || null,
    abilities: {
      primary: serialized.ability || null,
      secondary: serialized.secondaryAbility || null,
      hidden: serialized.hiddenAbility || null,
      passive: serialized.passive || null,
    },
    signatureMoves: serialized.signatureMoves,
    movePool: serialized.movePool,
    moves: buildMoveSet(serialized),
    spawnWeight: serialized.spawnWeight,
    biography: String(serialized.biography || '').trim(),
    draft: normalized,
  };
}

export function getPokerogueMissingRequirements(hero) {
  const missing = [];
  if (!hero?.pokerogue_enabled) missing.push('participation');
  if (!String(hero?.name || '').trim()) missing.push('name');
  if (!String(hero?.pokerogue_region || '').trim()) missing.push('region');
  if (!hero?.pokerogue_front_sprite_url) missing.push('frontSprite');
  if (!hero?.pokerogue_back_sprite_url) missing.push('backSprite');
  if (!hero?.pokerogue_icon_url) missing.push('iconSprite');
  const draft = normalizePokerogueProfileDraft(hero?.pokerogue_profile);
  if (!draft.primaryType) missing.push('primaryType');
  if (!draft.ability) missing.push('ability');
  if (!textToList(draft.signatureMovesText).length && !textToList(draft.movePoolText).length) {
    missing.push('movePool');
  }
  return missing;
}

export function buildPokerogueParticipant(hero) {
  const missing = getPokerogueMissingRequirements(hero);
  const draft = buildPokerogueProfileDraft(hero);

  return {
    id: draft.speciesId,
    heroId: hero?.id || null,
    slug: draft.slug,
    name: String(hero?.name || '이름 없는 캐릭터').trim() || '이름 없는 캐릭터',
    enabled: Boolean(hero?.pokerogue_enabled),
    ready: missing.length === 0,
    missingRequirements: missing,
    region: String(hero?.pokerogue_region || '').trim(),
    tier: String(hero?.pokerogue_tier || 'common'),
    playable:
      typeof hero?.pokerogue_playable === 'boolean' ? hero.pokerogue_playable : true,
    legendary: String(hero?.pokerogue_tier || 'common') === 'legendary',
    sprites: {
      front: hero?.pokerogue_front_sprite_url || null,
      back: hero?.pokerogue_back_sprite_url || null,
      icon: hero?.pokerogue_icon_url || null,
    },
    audio: {
      battleThemeUrl: hero?.bgm_url || null,
    },
    profile: draft,
    source: {
      sceneBackgroundDescription: hero?.scene_background_description || '',
      imageUrl: hero?.image_url || null,
      ingameImageUrl: hero?.ingame_image_url || null,
      updatedAt: hero?.updated_at || null,
    },
  };
}

export function buildPokerogueTestRival() {
  const serialized = serializePokerogueProfileDraft(TEST_RIVAL_PROFILE);
  const moves = buildMoveSet(serialized);
  return {
    id: 'test-rival-001',
    heroId: null,
    slug: 'test-rival-001',
    name: '테스트 라이벌',
    enabled: true,
    ready: true,
    missingRequirements: [],
    region: 'starter-plains',
    tier: 'elite',
    playable: false,
    legendary: false,
    encounter: {
      fixedRole: 'first-rival',
      fixedWave: 1,
    },
    sprites: {
      front: '/icon.png',
      back: '/icon.png',
      icon: '/icon.png',
    },
    audio: {
      battleThemeUrl: null,
    },
    profile: {
      speciesId: 'test-rival-001',
      slug: 'test-rival-001',
      types: serialized.types,
      type1: serialized.types[0] || null,
      type2: serialized.types[1] || null,
      baseStats: serialized.baseStats,
      growthType: serialized.growthType,
      starterCost: serialized.starterCost,
      passive: serialized.passive,
      ability: serialized.ability,
      secondaryAbility: serialized.secondaryAbility,
      hiddenAbility: serialized.hiddenAbility,
      abilities: {
        primary: serialized.ability,
        secondary: serialized.secondaryAbility,
        hidden: serialized.hiddenAbility,
        passive: serialized.passive,
      },
      signatureMoves: serialized.signatureMoves,
      movePool: serialized.movePool,
      moves: {
        ...moves,
        starting: TEST_RIVAL_STARTING_MOVES,
        levelUpSet: TEST_RIVAL_STARTING_MOVES.map((moveId, index) => ({
          level: index === 0 ? 1 : index + 1,
          moveId,
        })),
      },
      spawnWeight: serialized.spawnWeight,
      biography: serialized.biography,
      draft: TEST_RIVAL_PROFILE,
    },
    source: {
      sceneBackgroundDescription: '테스트 라이벌전',
      imageUrl: '/icon.png',
      ingameImageUrl: '/icon.png',
      updatedAt: null,
    },
    isTestEntry: true,
  };
}

export function buildPokerogueRoster(heroes, options = {}) {
  const { readyOnly = false, includeTestRival = false } = options;
  const entries = Array.isArray(heroes) ? heroes.map(buildPokerogueParticipant) : [];
  const filtered = readyOnly ? entries.filter(entry => entry.ready) : entries;
  return includeTestRival ? [buildPokerogueTestRival(), ...filtered] : filtered;
}
