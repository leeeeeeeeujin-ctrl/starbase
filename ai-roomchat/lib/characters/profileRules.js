export const HERO_NAME_MAX_LENGTH = 24;
export const HERO_DESCRIPTION_MAX_LENGTH = 500;
export const HERO_ABILITY_MAX_LENGTH = 120;
export const HERO_MEMORY_SLOT_MAX = 10;
export const HERO_MEMORY_ENTRY_MAX_LENGTH = 240;
export const HERO_RECENT_CHAT_MAX = 15;
export const HERO_CHAT_INPUT_MAX_LENGTH = 800;
export const HERO_ARCHIVE_MAX = 24;
export const HERO_ARCHIVE_ENTRY_MAX_LENGTH = 800;

const trimText = value => (typeof value === 'string' ? value.trim() : '');

export function clampHeroProfileDraft(draft = {}) {
  return {
    name: String(draft.name || '').slice(0, HERO_NAME_MAX_LENGTH),
    description: String(draft.description || '').slice(0, HERO_DESCRIPTION_MAX_LENGTH),
    ability1: String(draft.ability1 || '').slice(0, HERO_ABILITY_MAX_LENGTH),
    ability2: String(draft.ability2 || '').slice(0, HERO_ABILITY_MAX_LENGTH),
    ability3: String(draft.ability3 || '').slice(0, HERO_ABILITY_MAX_LENGTH),
    ability4: String(draft.ability4 || '').slice(0, HERO_ABILITY_MAX_LENGTH),
  };
}

export function normalizeHeroProfilePayload(draft = {}, fallbackName = '이름 없는 영웅') {
  const clamped = clampHeroProfileDraft(draft);
  return {
    name: trimText(clamped.name) || fallbackName,
    description: clamped.description,
    ability1: clamped.ability1,
    ability2: clamped.ability2,
    ability3: clamped.ability3,
    ability4: clamped.ability4,
  };
}

export function validateHeroProfileDraft(draft = {}) {
  const errors = [];
  const name = String(draft.name || '');
  const description = String(draft.description || '');
  const abilities = [
    String(draft.ability1 || ''),
    String(draft.ability2 || ''),
    String(draft.ability3 || ''),
    String(draft.ability4 || ''),
  ];

  if (name.length > HERO_NAME_MAX_LENGTH) {
    errors.push(`이름은 ${HERO_NAME_MAX_LENGTH}자 이하만 가능합니다.`);
  }
  if (description.length > HERO_DESCRIPTION_MAX_LENGTH) {
    errors.push(`설명은 ${HERO_DESCRIPTION_MAX_LENGTH}자 이하만 가능합니다.`);
  }
  abilities.forEach((ability, index) => {
    if (ability.length > HERO_ABILITY_MAX_LENGTH) {
      errors.push(`능력 ${index + 1}은 ${HERO_ABILITY_MAX_LENGTH}자 이하만 가능합니다.`);
    }
  });

  return errors;
}

export function isGifFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return type === 'image/gif' || name.endsWith('.gif');
}
