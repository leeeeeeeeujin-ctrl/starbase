// lib/promptEngine.js
export function compileTemplate({ template, slots = {}, historyText = '' }) {
  if (!template) return { text: '', meta: {} }
  let out = template
  let pickedSlot = null

  // 슬롯 변수 치환
  for (let s = 1; s <= 12; s++) {
    const hero = slots[s]
    if (!hero) continue
    out = out.replaceAll(`{{slot${s}.name}}`, hero.name ?? '')
    out = out.replaceAll(`{{slot${s}.description}}`, hero.description ?? '')
    for (let a = 1; a <= 12; a++) {
      out = out.replaceAll(`{{slot${s}.ability${a}}}`, hero[`ability${a}`] ?? '')
    }
  }

  // 랜덤 슬롯 번호
  out = out.replaceAll('{{slot.random}}', () => {
    pickedSlot = Math.floor(Math.random() * 12) + 1
    return String(pickedSlot)
  })

  // 랜덤 능력
  out = out.replaceAll('{{random.ability}}', () => {
    const k = Math.floor(Math.random() * 4) + 1
    return slots[pickedSlot]?.[`ability${k}`] ?? ''
  })

  // 랜덤 선택
  out = out.replace(/\{\{random\.choice:([^}]+)\}\}/g, (_, group) => {
    const opts = group.split('|').map(s => s.trim()).filter(Boolean)
    if (opts.length === 0) return ''
    const idx = Math.floor(Math.random() * opts.length)
    return opts[idx]
  })

  // 히스토리 토큰
  const lines = (historyText || '').split(/\r?\n/)
  out = out.replaceAll('{{history.last1}}', lines.slice(-1).join('\n'))
  out = out.replaceAll('{{history.last2}}', lines.slice(-2).join('\n'))
  out = out.replaceAll('{{history.all}}', historyText)

  return { text: out, meta: { pickedSlot } }
}
