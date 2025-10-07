import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'
import {
  clearHeroSelection,
  fetchHeroRecordById,
  persistHeroOwner,
  persistHeroSelection,
  readHeroSelection,
} from './selectedHeroStorage'

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

  const stored = readHeroSelection()
  if (stored?.heroId && stored.heroId !== explicitHeroId) {
    attempts.push({ heroId: stored.heroId, enforceOwner: true, fallback: fallbackProfile })
  }

  if (fallbackProfile?.hero_id && fallbackProfile.hero_id !== explicitHeroId && fallbackProfile.hero_id !== stored?.heroId) {
    attempts.push({ heroId: fallbackProfile.hero_id, enforceOwner: true, fallback: fallbackProfile, preferFallback: true })
  }

  for (const attempt of attempts) {
    const hero = await fetchHeroRecordById(attempt.heroId)
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
      if (stored?.heroId === hero.id) {
        clearHeroSelection()
      }
      continue
    }
    persistHeroSelection(hero)
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
    persistHeroSelection(myHero)
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

  clearHeroSelection()

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
  if (!fallback?.hero_id) {
    if (fallback?.owner_id) {
      persistHeroOwner(fallback.owner_id)
    }
    return
  }
  persistHeroSelection(
    {
      id: fallback.hero_id,
      owner_id: fallback.owner_id,
    },
    fallback.owner_id,
  )
}
