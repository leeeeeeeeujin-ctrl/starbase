// starbase/ai-roomchat/lib/promptEngine.js

/* =========================================================
   유틸
========================================================= */
function safeStr(v) {
  if (v == null) return ''
  try {
    return String(v)
  } catch {
    return ''
  }
}

function clamp(n, min, max) {
  const x = Number(n)
  if (!Number.isFinite(x)) return min
  return Math.max(min, Math.min(max, x))
}

/* =========================================================
   슬롯 빌더: 참가자 → 슬롯 맵
========================================================= */
/**
 * participants: [
 *   {
 *     hero_id, role, status, score, hero: { name, description, image_url, ability1..ability12 }
 *   }
 * ]
 * return: { 1: {id, role, status, name, ...}, 2: {…}, ... }
 */
export function buildSlotsFromParticipants(participants = []) {
  const slots = {}
  let i = 1
  for (const p of participants) {
    if (i > 12) break
    const h = p?.hero || {}
    const row = {
      id: p.hero_id || null,
      role: p.role || null,
      status: p.status || 'alive',
      name: safeStr(h.name),
      description: safeStr(h.description),
      image_url: h.image_url || null,
    }
    for (let k = 1; k <= 12; k++) {
      row[`ability${k}`] = safeStr(h[`ability${k}`])
    }
    slots[i] = row
    i++
  }
  return slots
}

/* =========================================================
   상태 인덱스: 역할/상태별 빠른 카운트
   participantsStatus: [{role, status}]
========================================================= */
export function buildStatusIndex(participantsStatus = [], myRole = null) {
  const roleMap = new Map() // role -> { alive: n, defeated: n }
  for (const r of participantsStatus) {
    const role = safeStr(r.role)
    const rawStatus = safeStr(r.status).toLowerCase()
    const st = (rawStatus === 'defeated' || rawStatus === 'lost' || rawStatus === 'eliminated') ? 'defeated' : 'alive'
    const bucket = roleMap.get(role) || { alive: 0, defeated: 0 }
    bucket[st] += 1
    roleMap.set(role, bucket)
  }

  // 전체 합계
  let totalAlive = 0, totalDefeated = 0
  for (const v of roleMap.values()) {
    totalAlive += v.alive
    totalDefeated += v.defeated
  }

  function count({ who = 'role', role = null, status = 'alive', myRoleOverride = myRole } = {}) {
    const st = (status === 'defeated' || status === 'lost') ? 'defeated' : 'alive'
    if (who === 'same') {
      if (!myRoleOverride) return 0
      const b = roleMap.get(String(myRoleOverride))
      return b ? (b[st] || 0) : 0
    }
    if (who === 'other') {
      if (!myRoleOverride) return st === 'alive' ? totalAlive : totalDefeated
      // 전체 - 내 역할
      const mine = roleMap.get(String(myRoleOverride))
      const mineCnt = mine ? (mine[st] || 0) : 0
      return (st === 'alive' ? totalAlive : totalDefeated) - mineCnt
    }
    // 특정 role
    const b = roleMap.get(String(role))
    return b ? (b[st] || 0) : 0
  }

  return { count }
}

/* =========================================================
   시스템 프롬프트 빌더 (체크리스트 기반)
   rules 예시:
   {
     world: "세계관 설명",
     tone: "톤/스타일",
     constraints: ["규칙1", "규칙2", ...]
   }
========================================================= */
export function buildSystemPromptFromChecklist(rules = {}) {
  const out = []
  const title = safeStr(rules?.title || rules?.name)
  const world = safeStr(rules?.world || rules?.setting)
  const tone = safeStr(rules?.tone || rules?.style)
  const objective = safeStr(rules?.objective || rules?.goal)
  const constraints = Array.isArray(rules?.constraints) ? rules.constraints : []
  const notes = Array.isArray(rules?.notes) ? rules.notes : []

  if (title) out.push(`# 규칙명: ${title}`)
  if (world) out.push(`## 세계관\n${world}`)
  if (tone) out.push(`## 톤/스타일\n${tone}`)
  if (objective) out.push(`## 목적\n${objective}`)
  if (constraints.length) {
    out.push('## 제약')
    constraints.forEach((c, i) => out.push(`- ${safeStr(c)}`))
  }
  if (notes.length) {
    out.push('## 비고')
    notes.forEach((c) => out.push(`- ${safeStr(c)}`))
  }

  // 마지막 고정 지시
  out.push(
    [
      '## 출력 형식',
      '- 응답의 마지막 줄에는 승패 또는 결론만 적어라.',
      '- 응답의 마지막에서 두 번째 줄에는 만족한 변수명을 공백으로 구분해 적어라. 없으면 빈 줄을 남겨라.',
      '- 마지막에서 다섯 번째 줄까지는 공백 줄을 유지하라.',
    ].join('\n'),
  )

  return out.join('\n')
}

