import { supabase } from '../lib/supabase'
import { withTable } from '../lib/supabaseTables'

const HERO_DETAIL_COLUMNS = [
  'id',
  'owner_id',
  'name',
  'description',
  'ability1',
  'ability2',
  'ability3',
  'ability4',
  'image_url',
  'background_url',
  'bgm_url',
  'bgm_duration_seconds',
  'bgm_mime',
  'created_at',
  'updated_at',
]
  .join(',')

const HERO_MUTABLE_FIELDS = [
  'name',
  'description',
  'ability1',
  'ability2',
  'ability3',
  'ability4',
  'image_url',
  'background_url',
  'bgm_url',
  'bgm_duration_seconds',
  'bgm_mime',
]

const HERO_LIST_COLUMNS = 'id,name,image_url,owner_id,created_at,updated_at'
const HERO_BGM_COLUMNS =
  'id,hero_id,label,url,storage_path,duration_seconds,mime,sort_order,created_at,updated_at'
const FALLBACK_NAME = '이름 없는 영웅'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

function normaliseHeroBgm(record, index = 0) {
  if (!record || typeof record !== 'object') {
    return null
  }

  const baseIndex = Number.isFinite(record.sort_order) ? record.sort_order : index
  const label =
    typeof record.label === 'string' && record.label.trim()
      ? record.label.trim()
      : `브금 ${baseIndex + 1}`

  return {
    id: record.id || null,
    hero_id: record.hero_id || null,
    label,
    url: record.url || null,
    storage_path: record.storage_path || null,
    duration_seconds:
      typeof record.duration_seconds === 'number'
        ? record.duration_seconds
        : typeof record.bgm_duration_seconds === 'number'
          ? record.bgm_duration_seconds
          : null,
    mime: record.mime || record.bgm_mime || null,
    sort_order: Number.isFinite(record.sort_order) ? record.sort_order : index,
    created_at: record.created_at || null,
    updated_at: record.updated_at || null,
  }
}

function normaliseHeroBgmList(list) {
  if (!Array.isArray(list) || !list.length) return []
  return list
    .map(normaliseHeroBgm)
    .filter(Boolean)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order
      }
      return (a.created_at || '').localeCompare(b.created_at || '')
    })
}

export function normaliseHero(record) {
  if (!record || typeof record !== 'object') {
    return null
  }

  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : FALLBACK_NAME

  const hero = {
    id: record.id || null,
    owner_id: record.owner_id || null,
    name,
    description: record.description || '',
    ability1: record.ability1 || '',
    ability2: record.ability2 || '',
    ability3: record.ability3 || '',
    ability4: record.ability4 || '',
    image_url: record.image_url || null,
    background_url: record.background_url || null,
    bgm_url: record.bgm_url || null,
    bgm_duration_seconds: record.bgm_duration_seconds || null,
    bgm_mime: record.bgm_mime || null,
    created_at: record.created_at || null,
    updated_at: record.updated_at || null,
  }

  const bgmList = normaliseHeroBgmList(record.hero_bgms || record.bgms)
  if (bgmList.length) {
    const [primary] = bgmList
    hero.bgm_url = primary?.url || hero.bgm_url
    hero.bgm_duration_seconds =
      primary?.duration_seconds ?? hero.bgm_duration_seconds ?? null
    hero.bgm_mime = primary?.mime || hero.bgm_mime
  }
  hero.bgms = bgmList

  return hero
}

function normaliseListHero(record) {
  if (!record) return null
  const base = normaliseHero(record)
  if (!base) return null
  return {
    id: base.id,
    owner_id: base.owner_id,
    name: base.name,
    image_url: base.image_url,
    created_at: base.created_at,
    updated_at: base.updated_at,
  }
}

export async function fetchHeroById(heroId) {
  if (!heroId) return null

  const { data, error, table } = await withTable(supabase, 'heroes', (tableName) => {
    const columns =
      tableName === 'heroes'
        ? `${HERO_DETAIL_COLUMNS},hero_bgms(${HERO_BGM_COLUMNS})`
        : HERO_DETAIL_COLUMNS
    return supabase
      .from(tableName)
      .select(columns)
      .eq('id', heroId)
      .limit(1)
      .maybeSingle()
  })

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }

  const hero = normaliseHero(data)

  if (!hero) {
    return null
  }

  if (table !== 'heroes' || !Array.isArray(data?.hero_bgms)) {
    const bgms = await fetchHeroBgms(hero.id)
    if (bgms.length) {
      hero.bgms = bgms
      const [primary] = bgms
      hero.bgm_url = primary?.url || hero.bgm_url
      hero.bgm_duration_seconds = primary?.duration_seconds ?? hero.bgm_duration_seconds
      hero.bgm_mime = primary?.mime || hero.bgm_mime
    }
  }

  return hero
}

