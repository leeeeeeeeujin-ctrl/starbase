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

const HERO_LIST_COLUMNS = 'id,name,image_url,owner_id,created_at,updated_at'
const FALLBACK_NAME = '이름 없는 영웅'

export function normaliseHero(record) {
  if (!record || typeof record !== 'object') {
    return null
  }

  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : FALLBACK_NAME

  return {
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

  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select(HERO_DETAIL_COLUMNS)
      .eq('id', heroId)
      .limit(1)
      .maybeSingle(),
  )

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }

  return normaliseHero(data)
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

export async function updateHero(heroId, updates) {
  if (!heroId) {
    throw new Error('유효하지 않은 캐릭터 ID입니다.')
  }

  const allowedKeys = [
    'name',
    'description',
    'ability1',
    'ability2',
    'ability3',
    'ability4',
    'image_url',
    'background_url',
    'bgm_url',
  ]

  const payload = {}
  allowedKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      const value = updates[key]
      payload[key] = value === undefined ? null : value
    }
  })

  if (!Object.keys(payload).length) {
    return null
  }

  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .update(payload)
      .eq('id', heroId)
      .select(HERO_DETAIL_COLUMNS)
      .maybeSingle(),
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