/* =========================================================
   변수 시스템 (패치 반영)
========================================================= */
function _normalizeManualEntry(entry) {
  const name = safeStr(entry?.name ?? entry?.variable).trim()
  const instruction = safeStr(entry?.instruction ?? entry?.condition ?? '').trim()
  if (!name) return null
  return { name, instruction }
}

function _buildManualVarLines(arr = [], scopeLabel) {
  const out = []
  for (const raw of arr) {
    const norm = _normalizeManualEntry(raw)
    if (!norm) continue
    const ins = norm.instruction || '해당 조건을 만족하면 변수명을 출력한다.'
    out.push(`- ${scopeLabel} 변수 ${norm.name}: ${ins} → 만족하면 응답의 둘째 줄(끝에서 두 번째)에 "${norm.name}"를 적어라.`)
  }
  return out
}

function _normalizeActiveEntry(entry) {
  return {
    name: safeStr(entry?.name ?? entry?.variable).trim(),
    directive: safeStr(entry?.ruleText ?? entry?.directive ?? '').trim(),
    condition: safeStr(entry?.condition ?? '').trim(),
  }
}

function _buildActiveVarLines(arr = [], activeNames = [], scopeLabel) {
  const out = []
  const activeSet = new Set((activeNames || []).map((x) => String(x)))
  for (const raw of arr) {
    const norm = _normalizeActiveEntry(raw)
    if (!norm.directive) continue

    if (norm.name) {
      if (activeSet.size > 0 && !activeSet.has(norm.name)) continue
      let line = `- [${scopeLabel}:${norm.name}] 지시: ${norm.directive}`
      if (norm.condition) line += ` (조건: ${norm.condition})`
      out.push(line)
    } else {
      let line = `- [${scopeLabel}] 지시: ${norm.directive}`
      if (norm.condition) line += ` (조건: ${norm.condition})`
      out.push(line)
    }
  }
  return out
}

export function buildVariableRules({
  manual_vars_global = [],
  manual_vars_local = [],
  active_vars_global = [],
  active_vars_local = [],
  activeGlobalNames = [],
  activeLocalNames = []
} = {}) {
  const lines = []
  lines.push(..._buildManualVarLines(manual_vars_global, '전역'))
  lines.push(..._buildManualVarLines(manual_vars_local,  '로컬'))
  lines.push(..._buildActiveVarLines(active_vars_global, activeGlobalNames, '전역'))
  lines.push(..._buildActiveVarLines(active_vars_local,  activeLocalNames,  '로컬'))
  return lines.join('\n')
}

/* =========================================================
   AI 히스토리
========================================================= */
export function createAiHistory() {
  const buf = []
  return {
    beginSession() {
      // no-op / 세션 경계 마킹 원하면 여기서 처리
    },
    push({ role, content, public: isPublic = true }) {
      buf.push({ role, content: safeStr(content), public: !!isPublic })
    },
    joinedText({ onlyPublic = true, last = 8 } = {}) {
      const items = buf.filter((h) => (onlyPublic ? h.public : true)).slice(-clamp(last, 1, 50))
      return items.map((h) => `${h.role.toUpperCase()}: ${h.content}`).join('\n')
    },
  }
}

/* =========================================================
   브릿지 평가
   edge.data: {
     trigger_words: string[],
     conditions: [{ left:'var', op:'includes'|'equals'|'gte'|'lte'|'gt'|'lt', right:'value' }],
     priority, probability, fallback, action
   }
   ctx: {
     turn, historyUserText, historyAiText, visitedSlotIds, myRole,
     participantsStatus, activeGlobalNames, activeLocalNames
   }
========================================================= */
export function evaluateBridge(edgeData = {}, ctx = {}) {
  // 확률
  const p = Number(edgeData?.probability ?? 1)
  if (p < 1) {
    if (Math.random() > Math.max(0, Math.min(1, p))) return false
  }

  // 트리거 단어: 최근 AI/USER 텍스트 양쪽에 대해 OR 매칭
  const hay = `${safeStr(ctx.historyUserText)}\n${safeStr(ctx.historyAiText)}`.toLowerCase()
  const triggers = Array.isArray(edgeData?.trigger_words) ? edgeData.trigger_words : []
  if (triggers.length) {
    const ok = triggers.some((tw) => hay.includes(safeStr(tw).toLowerCase()))
    if (!ok) return false
  }

  // 조건
  const conds = Array.isArray(edgeData?.conditions) ? edgeData.conditions : []
  for (const c of conds) {
    const left = safeStr(c?.left).toLowerCase()
    const op = safeStr(c?.op || c?.operator).toLowerCase()
    const rightRaw = c?.right

    // 간단한 변수/상태값 소스
    let lv = null
    if (left === 'turn') lv = Number(ctx.turn || 0)
    else if (left === 'has_global') lv = !!(ctx.activeGlobalNames || []).includes(String(rightRaw))
    else if (left === 'has_local') lv = !!(ctx.activeLocalNames || []).includes(String(rightRaw))
    else if (left === 'visited') lv = !!(ctx.visitedSlotIds || new Set()).has(String(rightRaw))
    else if (left === 'my_role') lv = safeStr(ctx.myRole)
    else lv = safeStr(left) // fallback

    // 비교
    const rvNum = Number(rightRaw)
    switch (op) {
      case 'includes':
        if (!safeStr(hay).includes(safeStr(rightRaw).toLowerCase())) return false
        break
      case 'equals':
        if (safeStr(lv) !== safeStr(rightRaw)) return false
        break
      case 'gte':
        if (!(Number(lv) >= rvNum)) return false
        break
      case 'lte':
        if (!(Number(lv) <= rvNum)) return false
        break
      case 'gt':
        if (!(Number(lv) > rvNum)) return false
        break
      case 'lt':
        if (!(Number(lv) < rvNum)) return false
        break
      default:
        // 알 수 없는 연산자는 통과
        break
    }
  }

  return true
}

