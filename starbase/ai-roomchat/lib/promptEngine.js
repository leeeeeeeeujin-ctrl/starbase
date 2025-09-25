function safeStr(x) {
  return (x == null ? '' : String(x))
}

function linesOf(text = '') {
  return String(text || '').split(/\r?\n/)
}

/* =========================================================
   슬롯 빌더: 참가자 정보를 슬롯 템플릿에 넣기 위한 가공
   participants: [{role, hero_id, hero:{...}, status}]
   ========================================================= */
export function buildSlotsFromParticipants(participants = []) {
  const slots = []
  let i = 0
  for (const p of participants) {
    const h = p.hero || {}
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
   상태 인덱스: 역할/상태별 카운트 빠른 계산
   participantsStatus: [{role, status:'alive'|'defeated'}...]
   myRole: 현재 내 역할(선택)
   ========================================================= */
export function buildStatusIndex(participantsStatus = [], myRole = null) {
  const roleMap = new Map() // role -> { alive: n, defeated: n }
  for (const r of participantsStatus) {
    const role = safeStr(r.role)
    const rawStatus = safeStr(r.status).toLowerCase()
    const st = (rawStatus === 'defeated' || rawStatus === 'lost' || rawStatus === 'eliminated') ? 'defeated' : 'alive'
    const bucket = roleMap.get(role) || { alive:0, defeated:0 }
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
    if (who === 'role') {
      const b = roleMap.get(String(role))
      return b ? (b[st] || 0) : 0
    }
    if (who === 'all') {
      return st === 'alive' ? totalAlive : totalDefeated
    }
    return 0
  }

  return { count }
}

/* =========================================================
   체크리스트 기반 시스템 프롬프트 빌더
   rules: { checklist:[{text,mandatory}] }
   ========================================================= */
export function buildSystemPromptFromChecklist(rules = {}) {
  const out = []
  const checklist = Array.isArray(rules.checklist) ? rules.checklist : []
  for (const item of checklist) {
    const line = safeStr(item.text)
    if (!line) continue
    if (item.mandatory) out.push(`(필수) ${line}`)
    else out.push(line)
  }
  return out.join('\n')
}

/* =========================================================
   변수 시스템
   * 범위(scope): global / local(노드 한정)
   * 유형(type):
     - manual: 사용자가 “조건→변수명 출력” 규칙을 가이드 텍스트로 넣음
     - active: 변수명이 활성 상태(예: 둘째 줄에서 감지)면 ruleText를 규칙에 추가
   옵션 스키마(권장):
   node.options = {
     // 가시성
     invisible: false,
     visible_slots: [1,3,...],

     // 변수(전역/로컬)
     manual_vars_global: [{name, instruction}],
     manual_vars_local:  [{name, instruction}],
     active_vars_global: [{name, ruleText}],
     active_vars_local:  [{name, ruleText}]
   }

   활성 변수명은 실행 컨텍스트에서 전달:
     activeGlobalNames, activeLocalNames (string[])
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
   프롬프트 템플릿 컴파일
   params:
     template, slots, historyText,
     options(위 스키마), activeGlobalNames, activeLocalNames, currentSlot
   ========================================================= */
export function compileTemplate({
  template = '',
  slots = [],
  historyText = '',
  options = {},
  activeGlobalNames = [],
  activeLocalNames = [],
  currentSlot = null
} = {}) {
  let out = template

  // 슬롯 채우기
  out = out.replace(/\{\{slot(\d+)\.(\w+)\}\}/g, (m, idx, field) => {
    const i = Number(idx) - 1
    if (i < 0 || i >= slots.length) return ''
    const row = slots[i]
    return row && row[field] != null ? String(row[field]) : ''
  })

  // 히스토리 삽입
  out = out.replace(/\{\{history\}\}/g, historyText)

  // 랜덤 치환
  out = out.replace(/\{\{pick:([^}]+)\}\}/g, (m, body) => {
    const opts = body.split('|').map(s => s.trim()).filter(Boolean)
    if (opts.length === 0) return ''
    const idx = Math.floor(Math.random() * opts.length)
    return opts[idx]
  })

  // 변수 규칙(전역/로컬)
  const varRules = buildVariableRules({
    manual_vars_global: options?.manual_vars_global || [],
    manual_vars_local:  options?.manual_vars_local  || [],
    active_vars_global: options?.active_vars_global || [],
    active_vars_local:  options?.active_vars_local  || [],
    activeGlobalNames, activeLocalNames
  })
  if (varRules) {
    out = `${out}\n\n[변수/규칙]\n${varRules}`
  }

  return { text: out, meta: { pickedSlot: currentSlot } }
}

export function makeNodePrompt({
  node = null,
  slots = [],
  historyText = '',
  activeGlobalNames = [],
  activeLocalNames = [],
  currentSlot = null,
} = {}) {
  if (!node) {
    return { text: '', pickedSlot: null }
  }

  const slotHint =
    currentSlot != null
      ? String(currentSlot)
      : node.id != null
        ? String(node.id)
        : null

  const { text, meta } = compileTemplate({
    template: node.template || '',
    slots,
    historyText,
    options: node.options || {},
    activeGlobalNames,
    activeLocalNames,
    currentSlot: slotHint,
  })

  return { text, pickedSlot: meta?.pickedSlot ?? slotHint }
}

/* =========================================================
   AI 응답 파서
   - lastLine: 승패/결론
   - secondLast: 공백 구분 변수명들
   ========================================================= */
function parseOutcome(assistantText = '') {
  const arr = linesOf(assistantText)
  const last = (arr[arr.length - 1] || '').trim()
  const second = (arr[arr.length - 2] || '').trim()
  const variables = second
    ? second
        .split(/\s+/)
        .map(s => s.trim())
        .filter(Boolean)
    : []

  return { lastLine: last, variables }
}

export { parseOutcome }

/* =========================================================
   브릿지 평가
   edge: {
     trigger_words: [],
     probability: 0~1,
     conditions: [
       // 기존
       {type:'turn_gte', value:n}
       {type:'turn_lte', value:n}
       {type:'prev_ai_contains', value:'승리', scope:'last1|last2|last5|all'}
       {type:'prev_prompt_contains', value:'...', scope:'last1|last2|all'}
       {type:'prev_ai_regex', pattern:'^패배\\b', flags:'i', scope:'last1|last2|all'}
       {type:'visited_slot', slot_id:'12'}
       {type:'fallback'}

       // 새로 추가: 변수 활성 체크
       {type:'var_on', names:['VAR_A','VAR_B'], mode:'any|all', scope:'global|local|both'}

       // 새로 추가: 역할/상태 카운트 비교
       {
         type:'count',
         who:'same'|'other'|'role'|'all',
         role:'수비',
         status:'alive'|'defeated'|'survived'|'lost',
         cmp:'gte'|'lte'|'eq',
       }
     ]
   }
   ========================================================= */
export function evaluateBridge(edge, ctx = {}) {
  const turn = ctx.turn || 0
  const activeGlobalNames = ctx.activeGlobalNames || []
  const activeLocalNames = ctx.activeLocalNames || []
  const participantsStatus = ctx.participantsStatus || []

  if (!edge) return false

  // 조건 체크
  for (const cond of edge.conditions || []) {
    switch (cond.type) {
      case 'turn_gte':
        if (!(turn >= cond.value)) return false
        break
      case 'turn_lte':
        if (!(turn <= cond.value)) return false
        break
      case 'prev_ai_contains':
        // TODO: implement
        break
      case 'prev_prompt_contains':
        // TODO: implement
        break
      case 'prev_ai_regex':
        // TODO: implement
        break
      case 'visited_slot':
        if (!ctx.visitedSlotIds?.has(String(cond.slot_id))) return false
        break
      case 'fallback':
        return true
      case 'var_on':
        {
          const names = cond.names || []
          const mode = cond.mode || 'any'
          const scope = cond.scope || 'both'
          let pool = []
          if (scope === 'global') pool = activeGlobalNames
          else if (scope === 'local') pool = activeLocalNames
          else pool = [...activeGlobalNames, ...activeLocalNames]
          const hits = names.filter((n) => pool.includes(n))
          if (mode === 'any' && hits.length === 0) return false
          if (mode === 'all' && hits.length !== names.length) return false
        }
        break
      case 'count':
        {
          const { who, role, status, cmp, value } = cond
          const idx = buildStatusIndex(participantsStatus, ctx.myRole)
          const c = idx.count({ who, role, status })
          if (cmp === 'gte' && !(c >= value)) return false
          if (cmp === 'lte' && !(c <= value)) return false
          if (cmp === 'eq' && !(c === value)) return false
        }
        break
      default:
        break
    }
  }

  // 확률 체크
  if (edge.probability != null) {
    if (Math.random() > edge.probability) return false
  }

  return true
}
