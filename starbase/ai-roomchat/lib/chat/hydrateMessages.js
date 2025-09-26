import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'

function normaliseHint(raw) {
  if (!raw) return null
  const heroId = raw.heroId ?? raw.hero_id ?? raw.id ?? null
  const ownerId = raw.ownerId ?? raw.owner_id ?? raw.userId ?? raw.user_id ?? null
  const userId = raw.userId ?? raw.user_id ?? ownerId ?? null
  const name = raw.heroName ?? raw.name ?? raw.username ?? raw.displayName ?? null
  const avatarUrl = raw.avatarUrl ?? raw.avatar_url ?? raw.image_url ?? null

  if (!heroId && !ownerId && !userId && !name && !avatarUrl) {
    return null
  }

  return {
    heroId: heroId || null,
    ownerId: ownerId || null,
    userId: userId || null,
    name: name || null,
    avatarUrl: avatarUrl || null,
  }
}

function normaliseHints(list) {
  if (!Array.isArray(list) || !list.length) return []
  const unique = []
  const seen = new Set()
  for (const entry of list) {
    const hint = normaliseHint(entry)
    if (!hint) continue
    const key = `${hint.heroId || ''}:${hint.ownerId || ''}:${hint.userId || ''}:${hint.name || ''}:${hint.avatarUrl || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(hint)
  }
  return unique
}

function cloneMessage(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: null,
      created_at: new Date().toISOString(),
      text: '',
      scope: 'global',
    }
  }
  const clone = { ...raw }
  clone.scope = clone.scope || 'global'
  clone.created_at = clone.created_at || new Date().toISOString()
  return clone
}

function applyHintToMessage(message, hint) {
  if (!hint) return

  const sameHero = hint.heroId && message.hero_id && hint.heroId === message.hero_id
  const sameOwner = hint.ownerId && message.owner_id && hint.ownerId === message.owner_id
  const sameUser = hint.userId && message.user_id && hint.userId === message.user_id

  if (sameHero || sameOwner || sameUser) {
    if (!message.hero_id && hint.heroId) {
      message.hero_id = hint.heroId
    }
    if (!message.owner_id && hint.ownerId) {
      message.owner_id = hint.ownerId
    }
    if (!message.user_id && hint.userId) {
      message.user_id = hint.userId
    }
    if (!message.username && hint.name) {
      message.username = hint.name
    }
    if (!message.avatar_url && hint.avatarUrl) {
      message.avatar_url = hint.avatarUrl
    }
  }
}

function applyHeroRow(message, hero) {
  if (!hero) return
  if (!message.hero_id) {
    message.hero_id = hero.id
  }
  if (!message.owner_id && hero.owner_id) {
    message.owner_id = hero.owner_id
  }
  if (!message.username && hero.name) {
    message.username = hero.name
  }
  if (!message.avatar_url && hero.image_url) {
    message.avatar_url = hero.image_url
  }
}

async function fetchHeroesByIds(heroIds) {
  const unique = Array.from(new Set(heroIds.filter(Boolean)))
  if (!unique.length) return []

  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id,name,image_url,owner_id')
      .in('id', unique),
  )

  if (error) {
    console.error('Failed to hydrate hero metadata by id', error)
    return []
  }

  return Array.isArray(data) ? data : []
}

async function fetchHeroesByOwners(ownerIds) {
  const unique = Array.from(new Set(ownerIds.filter(Boolean)))
  if (!unique.length) return []

  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id,name,image_url,owner_id')
      .in('owner_id', unique)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false }),
  )

  if (error) {
    console.error('Failed to hydrate hero metadata by owner', error)
    return []
  }

  if (!Array.isArray(data)) return []

  const directory = new Map()
  for (const hero of data) {
    if (!hero?.owner_id) continue
    if (!directory.has(hero.owner_id)) {
      directory.set(hero.owner_id, hero)
    }
  }

  return Array.from(directory.values())
}

async function ensureCaches({
  heroIdsToFetch,
  ownerIdsToFetch,
  heroCache,
  ownerCache,
}) {
  const missingHeroIds = Array.from(heroIdsToFetch).filter((id) => id && !heroCache.has(id))
  if (missingHeroIds.length) {
    const heroes = await fetchHeroesByIds(missingHeroIds)
    for (const hero of heroes) {
      if (!hero?.id) continue
      heroCache.set(hero.id, hero)
      if (hero.owner_id) {
        ownerCache.set(hero.owner_id, hero)
      }
    }
  }

  const missingOwnerIds = Array.from(ownerIdsToFetch).filter((id) => id && !ownerCache.has(id))
  if (missingOwnerIds.length) {
    const heroes = await fetchHeroesByOwners(missingOwnerIds)
    for (const hero of heroes) {
      if (!hero?.id) continue
      heroCache.set(hero.id, hero)
      if (hero.owner_id) {
        ownerCache.set(hero.owner_id, hero)
      }
    }
  }
}

function applyCaches(message, heroCache, ownerCache) {
  if (message.hero_id) {
    const hero = heroCache.get(message.hero_id)
    if (hero) {
      applyHeroRow(message, hero)
      return
    }
  }

  if (message.owner_id) {
    const hero = ownerCache.get(message.owner_id)
    if (hero) {
      applyHeroRow(message, hero)
    }
  }
}

export async function hydrateMessageList(rawMessages, {
  viewer = null,
  viewerHint = null,
  hints = [],
  heroCache = new Map(),
  ownerCache = new Map(),
} = {}) {
  const viewerHintNormalised = normaliseHint(viewer)
  const secondaryHint = normaliseHint(viewerHint)
  const normalisedHints = normaliseHints(hints)

  const processed = []
  const heroIdsToFetch = new Set()
  const ownerIdsToFetch = new Set()

  for (const raw of rawMessages || []) {
    const message = cloneMessage(raw)

    if (viewerHintNormalised) {
      applyHintToMessage(message, viewerHintNormalised)
    }
    if (secondaryHint) {
      applyHintToMessage(message, secondaryHint)
    }
    for (const hint of normalisedHints) {
      applyHintToMessage(message, hint)
    }

    if (message.hero_id) {
      const cached = heroCache.get(message.hero_id)
      if (cached) {
        applyHeroRow(message, cached)
      } else if (!message.username || !message.avatar_url || !message.owner_id) {
        heroIdsToFetch.add(message.hero_id)
      }
    } else if (message.owner_id) {
      const cached = ownerCache.get(message.owner_id)
      if (cached) {
        applyHeroRow(message, cached)
      } else {
        ownerIdsToFetch.add(message.owner_id)
      }
    }

    processed.push(message)
  }

  await ensureCaches({ heroIdsToFetch, ownerIdsToFetch, heroCache, ownerCache })

  for (const message of processed) {
    applyCaches(message, heroCache, ownerCache)
  }

  return { messages: processed, heroCache, ownerCache }
}

export async function hydrateIncomingMessage(rawMessage, options = {}) {
  const { messages, heroCache, ownerCache } = await hydrateMessageList([rawMessage], options)
  return { message: messages[0], heroCache, ownerCache }
}
