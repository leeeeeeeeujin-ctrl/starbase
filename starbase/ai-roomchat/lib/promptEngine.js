// 안전한 슬롯 탐색 (실존 슬롯 번호 수집)
function existingSlotIndexes(slots) {
  const list = []
  for (let s = 1; s <= 12; s++) if (slots[s]) list.push(s)
  return list
}

// 템플릿 → 텍스트 변환 (슬롯/히스토리/랜덤토큰 처리)
export function compileTemplate({ template, slots = {}, historyText = '' }) {
  if (!template) return { text: '', meta: {} }
  let out = template
  let pickedSlot = null

  // 슬롯 치환
  for (let s = 1; s <= 12; s++) {
    const hero = slots[s]
    if (!hero) continue
    out = out.replaceAll(`{{slot${s}.name}}`, hero.name ?? '')
    out = out.replaceAll(`{{slot${s}.description}}`, hero.description ?? '')
    out = out.replaceAll(`{{slot${s}.role}}`, hero.role ?? '')
    for (let a = 1; a <= 12; a++) {
      out = out.replaceAll(`{{slot${s}.ability${a}}}`, hero[`ability${a}`] ?? '')
    }
  }

  // 랜덤 슬롯 이름/번호
  out = out.replaceAll('{{random.slot.name}}', () => {
    const avail = existingSlotIndexes(slots)
    if (!avail.length) return ''
    const s = avail[Math.floor(Math.random() * avail.length)]
    return slots[s]?.name ?? ''
  })

  out = out.replaceAll('{{slot.random}}', () => {
    const avail = existingSlotIndexes(slots)
    if (!avail.length) { pickedSlot = null; return '1' }
    pickedSlot = avail[Math.floor(Math.random() * avail.length)]
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
    if (!opts.length) return ''
    return opts[Math.floor(Math.random() * opts.length)]
  })

  // 히스토리 토큰
  const histLines = String(historyText || '').split(/\r?\n/)
  out = out.replaceAll('{{history.last1}}', histLines.slice(-1).join('\n'))
  out = out.replaceAll('{{history.last2}}', histLines.slice(-2).join('\n'))
  out = out.replaceAll('{{history.last5}}', histLines.slice(-5).join('\n'))
  out = out.replaceAll('{{history.all}}', historyText)

  return { text: out, meta: { pickedSlot } }
}

// 브릿지 실행(조건·우선순위 기반으로 다음 경로 1개 결정)
export function runBridges({ bridges = [], context }) {
  const { historyText = '', visitedSlots = new Set(), turn = 1 } = context || {}
  const lines = String(historyText).split(/\r?\n/)
  const last1 = lines.slice(-1).join('\n')
  const last2 = lines.slice(-2).join('\n')
  const last5 = lines.slice(-5).join('\n')

  const scopeText = (scope) => {
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
        if (!String(scopeText(c.scope || 'last2')).includes(String(c.value || ''))) { ok = false; break }
      } else if (c.type === 'prev_prompt_contains') {
        if (!String(scopeText(c.scope || 'last1')).includes(String(c.value || ''))) { ok = false; break }
      } else if (c.type === 'prev_ai_regex') {
        try {
          const re = new RegExp(String(c.pattern || ''), String(c.flags || ''))
          if (!re.test(String(scopeText(c.scope || 'last1')))) { ok = false; break }
        } catch { ok = false; break }
      } else if (c.type === 'visited_slot') {
        if (!visitedSlots.has(String(c.slot_id))) { ok = false; break }
      } else if (c.type === 'fallback') {
        // 항상 참(다른 조건과 함께 있어도 true 취급)
      }
    }
    if (ok) candidates.push(b)
  }

  candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return candidates[0] || null
}

// 전역/로컬 변수 규칙을 시스템 프롬프트에 얹는 텍스트로 변환
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
