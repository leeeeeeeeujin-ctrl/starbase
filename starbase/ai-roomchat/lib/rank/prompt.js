// lib/rank/prompt.js

export function compileTemplate({ template, slotsMap, historyText = '' }) {
  if (!template) return { text: '', meta: {} }
  let out = template
  const lines = (historyText || '').split(/\r?\n/)
  const last1 = lines.slice(-1).join('\n')
  const last2 = lines.slice(-2).join('\n')

  for (let s = 1; s <= 12; s++) {
    const hero = slotsMap[s]
    if (!hero) continue
    out = out.replaceAll(`{{slot${s}.name}}`, hero.name ?? '')
    out = out.replaceAll(`{{slot${s}.description}}`, hero.description ?? '')
    for (let a = 1; a <= 12; a++) {
      out = out.replaceAll(`{{slot${s}.ability${a}}}`, hero[`ability${a}`] ?? '')
    }
    out = out.replaceAll(`{{slot${s}.role}}`, hero.role ?? '')
    out = out.replaceAll(`{{slot${s}.side}}`, hero.side ?? '')
    out = out.replaceAll(`{{slot${s}.status}}`, hero.status ?? '')
    out = out.replaceAll(`{{slot${s}.owner_id}}`, hero.owner_id ?? '')
    out = out.replaceAll(`{{slot${s}.ownerId}}`, hero.ownerId ?? '')
    out = out.replaceAll(`{{slot${s}.slotNo}}`, hero.slotNo ?? hero.slot_no ?? '')
    out = out.replaceAll(`{{slot${s}.slot_no}}`, hero.slot_no ?? hero.slotNo ?? '')
    out = out.replaceAll(`{{slot${s}.name_or_role}}`, hero.name_or_role ?? hero.name ?? hero.role ?? '')
    out = out.replaceAll(`{{slot${s}.display_name}}`, hero.display_name ?? hero.name ?? '')

    const keys = Object.keys(hero)
    keys.forEach((key) => {
      const placeholder = `{{slot${s}.${key}}}`
      if (out.includes(placeholder)) {
        out = out.replaceAll(placeholder, stringifyValue(hero[key]))
      }
    })
  }

  out = out.replaceAll('{{history.last1}}', last1)
  out = out.replaceAll('{{history.last2}}', last2)

  // 랜덤들
  out = out.replace(/\{\{random\.choice:([^}]+)\}\}/g, (_, g) => {
    const opts = g.split('|').map(s => s.trim()).filter(Boolean)
    if (!opts.length) return ''
    return opts[Math.floor(Math.random() * opts.length)]
  })
  out = out.replaceAll('{{slot.random}}', String(Math.floor(Math.random()*12)+1))
  out = out.replaceAll('{{random.ability}}', (() => {
    const k = Math.floor(Math.random()*12)+1
    return `{{slot${Math.floor(Math.random()*12)+1}.ability${k}}}`
  })())

  return { text: out, meta: {} }
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
