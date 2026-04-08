const DEFAULT_BASE_STATS = {
  hp: 70,
  attack: 70,
  defense: 70,
  spAttack: 70,
  spDefense: 70,
  speed: 70,
};

export const POKEROGUE_DEFAULT_PROFILE_DRAFT = {
  primaryType: '',
  secondaryType: '',
  growthType: 'balanced',
  starterCost: 3,
  ability: '',
  secondaryAbility: '',
  hiddenAbility: '',
  passive: '',
  signatureMovesText: '',
  movePoolText: '',
  spawnWeight: 1,
  biography: '',
  baseStats: { ...DEFAULT_BASE_STATS },
};

function normalizeStatValue(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(255, Math.round(numeric)));
}

function normalizeListToText(value) {
  if (Array.isArray(value)) {
    return value.map(entry => String(entry || '').trim()).filter(Boolean).join('\n');
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map(entry => entry.trim())
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function textToList(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map(entry => entry.trim())
    .filter(Boolean);
}

export function normalizePokerogueProfileDraft(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const types = Array.isArray(source.types) ? source.types : [];
  const baseStats =
    source.baseStats && typeof source.baseStats === 'object' ? source.baseStats : {};

  return {
    primaryType: String(source.primaryType || types[0] || '').trim(),
    secondaryType: String(source.secondaryType || types[1] || '').trim(),
    growthType: String(source.growthType || source.growthRate || 'balanced').trim() || 'balanced',
    starterCost: Number.isFinite(Number(source.starterCost))
      ? Math.max(1, Math.round(Number(source.starterCost)))
      : POKEROGUE_DEFAULT_PROFILE_DRAFT.starterCost,
    ability: String(source.ability || source.primaryAbility || '').trim(),
    secondaryAbility: String(source.secondaryAbility || '').trim(),
    hiddenAbility: String(source.hiddenAbility || '').trim(),
    passive: String(source.passive || source.passiveAbility || '').trim(),
    signatureMovesText: normalizeListToText(source.signatureMoves),
    movePoolText: normalizeListToText(source.movePool),
    spawnWeight: Number.isFinite(Number(source.spawnWeight))
      ? Math.max(1, Math.round(Number(source.spawnWeight)))
      : POKEROGUE_DEFAULT_PROFILE_DRAFT.spawnWeight,
    biography: String(source.biography || '').trim(),
    baseStats: {
      hp: normalizeStatValue(baseStats.hp, DEFAULT_BASE_STATS.hp),
      attack: normalizeStatValue(baseStats.attack, DEFAULT_BASE_STATS.attack),
      defense: normalizeStatValue(baseStats.defense, DEFAULT_BASE_STATS.defense),
      spAttack: normalizeStatValue(baseStats.spAttack, DEFAULT_BASE_STATS.spAttack),
      spDefense: normalizeStatValue(baseStats.spDefense, DEFAULT_BASE_STATS.spDefense),
      speed: normalizeStatValue(baseStats.speed, DEFAULT_BASE_STATS.speed),
    },
  };
}

export function serializePokerogueProfileDraft(draft) {
  const normalized = normalizePokerogueProfileDraft(draft);
  return {
    types: [normalized.primaryType, normalized.secondaryType].filter(Boolean),
    growthType: normalized.growthType,
    starterCost: normalized.starterCost,
    ability: normalized.ability || null,
    secondaryAbility: normalized.secondaryAbility || null,
    hiddenAbility: normalized.hiddenAbility || null,
    passive: normalized.passive || null,
    signatureMoves: textToList(normalized.signatureMovesText),
    movePool: textToList(normalized.movePoolText),
    spawnWeight: normalized.spawnWeight,
    biography: normalized.biography,
    baseStats: {
      ...normalized.baseStats,
    },
  };
}

export function hasMeaningfulPokerogueProfile(profile) {
  const normalized = normalizePokerogueProfileDraft(profile);
  return Boolean(
    normalized.primaryType ||
      normalized.ability ||
      normalized.passive ||
      normalized.signatureMovesText ||
      normalized.movePoolText ||
      normalized.biography
  );
}

