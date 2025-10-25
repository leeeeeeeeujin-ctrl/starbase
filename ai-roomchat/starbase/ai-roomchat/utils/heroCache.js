const HERO_CACHE_PREFIX = 'starbase:hero-cache:';

function buildKey(heroId) {
  if (!heroId) return null;
  return `${HERO_CACHE_PREFIX}${heroId}`;
}

export function readHeroCache(heroId) {
  if (typeof window === 'undefined') return null;
  const key = buildKey(heroId);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.error('Failed to read hero cache:', error);
  }
  return null;
}

export function writeHeroCache(hero) {
  if (typeof window === 'undefined') return;
  if (!hero || !hero.id) return;
  const key = buildKey(hero.id);
  if (!key) return;
  try {
    const payload = {
      id: hero.id,
      name: hero.name || '',
      description: hero.description || '',
      ability1: hero.ability1 || '',
      ability2: hero.ability2 || '',
      ability3: hero.ability3 || '',
      ability4: hero.ability4 || '',
      image_url: hero.image_url || null,
      background_url: hero.background_url || '',
      bgm_url: hero.bgm_url || '',
      bgm_duration_seconds: hero.bgm_duration_seconds || null,
      bgm_mime: hero.bgm_mime || null,
      owner_id: hero.owner_id || null,
      created_at: hero.created_at || null,
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to write hero cache:', error);
  }
}

export function clearHeroCache(heroId) {
  if (typeof window === 'undefined') return;
  const key = buildKey(heroId);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear hero cache:', error);
  }
}
