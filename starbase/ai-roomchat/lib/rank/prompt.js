// lib/rank/prompt.js

const DEFEATED_STATUS_SET = new Set(['defeated', 'lost', 'dead'])
const RETIRED_STATUS_SET = new Set(['retired', 'eliminated', 'out', 'inactive'])

function normalizeStatus(value) {
  if (!value && value !== 0) return 'unknown'
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    return trimmed || 'unknown'
  }
  return String(value).trim().toLowerCase() || 'unknown'
}

function buildRoleKey(hero) {
  const role = typeof hero?.role === 'string' ? hero.role.trim().toLowerCase() : ''
  const side = typeof hero?.side === 'string' ? hero.side.trim().toLowerCase() : ''
  if (!role) return null
  return `${role}::${side || 'any'}`
}

function cloneHeroForSlot(hero, slotNo) {
  if (!hero) return null
  const clone = { ...hero }
  if (slotNo != null) {
    clone.slot_no = slotNo
    clone.slotNo = slotNo
    const slotIndex = slotNo - 1
    clone.slot_index = slotIndex
    clone.slotIndex = slotIndex
  }
  return clone
}

function buildFallbackPools(slotsMap = {}) {
  const pools = new Map()
  for (let s = 1; s <= 12; s += 1) {
    const hero = slotsMap[s]
    if (!hero) continue
    const key = buildRoleKey(hero)
    if (!key) continue
    const entry = {
      hero,
      slotNo: s,
      status: normalizeStatus(hero.status),
    }
    if (pools.has(key)) {
      pools.get(key).push(entry)
    } else {
      pools.set(key, [entry])
    }
  }
  return pools
}

function findFallbackHero({ pools, key, excludeHeroId }) {
  if (!key || !pools.has(key)) return null
  const entries = pools.get(key) || []
  const normalizedExclude = excludeHeroId ? String(excludeHeroId) : null

  for (const entry of entries) {
    const heroId = entry?.hero?.hero_id ?? entry?.hero?.heroId ?? null
    const normalizedHeroId = heroId != null ? String(heroId) : null
    if (normalizedExclude && normalizedHeroId === normalizedExclude) {
      continue
    }
    if (DEFEATED_STATUS_SET.has(entry.status) || RETIRED_STATUS_SET.has(entry.status)) {
      continue
    }
    return entry
  }

  return null
}

function clearSlotPlaceholders(text, slotNo) {
  if (!text) return ''
  const pattern = new RegExp(`\\{\\{slot${slotNo}\\.[^}]+\\}\\}`, 'g')
  return text.replace(pattern, '')
}

function applyHeroPlaceholders(text, hero, slotNo) {
  if (!hero) {
    return clearSlotPlaceholders(text, slotNo)
  }

  let out = text
  out = out.replaceAll(`{{slot${slotNo}.name}}`, hero.name ?? '')
  out = out.replaceAll(`{{slot${slotNo}.description}}`, hero.description ?? '')
  for (let a = 1; a <= 12; a += 1) {
    out = out.replaceAll(`{{slot${slotNo}.ability${a}}}`, hero[`ability${a}`] ?? '')
  }
  out = out.replaceAll(`{{slot${slotNo}.role}}`, hero.role ?? '')
  out = out.replaceAll(`{{slot${slotNo}.side}}`, hero.side ?? '')
  out = out.replaceAll(`{{slot${slotNo}.status}}`, hero.status ?? '')
  out = out.replaceAll(`{{slot${slotNo}.owner_id}}`, hero.owner_id ?? '')
  out = out.replaceAll(`{{slot${slotNo}.ownerId}}`, hero.ownerId ?? '')
  out = out.replaceAll(`{{slot${slotNo}.slotNo}}`, hero.slotNo ?? hero.slot_no ?? '')
  out = out.replaceAll(`{{slot${slotNo}.slot_no}}`, hero.slot_no ?? hero.slotNo ?? '')
  out = out.replaceAll(`{{slot${slotNo}.name_or_role}}`, hero.name_or_role ?? hero.name ?? hero.role ?? '')
  out = out.replaceAll(`{{slot${slotNo}.display_name}}`, hero.display_name ?? hero.name ?? '')

  const keys = Object.keys(hero)
  keys.forEach((key) => {
    const placeholder = `{{slot${slotNo}.${key}}}`
    if (out.includes(placeholder)) {
      out = out.replaceAll(placeholder, stringifyValue(hero[key]))
    }
  })

  return out
}

