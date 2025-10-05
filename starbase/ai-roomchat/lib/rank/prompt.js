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
    const slotIndex = slotNo
    clone.slot_index = slotIndex
    clone.slotIndex = slotIndex
    clone.slot_number = slotIndex + 1
    clone.slotNumber = clone.slot_number
  }
  return clone
}

function buildFallbackPools(slotsMap = {}) {
  const pools = new Map()
  for (let s = 0; s < 12; s += 1) {
    const hero = slotsMap[s]
    if (!hero) continue
    const key = buildRoleKey(hero)
    if (!key) continue
    const entry = {
      hero,
      slotNo: s,
      slotNumber: s + 1,
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

function placeholderLabels(slotNo) {
  const numeric = Number(slotNo)
  if (!Number.isFinite(numeric)) return []
  return [String(numeric)]
}

function clearSlotPlaceholders(text, slotNo) {
  if (!text) return ''
  let out = text
  const labels = placeholderLabels(slotNo)
  labels.forEach((label) => {
    const pattern = new RegExp(`\\{\\{slot${label}\\.[^}]+\\}\\}`, 'g')
    out = out.replace(pattern, '')
  })
  return out
}

function applyHeroPlaceholders(text, hero, slotNo) {
  if (!hero) {
    return clearSlotPlaceholders(text, slotNo)
  }

  let out = text
  const labels = placeholderLabels(slotNo)
  const zeroBasedValue = Number(slotNo)
  const oneBasedValue = zeroBasedValue + 1

  labels.forEach((label) => {
    out = out.replaceAll(`{{slot${label}.name}}`, hero.name ?? '')
    out = out.replaceAll(`{{slot${label}.description}}`, hero.description ?? '')
    for (let a = 1; a <= 12; a += 1) {
      out = out.replaceAll(`{{slot${label}.ability${a}}}`, hero[`ability${a}`] ?? '')
    }
    out = out.replaceAll(`{{slot${label}.role}}`, hero.role ?? '')
    out = out.replaceAll(`{{slot${label}.side}}`, hero.side ?? '')
    out = out.replaceAll(`{{slot${label}.status}}`, hero.status ?? '')
    out = out.replaceAll(`{{slot${label}.owner_id}}`, hero.owner_id ?? '')
    out = out.replaceAll(`{{slot${label}.ownerId}}`, hero.ownerId ?? '')

    const slotNoValue = hero.slotNo ?? hero.slot_no ?? zeroBasedValue

    out = out.replaceAll(`{{slot${label}.slotNo}}`, slotNoValue)
    out = out.replaceAll(`{{slot${label}.slot_no}}`, slotNoValue)
    out = out.replaceAll(
      `{{slot${label}.slotNumber}}`,
      hero.slotNumber ?? hero.slot_number ?? oneBasedValue,
    )
    out = out.replaceAll(
      `{{slot${label}.slot_number}}`,
      hero.slot_number ?? hero.slotNumber ?? oneBasedValue,
    )
    out = out.replaceAll(
      `{{slot${label}.slotIndex}}`,
      hero.slotIndex ?? hero.slot_index ?? zeroBasedValue,
    )
    out = out.replaceAll(
      `{{slot${label}.slot_index}}`,
      hero.slot_index ?? hero.slotIndex ?? zeroBasedValue,
    )
    out = out.replaceAll(
      `{{slot${label}.name_or_role}}`,
      hero.name_or_role ?? hero.name ?? hero.role ?? '',
    )
    out = out.replaceAll(
      `{{slot${label}.display_name}}`,
      hero.display_name ?? hero.name ?? '',
    )

    const keys = Object.keys(hero)
    keys.forEach((key) => {
      const placeholder = `{{slot${label}.${key}}}`
      if (out.includes(placeholder)) {
        out = out.replaceAll(placeholder, stringifyValue(hero[key]))
      }
    })
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
    slotNo,
    slotNumber: slotNo != null ? slotNo + 1 : null,
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
          fallbackFromSlotNumber: fallback.slotNumber,
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

  for (let s = 0; s < 12; s += 1) {
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
  const randomSlotZero = Math.floor(Math.random() * 12)
  out = out.replaceAll('{{slot.random}}', String(randomSlotZero))
  out = out.replaceAll('{{slot.random_one_based}}', String(randomSlotZero + 1))
  out = out.replaceAll('{{slot.randomOneBased}}', String(randomSlotZero + 1))
  out = out.replaceAll(
    '{{random.ability}}',
    (() => {
      const abilityIndex = Math.floor(Math.random() * 12) + 1
      const slotIndex = Math.floor(Math.random() * 12)
      return `{{slot${slotIndex}.ability${abilityIndex}}}`
    })(),
  )
  out = out.replaceAll(
    '{{random.ability_one_based}}',
    (() => {
      const abilityIndex = Math.floor(Math.random() * 12) + 1
      const slotIndex = Math.floor(Math.random() * 12) + 1
      return `{{slot${slotIndex}.ability${abilityIndex}}}`
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
