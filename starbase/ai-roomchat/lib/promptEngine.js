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
/* =========================
   [변수/가시성/규칙] 확장 유틸
   ========================= */

/** 두 번째 줄 위(倒數第二行)에 변수명을 적도록 모델에 지시하는 규칙 텍스트 생성.
 *  - manualVars: [{ name, instruction }]  (instruction = 사람이 읽는 "변수 내용/조건" 설명)
 *  - activeVars: [{ name, ruleText }]     (ruleText = 이 변수가 '나오면' 규칙에 추가되는 지시문)
 *  - returns 규칙 텍스트 (프롬프트 앞머리에 덧붙여 쓰기)
 */
export function buildRulesText({ manualVars = [], activeVars = [] } = {}) {
  const manualLines = (manualVars || [])
    .filter(v => v?.name)
    .map(v => `- (수동변수) 만약 "${v.instruction || v.name}" 상태라면, 응답의 '밑에서 두 번째 줄'에 정확히 ${v.name} 만 적어라.`)

  const activeLines = (activeVars || [])
    .filter(v => v?.name && v?.ruleText)
    .map(v => `- (적극변수) ${v.name} 이(가) 감지되면, 아래 규칙을 즉시 추가로 적용하라: ${v.ruleText}`)

  if (manualLines.length === 0 && activeLines.length === 0) return ''
  return [
    '## [변수/규칙 지침]',
    '아래 규칙은 항상 최상단에서 우선한다.',
    ...manualLines,
    ...activeLines,
    '응답 형식: 마지막 줄에는 승/패 등의 최종 판정만, 그 윗줄(밑에서 두 번째 줄)에는 감지된 수동변수명들을 공백 없이 콤마로 구분해 적을 수 있다.(예: VAR_A,VAR_B)',
    ''
  ].join('\n')
}

/** AI 응답에서 "밑에서 두 번째 줄"에서 변수명들을 추출. (수동변수 이름 목록 반환)
 *   - knownNames: 수동/적극 변수명 union (이름으로 필터링)
 */
export function extractDeclaredVars({ aiText = '', knownNames = [] }) {
  const lines = String(aiText || '').split(/\r?\n/)
  if (lines.length < 2) return []
  const secondLast = lines[lines.length - 2] || ''
  // 쉼표/공백/파이프 구분자 허용
  const raw = secondLast.split(/[,|\s]+/).map(s => s.trim()).filter(Boolean)
  if (!knownNames?.length) return raw
  const dict = new Set(knownNames.map(n => n.toUpperCase()))
  return raw.filter(t => dict.has(t.toUpperCase()))
}

/** 적극 변수(= 규칙 증강 변수)가 감지되었을 때, 해당 ruleText들을 규칙에 추가 */
export function applyActiveVarRules({ detectedVars = [], activeVars = [] }) {
  const picked = new Set(detectedVars.map(v => v.toUpperCase()))
  const extra = (activeVars || [])
    .filter(v => v?.name && v?.ruleText && picked.has(v.name.toUpperCase()))
    .map(v => `- (적용 규칙) ${v.ruleText}`)
  if (!extra.length) return ''
  return ['## [변수로 인해 추가된 규칙]', ...extra, ''].join('\n')
}

/** 슬롯 가시성 결정:
 *  - slotOpt.invisible === true 이고, slotOpt.visible_slots 배열이 존재하면,
 *    현재 실행 주체 slotNo가 visible_slots 안에 없을 때 "비가시성" 처리.
 *  - 반환값: { allowed:boolean, reason?:string }
 */
export function checkVisibility({ slotOpt = {}, currentSlotNo }) {
  const inv = !!slotOpt?.invisible
  const only = Array.isArray(slotOpt?.visible_slots) ? slotOpt.visible_slots : null
  if (!inv) return { allowed: true }
  if (!only || only.length === 0) return { allowed: false, reason: 'invisible' }
  const ok = only.map(Number).includes(Number(currentSlotNo))
  return { allowed: ok, reason: ok ? undefined : 'invisible:not-in-whitelist' }
}

/** 프롬프트 최종 합성:
 *   - base: 슬롯 자체 템플릿
 *   - rulesGlobal: 전역 규칙(문자열)
 *   - rulesLocal:  로컬 규칙(문자열)
 *   - activeExtraRules: 감지된 적극변수로 인한 추가 규칙(문자열)
 */
export function stitchPrompt({ base, rulesGlobal = '', rulesLocal = '', activeExtraRules = '' }) {
  return [rulesGlobal, rulesLocal, activeExtraRules, base].filter(Boolean).join('\n')
}

/* =========================
   [엔진 통합 지점 예시]
   =========================
   아래는 "현재 슬롯 실행" 시에 쓰는 예시 코드 흐름이야.
   - 이미 갖춘 compileTemplate / runBridges가 있다면,
     그 앞뒤로 변수/가시성만 끼워 넣으면 됨.
*/

export async function runOneSlotWithVars({
  slot,                // { template, options:{ manual_vars, active_vars, invisible, visible_slots } ... }
  currentSlotNo,       // 현재 실행 주체 슬롯 번호 (1..12)
  rulesGlobalText,     // 세트 전역 규칙 텍스트(선택)
  historyText,         // 히스토리 텍스트(모델로 전달 여부와 별개로 엔진이 들고 있는 전체 텍스트)
  knownVarNames = [],  // 전체 정의된 수동/적극 변수명 union
  lastAiText = '',     // 직전 AI 응답(변수 추출용)
  previouslyDetected = [] // 이전 턴까지 누적 감지된 변수 목록
}) {
  const opt = slot?.options || {}
  const vis = checkVisibility({ slotOpt: opt, currentSlotNo })
  if (!vis.allowed) {
    return { skip: true, reason: vis.reason }
  }

  // 1) 규칙 빌드: 전역 + 로컬
  const rulesLocal = buildRulesText({
    manualVars: opt.manual_vars || [],
    activeVars: opt.active_vars || []
  })

  // 2) (선택) 직전 응답에서 변수 감지 → 적극 규칙을 추가로 부여
  const detectedNow = extractDeclaredVars({
    aiText: lastAiText,
    knownNames: knownVarNames
  })
  const activeExtraRules = applyActiveVarRules({
    detectedVars: [...new Set([...previouslyDetected, ...detectedNow])],
    activeVars: [...(opt.active_vars || [])] // 로컬 적극 변수 기준 (전역 쪽과 합쳐도 좋음)
  })

  // 3) 프롬프트 합성
  const finalPrompt = stitchPrompt({
    base: String(slot?.template || ''),
    rulesGlobal: rulesGlobalText || '',
    rulesLocal,
    activeExtraRules
  })

  // 4) (여기서 compileTemplate를 써서 슬롯 토큰 치환, history.* 토큰 등 적용)
  //    예: const { text } = compileTemplate({ template: finalPrompt, slots, historyText })
  return { skip: false, prompt: finalPrompt, detectedNow }
}