function resolveSlotHero({
  slotNo,
  baseHero,
  pools,
}) {
  const meta = {
    baseHeroId: baseHero?.hero_id ?? baseHero?.heroId ?? null,
    baseStatus: normalizeStatus(baseHero?.status),
  }

  if (!baseHero) {
    return { hero: null, meta: { ...meta, skipped: true, reason: 'empty' } }
  }

  const key = buildRoleKey(baseHero)
  const status = meta.baseStatus

  if (DEFEATED_STATUS_SET.has(status)) {
    return { hero: null, meta: { ...meta, skipped: true, reason: 'defeated' } }
  }

  if (RETIRED_STATUS_SET.has(status) || !baseHero.hero_id) {
    const fallback = findFallbackHero({
      pools,
      key,
      excludeHeroId: baseHero.hero_id ?? baseHero.heroId ?? null,
    })

    if (fallback) {
      const heroClone = cloneHeroForSlot(fallback.hero, slotNo)
      return {
        hero: heroClone,
        meta: {
          ...meta,
          replaced: true,
          fallbackFromSlot: fallback.slotNo,
          fallbackHeroId: fallback.hero?.hero_id ?? fallback.hero?.heroId ?? null,
          fallbackStatus: fallback.status,
        },
      }
    }

    if (RETIRED_STATUS_SET.has(status)) {
      return { hero: null, meta: { ...meta, skipped: true, reason: 'retired' } }
    }
  }

  return {
    hero: cloneHeroForSlot(baseHero, slotNo),
    meta,
  }
}

export function compileTemplate({ template, slotsMap = {}, historyText = '' }) {
  if (!template) return { text: '', meta: {} }

  let out = template
  const lines = (historyText || '').split(/\r?\n/)
  const last1 = lines.slice(-1).join('\n')
  const last2 = lines.slice(-2).join('\n')
  const pools = buildFallbackPools(slotsMap)
  const slotMeta = {}

  for (let s = 1; s <= 12; s += 1) {
    const baseHero = slotsMap[s]
    const { hero, meta } = resolveSlotHero({ slotNo: s, baseHero, pools })
    if (meta) {
      slotMeta[s] = {
        ...meta,
        finalHeroId: hero?.hero_id ?? hero?.heroId ?? null,
        finalStatus: normalizeStatus(hero?.status),
      }
    }

    if (!hero) {
      out = clearSlotPlaceholders(out, s)
      continue
    }

    out = applyHeroPlaceholders(out, hero, s)
  }

  out = out.replaceAll('{{history.last1}}', last1)
  out = out.replaceAll('{{history.last2}}', last2)

  // 랜덤들
  out = out.replace(/\{\{random\.choice:([^}]+)\}\}/g, (_, g) => {
    const opts = g.split('|').map((s) => s.trim()).filter(Boolean)
    if (!opts.length) return ''
    return opts[Math.floor(Math.random() * opts.length)]
  })
  out = out.replaceAll('{{slot.random}}', String(Math.floor(Math.random() * 12) + 1))
  out = out.replaceAll(
    '{{random.ability}}',
    (() => {
      const k = Math.floor(Math.random() * 12) + 1
      return `{{slot${Math.floor(Math.random() * 12) + 1}.ability${k}}}`
    })(),
  )

  return { text: out, meta: { slots: slotMeta } }
}

function stringifyValue(value) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value) || typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (error) {
      return ''
    }
  }
  return ''
}
