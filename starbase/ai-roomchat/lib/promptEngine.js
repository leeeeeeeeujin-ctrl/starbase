// lib/promptEngine.js
// --- [추가] 유틸: 실제 존재하는 슬롯 목록 뽑기
function existingSlotIndexes(slots) {
  const list = []
  for (let s = 1; s <= 12; s++) if (slots[s]) list.push(s)
  return list
}
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

  // [추가] 랜덤 슬롯 이름
out = out.replaceAll('{{random.slot.name}}', () => {
  const avail = existingSlotIndexes(slots)
  if (avail.length === 0) return ''
  const idx = Math.floor(Math.random() * avail.length)
  const s = avail[idx]
  return slots[s]?.name ?? ''
})

// [추가] 슬롯 역할 치환
for (let s = 1; s <= 12; s++) {
  const hero = slots[s]
  if (!hero) continue
  out = out.replaceAll(`{{slot${s}.role}}`, hero.role ?? '')
}



  // 랜덤 슬롯 번호
out = out.replaceAll('{{slot.random}}', () => {
  const avail = existingSlotIndexes(slots)
  if (avail.length === 0) { pickedSlot = null; return '1' }
  const idx = Math.floor(Math.random() * avail.length)
  pickedSlot = avail[idx]
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
 out = out.replaceAll('{{history.last5}}', lines.slice(-5).join('\n'))
 out = out.replaceAll('{{history.all}}', historyText)
  return { text: out, meta: { pickedSlot } }
}

export function runBridges({ bridges = [], context }) {
  const { historyText = '', visitedSlots = new Set(), turn = 1 } = context || {}
  const lines = String(historyText).split(/\r?\n/)
  const last1 = lines.slice(-1).join('\n')
  const last2 = lines.slice(-2).join('\n')
  const last5 = lines.slice(-5).join('\n')
  function scopeText(scope) {
    if (scope === 'last1') return last1
    if (scope === 'last2') return last2
    if (scope === 'last5') return last5
    return historyText
  }

  const candidates = []
  for (const b of (bridges || [])) {
    let ok = true
    for (const c of (b.conditions || [])) {
      if (c.type === 'random') {
        const p = Number(c.p ?? 1)
        if (Math.random() > p) { ok = false; break }
      } else if (c.type === 'turn_gte') {
        if (!(turn >= Number(c.value ?? c.gte ?? 1))) { ok = false; break }
      } else if (c.type === 'turn_lte') {
        if (!(turn <= Number(c.value ?? c.lte ?? 1))) { ok = false; break }
      } else if (c.type === 'prev_ai_contains') {
        const txt = scopeText(c.scope || 'last2')
        if (!String(txt).includes(String(c.value || ''))) { ok = false; break }
      } else if (c.type === 'prev_prompt_contains') {
        const txt = scopeText(c.scope || 'last1')
        if (!String(txt).includes(String(c.value || ''))) { ok = false; break }
      } else if (c.type === 'prev_ai_regex') {
        try {
          const re = new RegExp(String(c.pattern || ''), String(c.flags || ''))
          const txt = scopeText(c.scope || 'last1')
          if (!re.test(String(txt))) { ok = false; break }
        } catch { ok = false; break }
      } else if (c.type === 'visited_slot') {
        if (!visitedSlots.has(String(c.slot_id))) { ok = false; break }
      } else if (c.type === 'fallback') {
        // fallback은 항상 매칭 후보 (다른 조건이 있으면 같이 true로 간주)
      }
    }
    if (ok) candidates.push(b)
  }

  // 우선순위 내림차순, 동일 우선순위면 앞의 것을 우선(원하면 무작위 선택으로 바꿔도 됨)
  candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return candidates[0] || null
}
// 규칙 텍스트 빌더 (전역/로컬 변수 규칙을 시스템 프롬프트 앞에 덧붙일 문자열로 변환)
export function buildRulesText({ globalRules = [], localRules = [] }) {
  const rules = [...(globalRules || []), ...(localRules || [])]
  if (!rules.length) return ''

  const out = [
    '[규칙] 조건을 만족하면 "마지막에서 두 번째 줄"에 변수명만 적는다. 여러 개면 공백으로 나열.'
  ]

  for (const r of rules) {
    if (!r?.name) continue
    const scope = r.scope || 'last2'
    switch (r.when) {
      case 'prev_ai_contains':
        out.push(`- 이전응답(${scope})에 "${r.value}" 포함 시 '${r.name}'`)
        break
      case 'prev_prompt_contains':
        out.push(`- 이전프롬프트(${scope})에 "${r.value}" 포함 시 '${r.name}'`)
        break
      case 'prev_ai_regex':
        out.push(`- 이전응답(${scope}) 정규식 /${r.pattern || r.value || ''}/${r.flags || ''} 일치 시 '${r.name}'`)
        break
      case 'turn_gte':
        out.push(`- 턴 ≥ ${r.value} 이면 '${r.name}'`)
        break
      case 'turn_lte':
        out.push(`- 턴 ≤ ${r.value} 이면 '${r.name}'`)
        break
      default:
        out.push(`- 조건(${r.when}) 충족 시 '${r.name}'`)
    }
  }

  return out.join('\n')
}