/* =========================================================
   노드 프롬프트 컴파일
   params:
     node: { id, slot_no, template, slot_type, options }
     slots: buildSlotsFromParticipants() 결과
     historyText: 직전 히스토리 텍스트
     activeGlobalNames, activeLocalNames
     currentSlot: 이전 랜덤 슬롯 또는 외부에서 지정
========================================================= */
function _serializeSlot(slotNo, meta = {}) {
  const lines = []
  lines.push(`슬롯 ${slotNo}`)
  if (meta.name) lines.push(`이름: ${meta.name}`)
  if (meta.role) lines.push(`역할: ${meta.role}`)
  if (meta.status) lines.push(`상태: ${meta.status}`)
  if (meta.description) lines.push(`설명: ${meta.description}`)
  for (let i = 1; i <= 4; i++) {
    const ab = meta[`ability${i}`]
    if (ab) lines.push(`능력${i}: ${ab}`)
  }
  return lines.join('\n')
}

function _pickRandomSlot(visibleList = [], fallbackPool = []) {
  const pool = (visibleList && visibleList.length ? visibleList : fallbackPool).filter(
    (n) => Number.isFinite(Number(n)),
  )
  if (!pool.length) return null
  const idx = Math.floor(Math.random() * pool.length)
  return Number(pool[idx])
}

export function makeNodePrompt({
  node,
  slots = {},
  historyText = '',
  activeGlobalNames = [],
  activeLocalNames = [],
  currentSlot = null,
} = {}) {
  const t = safeStr(node?.template)
  const options = node?.options || {}
  const visible = Array.isArray(options.visible_slots) ? options.visible_slots : []
  const slotNumbers = Object.keys(slots)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)

  // 랜덤 슬롯 선택 (필요시)
  let pickedSlot = currentSlot
  if (pickedSlot == null && t.includes('{{RANDOM_SLOT}}')) {
    pickedSlot = _pickRandomSlot(visible, slotNumbers)
  }

  // 변수 규칙 라인
  const varRuleText = buildVariableRules({
    manual_vars_global: options.manual_vars_global,
    manual_vars_local: options.manual_vars_local,
    active_vars_global: options.active_vars_global,
    active_vars_local: options.active_vars_local,
    activeGlobalNames,
    activeLocalNames,
  })

  // 슬롯 직렬화 텍스트
  const recipients = visible.length ? visible : slotNumbers
  const slotDump = recipients
    .map((n) => _serializeSlot(n, slots[n] || {}))
    .join('\n\n')

  // 템플릿 구성
  let text = t
    .replaceAll('{{HISTORY}}', safeStr(historyText))
    .replaceAll('{{SLOTS}}', slotDump)
    .replaceAll('{{VARIABLE_RULES}}', varRuleText)

  if (pickedSlot != null) {
    text = text.replaceAll('{{RANDOM_SLOT}}', `슬롯 ${pickedSlot}`)
  }

  // 가시성 / 대상 안내
  const visibilityNote = options?.invisible
    ? `\n[공개 범위] 이 메시지는 지정된 슬롯에게만 보인다.`
    : `\n[공개 범위] 전체 공개.`

  text = `${text}\n${visibilityNote}`

  return {
    text,
    pickedSlot,
  }
}

/* =========================================================
   결과 파서
   - 마지막 줄: 승/패/결론
   - 마지막에서 두 번째 줄: 활성 변수명 공백 구분
========================================================= */
export function parseOutcome(fullText = '') {
  const lines = safeStr(fullText).split(/\r?\n/)
  // 끝 공백 제거
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()

  const lastLine = lines.length ? lines[lines.length - 1].trim() : ''
  const secondLast = lines.length > 1 ? lines[lines.length - 2].trim() : ''
  const variables = secondLast ? secondLast.split(/\s+/).filter(Boolean) : []

  return { lastLine, variables }
}

/* =========================================================
   모듈 기본 export 묶음 (선택)
========================================================= */
export default {
  safeStr,
  buildSlotsFromParticipants,
  buildStatusIndex,
  buildSystemPromptFromChecklist,
  buildVariableRules,
  createAiHistory,
  evaluateBridge,
  makeNodePrompt,
  parseOutcome,
}
