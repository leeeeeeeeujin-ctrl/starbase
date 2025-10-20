import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'

export const HERO_ID_KEY = 'selectedHeroId'
export const HERO_OWNER_KEY = 'selectedHeroOwnerId'

function normalizeId(value) {
  if (value == null) return ''
  const trimmed = String(value).trim()
  return trimmed
}

export function readHeroSelection() {
  if (typeof window === 'undefined') return null
  try {
    const heroId = normalizeId(window.localStorage.getItem(HERO_ID_KEY))
    const ownerId = normalizeId(window.localStorage.getItem(HERO_OWNER_KEY))
    if (!heroId) {
      return null
    }
    return { heroId, ownerId: ownerId || null }
  } catch (error) {
    console.error('[HeroSelection] Failed to read hero selection:', error)
    return null
  }
}

export function persistHeroOwner(ownerId) {
  if (typeof window === 'undefined') return
  try {
    const normalized = normalizeId(ownerId)
    if (!normalized) {
      window.localStorage.removeItem(HERO_OWNER_KEY)
    } else {
      window.localStorage.setItem(HERO_OWNER_KEY, normalized)
    }
  } catch (error) {
    console.error('[HeroSelection] Failed to persist owner metadata:', error)
  }
}

export function persistHeroSelection(hero, fallbackOwnerId = null) {
  if (typeof window === 'undefined') return
  const heroId = normalizeId(hero?.id ?? hero?.hero_id ?? hero)
  if (!heroId) return
  const ownerId = normalizeId(hero?.owner_id ?? hero?.ownerId ?? fallbackOwnerId)

  try {
    window.localStorage.setItem(HERO_ID_KEY, heroId)
    if (ownerId) {
      window.localStorage.setItem(HERO_OWNER_KEY, ownerId)
    } else {
      window.localStorage.removeItem(HERO_OWNER_KEY)
    }
  } catch (error) {
    console.error('[HeroSelection] Failed to persist hero selection:', error)
  }
}

export function clearHeroSelection() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(HERO_ID_KEY)
    window.localStorage.removeItem(HERO_OWNER_KEY)
  } catch (error) {
    console.error('[HeroSelection] Failed to clear hero selection:', error)
  }
}

export async function fetchHeroRecordById(heroId, { columns } = {}) {
  const normalized = normalizeId(heroId)
  if (!normalized) return null
  const selectColumns = columns || 'id,name,image_url,owner_id'
  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase.from(table).select(selectColumns).eq('id', normalized).maybeSingle(),
  )
  if (error) {
    console.error('[HeroSelection] Failed to fetch hero record:', error)
    return null
  }
  return data || null
}

export async function resolveStoredHeroForUser(userId, options = {}) {
  if (typeof window === 'undefined') return null
  const viewerId = normalizeId(userId)
  const selection = readHeroSelection()
  if (!selection?.heroId) {
    return null
  }

  if (viewerId && selection.ownerId && selection.ownerId !== viewerId) {
    clearHeroSelection()
    return null
  }

  const hero = await fetchHeroRecordById(selection.heroId, options)
  if (!hero) {
    clearHeroSelection()
    return null
  }

  const heroOwner = normalizeId(hero.owner_id ?? hero.ownerId)
  if (viewerId && heroOwner && heroOwner !== viewerId) {
    clearHeroSelection()
    return null
  }

  persistHeroSelection(hero, viewerId || selection.ownerId || null)
  return hero
}
