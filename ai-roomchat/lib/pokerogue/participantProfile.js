const DEFAULT_BASE_STATS = {
  hp: 70,
  attack: 70,
  defense: 70,
  spAttack: 70,
  spDefense: 70,
  speed: 70,
};

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

function normalizeStats(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BASE_STATS };
  return {
    hp: Number.isFinite(Number(raw.hp)) ? Number(raw.hp) : DEFAULT_BASE_STATS.hp,
    attack: Number.isFinite(Number(raw.attack)) ? Number(raw.attack) : DEFAULT_BASE_STATS.attack,
    defense: Number.isFinite(Number(raw.defense)) ? Number(raw.defense) : DEFAULT_BASE_STATS.defense,
    spAttack:
      Number.isFinite(Number(raw.spAttack)) ? Number(raw.spAttack) : DEFAULT_BASE_STATS.spAttack,
    spDefense:
      Number.isFinite(Number(raw.spDefense)) ? Number(raw.spDefense) : DEFAULT_BASE_STATS.spDefense,
    speed: Number.isFinite(Number(raw.speed)) ? Number(raw.speed) : DEFAULT_BASE_STATS.speed,
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => String(entry || '').trim()).filter(Boolean);
}

export function buildPokerogueProfileDraft(hero) {
  const profile =
    hero?.pokerogue_profile && typeof hero.pokerogue_profile === 'object'
      ? hero.pokerogue_profile
      : {};

  return {
    speciesId: hero?.id ? `hero-${hero.id}` : null,
    slug: slugify(hero?.name || hero?.id || 'hero'),
    types: normalizeStringArray(profile.types),
    baseStats: normalizeStats(profile.baseStats),
    growthType: String(profile.growthType || 'balanced'),
    passive: profile.passive || null,
    ability: profile.ability || null,
    signatureMoves: normalizeStringArray(profile.signatureMoves),
    movePool: normalizeStringArray(profile.movePool),
    spawnWeight: Number.isFinite(Number(profile.spawnWeight)) ? Number(profile.spawnWeight) : 1,
    biography: String(profile.biography || '').trim(),
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

export function buildPokerogueRoster(heroes, options = {}) {
  const { readyOnly = false } = options;
  const entries = Array.isArray(heroes) ? heroes.map(buildPokerogueParticipant) : [];
  return readyOnly ? entries.filter(entry => entry.ready) : entries;
}