export async function fetchHeroBgms(heroId) {
  if (!heroId) return []

  const { data, error } = await withTable(supabase, 'hero_bgms', (table) =>
    supabase
      .from(table)
      .select(HERO_BGM_COLUMNS)
      .eq('hero_id', heroId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  )

  if (error) {
    if (error.code === 'PGRST116') {
      return []
    }
    throw error
  }

  return normaliseHeroBgmList(data)
}

export async function syncHeroBgms(
  heroId,
  { upserts = [], removals = [] } = {},
) {
  if (!heroId) {
    throw new Error('heroId is required to sync hero bgms')
  }

  const nowIso = new Date().toISOString()
  const preparedUpserts = Array.isArray(upserts)
    ? upserts
        .map((row, index) => {
          if (!row) return null
          const sortOrder = Number.isFinite(row.sort_order) ? row.sort_order : index
          const label =
            typeof row.label === 'string' && row.label.trim()
              ? row.label.trim()
              : `브금 ${sortOrder + 1}`

          return {
            id: isValidUuid(row.id) ? row.id : undefined,
            hero_id: heroId,
            label,
            url: row.url || null,
            storage_path: row.storage_path || null,
            duration_seconds: Number.isFinite(row.duration_seconds)
              ? row.duration_seconds
              : null,
            mime: row.mime || null,
            sort_order: sortOrder,
            updated_at: nowIso,
          }
        })
        .filter(Boolean)
    : []

  if (preparedUpserts.length) {
    const { error } = await withTable(supabase, 'hero_bgms', (table) =>
      supabase
        .from(table)
        .upsert(preparedUpserts, { onConflict: 'id' })
        .select('id'),
    )

    if (error) {
      throw error
    }
  }

  const removalIds = Array.isArray(removals)
    ? removals.map((value) => value).filter(isValidUuid)
    : []

  if (removalIds.length) {
    const { error } = await withTable(supabase, 'hero_bgms', (table) =>
      supabase
        .from(table)
        .delete()
        .in('id', removalIds)
        .eq('hero_id', heroId),
    )

    if (error) {
      throw error
    }
  }

  return fetchHeroBgms(heroId)
}

function toOwnerList(ownerIdOrList) {
  if (Array.isArray(ownerIdOrList)) {
    return ownerIdOrList.filter(Boolean)
  }
  if (!ownerIdOrList) return []
  return [ownerIdOrList]
}

export async function fetchHeroesByOwner(ownerIdOrList) {
  const owners = toOwnerList(ownerIdOrList)
  if (!owners.length) return []

  const query = withTable(supabase, 'heroes', (table) => {
    let builder = supabase.from(table).select(HERO_LIST_COLUMNS)

    if (owners.length === 1) {
      builder = builder.eq('owner_id', owners[0])
    } else {
      builder = builder.in('owner_id', owners)
    }

    return builder.order('updated_at', { ascending: false }).order('created_at', { ascending: false })
  })

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (Array.isArray(data) ? data : []).map(normaliseListHero).filter(Boolean)
}

export async function updateHeroById(heroId, payload) {
  if (!heroId) {
    throw new Error('heroId is required to update a hero')
  }

  const updates = {}
  HERO_MUTABLE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const value = payload[field]
      updates[field] = value === '' ? '' : value ?? null
    }
  })
  updates.updated_at = new Date().toISOString()

  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase.from(table).update(updates).eq('id', heroId).select(HERO_DETAIL_COLUMNS).maybeSingle(),
  )

  if (error) {
    throw error
  }

  return normaliseHero(data)
}

export async function deleteHeroById(heroId) {
  if (!heroId) return
  const { error } = await withTable(supabase, 'heroes', (table) => supabase.from(table).delete().eq('id', heroId))
  if (error) {
    throw error
  }
}
