// lib/promptEngine.js
export function compileTemplate({ template, slots = {}, historyText = '' }) {
  if (!template) return { text: '', meta: {} }
  let out = String(template)
  let pickedSlot = null

  // 직전 응답 줄 분리
  const lines = (historyText || '').split(/\r?\n/)
  const last1 = lines.slice(-1).join('\n')
  const last2 = lines.slice(-2).join('\n')

  out = out.replaceAll('{{history.last1}}', last1)
  out = out.replaceAll('{{history.last2}}', last2)

  // 슬롯별 치환 (1~12번 캐릭터)
  for (let s = 1; s <= 12; s++) {
    const slotHero = slots[s]
    if (!slotHero) continue
    out = out.replaceAll(`{{slot${s}.name}}`, slotHero.name ?? '')
    out = out.replaceAll(`{{slot${s}.description}}`, slotHero.description ?? '')
    for (let a = 1; a <= 12; a++) {
      out = out.replaceAll(`{{slot${s}.ability${a}}}`, slotHero[`ability${a}`] ?? '')
    }
  }

  // 랜덤 슬롯 번호 (1~12)
  out = out.replaceAll('{{slot.random}}', () => {
    pickedSlot = Math.floor(Math.random() * 12) + 1
    return String(pickedSlot)
  })

  // 랜덤 능력 (1~12 중 하나)
  out = out.replaceAll('{{random.ability}}', () => {
    const k = Math.floor(Math.random() * 12) + 1
    const rndHero = slots[pickedSlot] || Object.values(slots)[0] // 랜덤 슬롯 없으면 첫 캐릭터
    return rndHero?.[`ability${k}`] ?? ''
  })

  // 임의 선택: {{random.choice:A|B|C}}
  out = out.replace(/\{\{random\.choice:([^}]+)\}\}/g, (_, group) => {
    const opts = group.split('|').map(s => s.trim()).filter(Boolean)
    if (opts.length === 0) return ''
    const idx = Math.floor(Math.random() * opts.length)
    return opts[idx]
  })

  return { text: out, meta: { pickedSlot } }
}
