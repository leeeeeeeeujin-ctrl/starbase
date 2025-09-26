import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'

function persistSelectedHero(hero) {
  if (typeof window === 'undefined') return
  if (!hero?.id) return
  try {
    window.localStorage.setItem('selectedHeroId', hero.id)
    if (hero.owner_id) {
      window.localStorage.setItem('selectedHeroOwnerId', hero.owner_id)
    }
  } catch (error) {
    console.error('Failed to persist selected hero metadata:', error)
  }
}

function clearSelectedHero() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem('selectedHeroId')
    window.localStorage.removeItem('selectedHeroOwnerId')
  } catch (error) {
    console.error('Failed to clear selected hero metadata:', error)
  }
}

function readStoredSelection(userId) {
  if (typeof window === 'undefined') return null
  try {
    const heroId = window.localStorage.getItem('selectedHeroId')
    const ownerId = window.localStorage.getItem('selectedHeroOwnerId')
    if (!heroId) return null
    if (ownerId && userId && ownerId !== userId) {
      return null
    }
    return { heroId, ownerId }
  } catch (error) {
    console.error('Failed to read stored hero metadata:', error)
    return null
  }
}

async function fetchHeroById(heroId) {
  if (!heroId) return null
  const { data: hero, error } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id,name,image_url,owner_id')
      .eq('id', heroId)
      .maybeSingle(),
  )
  if (error) {
    console.error('Failed to fetch hero by id:', error)
    return null
  }
  return hero || null
}

export async function resolveViewerProfile(user, explicitHeroId) {
  if (!user) {
    return {
      name: '익명',
      avatar_url: null,
      hero_id: null,
      owner_id: null,
      user_id: null,
    }
  }

  const attempts = []
  if (explicitHeroId) {
    attempts.push({ heroId: explicitHeroId, enforceOwner: false })
  }

  const stored = readStoredSelection(user.id)
  if (stored?.heroId && stored.heroId !== explicitHeroId) {
    attempts.push({ heroId: stored.heroId, enforceOwner: true })
  }

  for (const attempt of attempts) {
    const hero = await fetchHeroById(attempt.heroId)
    if (!hero) {
      continue
    }
    if (attempt.enforceOwner && hero.owner_id && hero.owner_id !== user.id) {
      continue
    }
    persistSelectedHero(hero)
    return {
      name: hero.name,
      avatar_url: hero.image_url || null,
      hero_id: hero.id,
      owner_id: hero.owner_id || user.id,
      user_id: user.id,
    }
  }

  const { data: myHero } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id,name,image_url,owner_id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  )

  if (myHero) {
    persistSelectedHero(myHero)
    return {
      name: myHero.name,
      avatar_url: myHero.image_url || null,
      hero_id: myHero.id,
      owner_id: myHero.owner_id || user.id,
      user_id: user.id,
    }
  }

  clearSelectedHero()

  const meta = user?.user_metadata || {}
  return {
    name: meta.full_name || meta.name || (user.email?.split('@')[0] ?? '익명'),
    avatar_url: meta.avatar_url || null,
    hero_id: null,
    owner_id: user.id,
    user_id: user.id,
  }
}
