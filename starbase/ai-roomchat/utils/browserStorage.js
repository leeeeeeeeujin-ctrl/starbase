const HERO_ID_KEY = 'selectedHeroId'
const HERO_OWNER_KEY = 'selectedHeroOwnerId'

function isBrowser() {
  return typeof window !== 'undefined'
}

export function persistSelectedHero(heroId, ownerId) {
  if (!isBrowser()) return
  try {
    if (heroId) {
      window.localStorage.setItem(HERO_ID_KEY, heroId)
    }
    if (ownerId) {
      window.localStorage.setItem(HERO_OWNER_KEY, ownerId)
    }
  } catch (error) {
    console.error('Failed to persist selected hero metadata', error)
  }
}

export function clearSelectedHero() {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(HERO_ID_KEY)
  } catch (error) {
    console.error('Failed to clear hero selection', error)
  }
}

export function clearSelectedHeroIfMatches(heroId) {
  if (!isBrowser()) return
  try {
    const stored = window.localStorage.getItem(HERO_ID_KEY)
    if (stored && stored === heroId) {
      window.localStorage.removeItem(HERO_ID_KEY)
    }
  } catch (error) {
    console.error('Failed to clear hero selection for removed hero', error)
  }
}

export function persistRosterOwner(ownerId) {
  if (!isBrowser()) return
  try {
    if (ownerId) {
      window.localStorage.setItem(HERO_OWNER_KEY, ownerId)
    } else {
      window.localStorage.removeItem(HERO_OWNER_KEY)
    }
  } catch (error) {
    console.error('Failed to persist roster owner metadata', error)
  }
}

export function pruneMissingHeroSelection(heroes) {
  if (!isBrowser()) return
  try {
    const storedHeroId = window.localStorage.getItem(HERO_ID_KEY)
    if (!storedHeroId) return
    const hasHero = heroes.some((hero) => hero?.id === storedHeroId)
    if (!hasHero) {
      window.localStorage.removeItem(HERO_ID_KEY)
    }
  } catch (error) {
    console.error('Failed to synchronise hero selection cache', error)
  }
}
