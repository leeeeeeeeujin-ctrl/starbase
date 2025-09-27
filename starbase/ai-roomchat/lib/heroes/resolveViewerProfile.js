import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'

function extractFallbackHero(hint, user) {
  if (!hint) return null

  const heroId = hint.heroId || hint.hero_id || hint.id || null
  const ownerId = hint.ownerId || hint.owner_id || hint.userId || hint.user_id || user?.id || null
  const name = hint.heroName || hint.name || hint.displayName || null
  const avatar = hint.avatarUrl ?? hint.avatar_url ?? hint.image_url ?? null

  if (!heroId && !ownerId && !name && !avatar) {
    return null
  }

  return {
    name: name || '익명',
    avatar_url: avatar ?? null,
    hero_id: heroId || null,
    owner_id: ownerId || user?.id || null,
    user_id: user?.id || ownerId || null,
  }
}

function mergeProfileWithFallback(profile, fallback) {
  if (!fallback) return profile

  const merged = { ...profile }

  if (fallback.hero_id && fallback.hero_id !== merged.hero_id) {
    merged.hero_id = fallback.hero_id
  }

  if (!merged.owner_id && fallback.owner_id) {
    merged.owner_id = fallback.owner_id
  }

  if (!merged.user_id && fallback.user_id) {
    merged.user_id = fallback.user_id
  }

  if (!merged.avatar_url && fallback.avatar_url) {
    merged.avatar_url = fallback.avatar_url
  }

  if (!merged.name || merged.name === '익명') {
    merged.name = fallback.name || merged.name || '익명'
  }

  return merged
}

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
  // NOTE: we always request the logical table name `heroes` here. The
  // `withTable` helper resolves it to the actual physical table (commonly also
  // `heroes`) so there is no separate `hero` table involved—the singular
  // "hero" references in the UI are just JavaScript objects hydrated from this
  // row. This nuance helps when debugging environments where the table might be
  // exposed under a different alias such as `rank_heroes`.
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

export async function resolveViewerProfile(user, explicitHeroId, options = {}) {
  const fallbackProfile = extractFallbackHero(options?.fallbackHero, user)

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
    attempts.push({ heroId: explicitHeroId, enforceOwner: false, fallback: fallbackProfile })
  }

  const stored = readStoredSelection(user.id)
  if (stored?.heroId && stored.heroId !== explicitHeroId) {
    attempts.push({ heroId: stored.heroId, enforceOwner: true, fallback: fallbackProfile })
  }

  if (fallbackProfile?.hero_id && fallbackProfile.hero_id !== explicitHeroId && fallbackProfile.hero_id !== stored?.heroId) {
    attempts.push({ heroId: fallbackProfile.hero_id, enforceOwner: true, fallback: fallbackProfile, preferFallback: true })
  }

  for (const attempt of attempts) {
    const hero = await fetchHeroById(attempt.heroId)
    if (!hero) {
      if (attempt.preferFallback && attempt.fallback) {
        persistStoredHeroFromFallback(attempt.fallback)
        return mergeProfileWithFallback(
          {
            name: attempt.fallback.name,
            avatar_url: attempt.fallback.avatar_url,
            hero_id: attempt.fallback.hero_id,
            owner_id: attempt.fallback.owner_id,
            user_id: user.id,
          },
          fallbackProfile,
        )
      }
      continue
    }
    if (attempt.enforceOwner && hero.owner_id && hero.owner_id !== user.id) {
      continue
    }
    persistSelectedHero(hero)
    return mergeProfileWithFallback(
      {
        name: hero.name,
        avatar_url: hero.image_url || null,
        hero_id: hero.id,
        owner_id: hero.owner_id || user.id,
        user_id: user.id,
      },
      fallbackProfile,
    )
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
    return mergeProfileWithFallback(
      {
        name: myHero.name,
        avatar_url: myHero.image_url || null,
        hero_id: myHero.id,
        owner_id: myHero.owner_id || user.id,
        user_id: user.id,
      },
      fallbackProfile,
    )
  }

  clearSelectedHero()

  const meta = user?.user_metadata || {}
  return mergeProfileWithFallback(
    {
      name: meta.full_name || meta.name || (user.email?.split('@')[0] ?? '익명'),
      avatar_url: meta.avatar_url || null,
      hero_id: null,
      owner_id: user.id,
      user_id: user.id,
    },
    fallbackProfile,
  )
}

function persistStoredHeroFromFallback(fallback) {
  if (!fallback?.hero_id) return
  persistSelectedHero({
    id: fallback.hero_id,
    owner_id: fallback.owner_id,
  })
}
