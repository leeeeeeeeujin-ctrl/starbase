// components/rank/StartClient.js
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import SharedChatDock from '../common/SharedChatDock'
import {
  buildSystemPromptFromChecklist,
  buildSlotsFromParticipants,
  createAiHistory,
  evaluateBridge,
  makeNodePrompt,
  parseOutcome,
} from '../../lib/promptEngine'
import { sanitizeVariableRules } from '../../lib/variableRules'

const COMPARATOR_LABEL = { gte: '이상', lte: '이하', eq: '정확히' }
const OUTCOME_LABEL = { win: '승리', lose: '패배', draw: '무승부' }
const STATUS_LABEL = { alive: '생존', dead: '탈락', won: '승리', lost: '패배' }
const SCORE_WINDOWS = [100, 200, 300, 400, 500, 700, 900, 1200]

function buildAutoInstruction(rule) {
  const variable = String(rule?.variable || '').trim()
  if (!variable) return ''

  const comparatorKey = rule?.comparator && COMPARATOR_LABEL[rule.comparator]
  const comparator = comparatorKey || COMPARATOR_LABEL.gte
  const count = Number.isFinite(Number(rule?.count)) ? Number(rule.count) : 1

  let condition = ''
  if (rule?.status === 'flag_on') {
    const flagName = String(rule?.flag || '').trim()
    if (!flagName) return ''
    condition = `변수 ${flagName}가 활성화되면`
  } else {
    const subject = rule?.subject
    const subjectText =
      subject === 'same'
        ? '같은 편 역할'
        : subject === 'other'
        ? '상대편 역할'
        : rule?.role
        ? `${rule.role} 역할`
        : '지정한 역할'
    const statusKey = rule?.status && STATUS_LABEL[rule.status]
    const status = statusKey || STATUS_LABEL.alive
    condition = `${subjectText} 중 ${status} 상태인 인원이 ${count}명${comparator}`
  }

  const outcomeKey = rule?.outcome && OUTCOME_LABEL[rule.outcome]
  const outcome = outcomeKey || OUTCOME_LABEL.win
  return `${condition}이면 마지막 줄을 "${outcome}"로 선언하라.`
}

function convertScopeRules(rawRules) {
  const normalized = sanitizeVariableRules(rawRules)
  const manual = []
  const active = []

  for (const rule of normalized.manual || []) {
    const name = String(rule?.variable || '').trim()
    const condition = String(rule?.condition || '').trim()
    if (!name) continue
    manual.push({ name, instruction: condition })
  }

  for (const rule of normalized.auto || []) {
    const name = String(rule?.variable || '').trim()
    if (!name) continue
    const instruction = buildAutoInstruction(rule)
    if (instruction) {
      manual.push({ name, instruction })
    }
  }

  for (const rule of normalized.active || []) {
    const directive = String(rule?.directive || '').trim()
    const condition = String(rule?.condition || '').trim()
    if (!directive) continue
    active.push({ directive, condition })
  }

  return { manual, active }
}

function createNodeFromSlot(slot) {
  const globalRules = convertScopeRules(slot?.var_rules_global)
  const localRules = convertScopeRules(slot?.var_rules_local)

  return {
    id: String(slot.id),
    slot_no: slot.slot_no ?? null,
    template: slot.template || '',
    slot_type: slot.slot_type || 'ai',
    is_start: !!slot.is_start,
    invisible: !!slot.invisible,
    options: {
      invisible: !!slot.invisible,
      visible_slots: Array.isArray(slot.visible_slots) ? slot.visible_slots : [],
      manual_vars_global: globalRules.manual,
      manual_vars_local: localRules.manual,
      active_vars_global: globalRules.active,
      active_vars_local: localRules.active,
    },
  }
}

function pickNextEdge(edges, ctx) {
  if (!edges || edges.length === 0) return null
  const sorted = [...edges].sort(
    (a, b) => (b.data?.priority ?? 0) - (a.data?.priority ?? 0),
  )

  let fallback = null
  for (const edge of sorted) {
    if (edge?.data?.fallback) {
      if (!fallback || (edge.data?.priority ?? 0) > (fallback.data?.priority ?? 0)) {
        fallback = edge
      }
      continue
    }

    if (evaluateBridge(edge.data, ctx)) {
      return edge
    }
  }

  if (fallback) {
    return fallback
  }

  return null
}

function copyText(text, onSuccess) {
  if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return
  navigator.clipboard.writeText(text).then(() => {
    onSuccess?.()
  }).catch(() => {})
}

function resolveRecipients(node, slotNumbers) {
  const pool = Array.isArray(slotNumbers) && slotNumbers.length
    ? slotNumbers.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : Array.from({ length: 12 }, (_, index) => index + 1)
  const options = node?.options || {}
  const invisible = !!options.invisible
  const list = Array.isArray(options.visible_slots)
    ? options.visible_slots.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : []
  if (!invisible) {
    return pool
  }
  if (list.length === 0) {
    return []
  }
  return pool.filter((slot) => list.includes(slot))
}

const USER_ACTION_LIVE_STATUSES = new Set(['alive', 'won', 'draw'])

function isActionableStatus(status) {
  const key = typeof status === 'string' ? status.toLowerCase() : ''
  if (!key) return true
  return USER_ACTION_LIVE_STATUSES.has(key)
}

function followProxySlot(slots = {}, slotNo) {
  const visited = new Set()
  let current = Number(slotNo)
  if (!Number.isFinite(current)) {
    return { slot: null, meta: null }
  }
  let meta = slots?.[current] || null
  while (meta && meta.proxy_slot != null) {
    const next = Number(meta.proxy_slot)
    if (!Number.isFinite(next) || visited.has(next) || next === current) {
      break
    }
    visited.add(current)
    current = next
    meta = slots?.[current] || null
  }
  return { slot: current, meta: meta || null }
}

function buildUserActionTargets({ recipients = [], slots = {}, roster = [] } = {}) {
  const rosterBySlot = new Map()
  roster.forEach((entry) => {
    if (entry?.slotNo == null) return
    const num = Number(entry.slotNo)
    if (!Number.isFinite(num)) return
    rosterBySlot.set(num, entry)
  })

  const targets = []
  recipients.forEach((value) => {
    const original = Number(value)
    if (!Number.isFinite(original)) return
    const { slot: resolvedSlot, meta } = followProxySlot(slots, original)
    if (!meta) return
    const rosterEntry = rosterBySlot.get(resolvedSlot)
    const status = rosterEntry?.status || meta.status
    if (!isActionableStatus(status)) return
    targets.push({ slot: original, resolvedSlot, meta })
  })

  return targets
}

function formatHeroSummary(meta = {}, originalSlot, resolvedSlot) {
  const asText = (value, fallback) => {
    const text = value == null ? '' : String(value).trim()
    return text ? text : fallback
  }

  const slotLabel =
    resolvedSlot && resolvedSlot !== originalSlot
      ? `슬롯 ${originalSlot} (대리 슬롯 ${resolvedSlot})`
      : `슬롯 ${originalSlot}`

  const lines = [slotLabel]
  lines.push(`이름: ${asText(meta.name, '(이름 없음)')}`)
  lines.push(`설명: ${asText(meta.description, '(설명 없음)')}`)
  for (let index = 1; index <= 4; index += 1) {
    lines.push(`능력${index}: ${asText(meta[`ability${index}`], '(없음)')}`)
  }
  return lines.join('\n')
}

function augmentUserActionPrompt(promptText, targets = []) {
  const base = promptText == null ? '' : String(promptText)
  const summaries = targets.map((target) =>
    formatHeroSummary(target.meta, target.slot, target.resolvedSlot),
  )

  const sections = []
  if (summaries.length) {
    sections.push(`[행동 대상]\n${summaries.join('\n\n')}`)
  }
  sections.push(
    [
      '[응답 지시]',
      '- 응답의 마지막 줄에는 승패 또는 결론만 적어라.',
      '- 응답의 마지막에서 두 번째 줄에는 만족한 변수명을 공백으로 구분해 적어라. 없으면 빈 줄을 남겨라.',
      '- 마지막에서 다섯 번째 줄까지는 공백 줄로 유지하라.',
    ].join('\n'),
  )

  const extra = sections.join('\n\n')
  if (!base.trim()) {
    return extra
  }
  return `${base}\n\n${extra}`
}

function buildRoleRoster(participants, roles) {
  const effectiveRoles = Array.isArray(roles) && roles.length
    ? roles
    : [{ name: '공격', slot_count: Math.min(participants.length, 12) }]

  const used = new Set()
  const picks = []
  let slotCounter = 1

  const byRole = new Map()
  participants.forEach((participant) => {
    const roleName = participant.role || '기타'
    if (!byRole.has(roleName)) {
      byRole.set(roleName, [])
    }
    byRole.get(roleName).push(participant)
  })

  for (const [, list] of byRole.entries()) {
    list.sort((a, b) => (b.score ?? 1000) - (a.score ?? 1000))
  }

  for (const role of effectiveRoles) {
    const roleName = role?.name || role?.label || role || '역할'
    const need = Math.max(1, Math.min(12, Number(role?.slot_count ?? 1)))
    const candidates = byRole.get(roleName) || []
    const taken = []

    let windowIndex = 0
    const baseScore = candidates[0]?.score ?? 1000
    while (taken.length < need && windowIndex < SCORE_WINDOWS.length) {
      const window = SCORE_WINDOWS[windowIndex]
      for (const candidate of candidates) {
        if (taken.length >= need) break
        if (!candidate) continue
        const key = candidate.hero_id || candidate.id
        if (!key || used.has(key)) continue
        const score = Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : baseScore
        if (Math.abs(score - baseScore) <= window) {
          used.add(key)
          taken.push({
            ...candidate,
            slotRole: roleName,
            slotNo: slotCounter,
            status: candidate.status || 'alive',
            initialScore: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
            updated_at: candidate.updated_at || null,
          })
          slotCounter += 1
        }
      }
      windowIndex += 1
    }

    if (taken.length < need) {
      for (const candidate of candidates) {
        if (taken.length >= need) break
        if (!candidate) continue
        const key = candidate.hero_id || candidate.id
        if (!key || used.has(key)) continue
        used.add(key)
        taken.push({
          ...candidate,
          slotRole: roleName,
          slotNo: slotCounter,
          status: candidate.status || 'alive',
          initialScore: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
          updated_at: candidate.updated_at || null,
        })
        slotCounter += 1
      }
    }

    while (taken.length < need && slotCounter <= 12) {
      taken.push({
        slotRole: roleName,
        slotNo: slotCounter,
        hero_id: null,
        hero: null,
        role: roleName,
        status: 'empty',
        score: null,
        initialScore: null,
        updated_at: null,
      })
      slotCounter += 1
    }

    picks.push(...taken)
    if (slotCounter > 12) break
  }

  const remainingSlots = 12 - picks.length
  if (remainingSlots > 0) {
    const leftovers = participants.filter((participant) => {
      const key = participant.hero_id || participant.id
      return key && !used.has(key)
    })
    for (let i = 0; i < remainingSlots && i < leftovers.length; i++) {
      const extra = leftovers[i]
      picks.push({
        ...extra,
        slotRole: extra.role || '추가',
        slotNo: slotCounter,
        status: extra.status || 'alive',
        initialScore: Number.isFinite(Number(extra.score)) ? Number(extra.score) : null,
        updated_at: extra.updated_at || null,
      })
      slotCounter += 1
    }
  }

  return picks.slice(0, 12)
}

function formatRecipientsLabel(recipients, slotMap) {
  if (!recipients || recipients.length === 0) {
    return '비공개'
  }
  if (recipients.length === slotMap.size) {
    return '모든 슬롯'
  }
  const labels = recipients
    .map((slot) => {
      const meta = slotMap.get(slot)
      if (!meta) return `슬롯 ${slot}`
      const name = meta.name || meta.role
      return `${slot}번 ${name || '미지정'}`
    })
  return labels.join(', ')
}

const DEFAULT_SCORE_RANGE = { min: 20, max: 40 }

function resolveStatusFromLine(line) {
  const text = String(line || '').toLowerCase()
  if (!text) return null
  if (text.includes('탈락') || text.includes('eliminat') || text.includes('실격')) return 'eliminated'
  if (text.includes('패배') || text.includes('lose')) return 'lost'
  if (text.includes('승리') || text.includes('win')) return 'won'
  if (text.includes('무승부') || text.includes('draw')) return 'draw'
  return null
}

function applyStatusToRoster(roster, targetSlots, nextStatus) {
  if (!Array.isArray(targetSlots) || targetSlots.length === 0 || !nextStatus) {
    return roster
  }
  let changed = false
  const slotSet = new Set(targetSlots.map((value) => Number(value)))
  const updated = roster.map((entry) => {
    if (!slotSet.has(Number(entry?.slotNo))) return entry
    if (entry?.status === nextStatus) return entry
    changed = true
    return { ...entry, status: nextStatus }
  })
  return changed ? updated : roster
}

function computeRedirects(roster = []) {
  const redirects = {}
  const aliveByRole = new Map()
  roster.forEach((entry) => {
    if (!entry?.hero_id) return
    const role = entry.slotRole || entry.role || '역할'
    if (!aliveByRole.has(role)) aliveByRole.set(role, [])
    if (entry.status === 'alive' || entry.status === 'won' || entry.status === 'draw') {
      aliveByRole.get(role).push(entry)
    }
  })

  roster.forEach((entry) => {
    if (!entry?.hero_id) return
    if (entry.status !== 'eliminated') return
    const role = entry.slotRole || entry.role || '역할'
    const pool = aliveByRole.get(role) || []
    const replacement = pool.find((candidate) => candidate.slotNo !== entry.slotNo)
    if (replacement) {
      redirects[entry.slotNo] = replacement.slotNo
    }
  })

  return redirects
}

function shallowEqualRedirects(prev = {}, next = {}) {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  if (prevKeys.length !== nextKeys.length) return false
  for (const key of prevKeys) {
    if (prev[key] !== next[key]) return false
  }
  return true
}

function collectRoleAverages(roster = []) {
  const roleMap = new Map()
  let totalScore = 0
  let totalCount = 0
  roster.forEach((entry) => {
    if (!entry?.hero_id) return
    const score = Number(entry.score)
    if (!Number.isFinite(score)) return
    const role = entry.slotRole || entry.role || '역할'
    if (!roleMap.has(role)) {
      roleMap.set(role, { sum: 0, count: 0 })
    }
    const bucket = roleMap.get(role)
    bucket.sum += score
    bucket.count += 1
    totalScore += score
    totalCount += 1
  })

  const averages = new Map()
  roleMap.forEach((bucket, role) => {
    averages.set(role, bucket.count > 0 ? bucket.sum / bucket.count : 0)
  })

  return {
    roleAverages: averages,
    gameAverage: totalCount > 0 ? totalScore / totalCount : 0,
  }
}

function normalizeRange(range) {
  const min = Number.isFinite(Number(range?.min)) ? Number(range.min) : DEFAULT_SCORE_RANGE.min
  const max = Number.isFinite(Number(range?.max)) ? Number(range.max) : DEFAULT_SCORE_RANGE.max
  return {
    min: Math.max(0, min),
    max: Math.max(Math.max(0, min), max),
  }
}

function calculateScoreDeltas(roster = [], roles = []) {
  const { roleAverages, gameAverage } = collectRoleAverages(roster)
  const rangeMap = new Map()
  roles.forEach((role) => {
    const key = role?.name || role
    const min = Number(role?.score_delta_min)
    const max = Number(role?.score_delta_max)
    rangeMap.set(key, normalizeRange({ min, max }))
  })

  return roster.map((entry) => {
    if (!entry?.hero_id) {
      return { entry, delta: 0, scoreAfter: entry?.score ?? null }
    }
    const role = entry.slotRole || entry.role || '역할'
    const baseScore = Number(entry.score)
    const { min, max } = rangeMap.get(role) || DEFAULT_SCORE_RANGE
    const roleAvg = roleAverages.get(role) ?? gameAverage
    const diff = roleAvg - gameAverage
    const weight = gameAverage > 0 ? Math.min(1, Math.abs(diff) / gameAverage) : 1
    const magnitude = min + (max - min) * weight
    let direction = 0
    const status = entry.status
    if (status === 'won') direction = 1
    else if (status === 'lost' || status === 'eliminated') direction = -1
    else if (status === 'draw') direction = 0
    else direction = diff >= 0 ? 1 : -1
    const delta = Number.isFinite(baseScore) ? Math.round(direction * magnitude) : 0
    const scoreAfter = Number.isFinite(baseScore) ? Math.round(baseScore + delta) : baseScore
    return {
      entry,
      delta,
      scoreAfter,
    }
  })
}

function rosterResolved(roster = []) {
  const combatants = roster.filter((entry) => entry?.hero_id)
  if (combatants.length === 0) return false
  const remaining = combatants.filter((entry) => entry.status === 'alive')
  if (remaining.length === 0) return true
  const aliveRoles = new Set(remaining.map((entry) => entry.slotRole || entry.role).filter(Boolean))
  return aliveRoles.size <= 1
}

function applyRedirectedSlots(slots = {}, redirects = {}, roster = []) {
  const clone = { ...slots }
  Object.entries(redirects).forEach(([fromKey, toKey]) => {
    const from = Number(fromKey)
    const to = Number(toKey)
    if (!Number.isFinite(from) || !Number.isFinite(to)) return
    const destMeta = slots[to]
    if (!destMeta) return
    const original = slots[from] || {}
    clone[from] = {
      ...destMeta,
      role: original.role || destMeta.role,
      status: original.status || destMeta.status,
      proxy_slot: to,
    }
  })
  return clone
}

function ChatEntry({ entry, slotMap }) {
  const meta = entry.slot ? slotMap.get(entry.slot) : null
  const heroName = meta?.name || meta?.role || null
  const headerColor =
    entry.kind === 'assistant' ? '#0f172a'
      : entry.kind === 'user' ? '#2563eb'
      : entry.kind === 'prompt' ? '#475569'
      : '#64748b'
  const headerLabel =
    entry.kind === 'assistant' ? 'AI 응답'
      : entry.kind === 'user' ? `유저 행동${entry.slot ? ` · 슬롯 ${entry.slot}` : ''}`
      : entry.kind === 'prompt' ? '프롬프트'
      : '안내'
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 12,
        background: '#fff',
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: headerColor }}>{headerLabel}</span>
        {entry.turn != null && (
          <span style={{ fontSize: 12, color: '#64748b' }}>턴 {entry.turn}</span>
        )}
        {entry.nodeId != null && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>노드 {entry.nodeId}</span>
        )}
        {entry.kind === 'user' && heroName && (
          <span style={{ fontSize: 12, color: '#475569' }}>{heroName}</span>
        )}
        {entry.recipients && entry.recipients.length > 0 && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {entry.kind === 'user' ? '응답 슬롯' : '공개 범위'}: {formatRecipientsLabel(entry.recipients, slotMap)}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 13,
          color: '#0f172a',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
          background: entry.kind === 'assistant' ? '#f8fafc' : '#ffffff',
          borderRadius: 8,
          padding: 8,
          border: entry.kind === 'assistant' ? '1px solid #e2e8f0' : '1px dashed #e2e8f0',
        }}
      >
        {entry.content || '(내용 없음)'}
      </div>
    </div>
  )
}

function statusTint(status) {
  const key = String(status || 'alive').toLowerCase()
  if (key === 'eliminated') return { filter: 'grayscale(0.9)', overlay: 'rgba(148, 163, 184, 0.55)', border: '#cbd5f5' }
  if (key === 'lost') return { filter: 'grayscale(1)', overlay: 'rgba(15, 23, 42, 0.72)', border: '#0f172a' }
  if (key === 'won') return { filter: 'none', overlay: 'rgba(250, 204, 21, 0.35)', border: '#facc15' }
  if (key === 'draw') return { filter: 'none', overlay: 'rgba(14, 165, 233, 0.25)', border: '#38bdf8' }
  return { filter: 'none', overlay: 'rgba(15, 118, 110, 0.0)', border: '#22c55e' }
}

function SlotRibbon({ side = 'left', roster, onSelect }) {
  const order = side === 'left' ? 0 : 1
  const items = roster
    .filter((_, index) => index % 2 === order)
    .map((entry) => ({ ...entry }))

  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        justifyItems: 'center',
      }}
    >
      {items.map((entry, index) => {
        const hero = entry?.hero || {}
        const { filter, overlay, border } = statusTint(entry?.status)
        return (
          <button
            key={entry?.slotNo ?? entry?.hero_id ?? index}
            onClick={() => onSelect?.(entry)}
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              border: `2px solid ${border}`,
              padding: 0,
              overflow: 'hidden',
              position: 'relative',
              background: '#0f172a',
              cursor: entry?.hero_id ? 'pointer' : 'default',
              opacity: entry?.hero_id ? 1 : 0.6,
            }}
          >
            {hero?.image_url ? (
              <img
                src={hero.image_url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: '#e2e8f0', filter }} />
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: overlay,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingBottom: 4,
                color: '#fff',
                fontSize: 11,
                textShadow: '0 1px 2px rgba(15,23,42,0.6)',
              }}
            >
              {hero?.name ? hero.name.slice(0, 6) : entry?.slotNo ? `#${entry.slotNo}` : '—'}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function HeroDetailOverlay({ participant, onClose }) {
  if (!participant) return null
  const hero = participant.hero || {}
  const statusLabel =
    participant.status === 'eliminated'
      ? '탈락'
      : participant.status === 'lost'
      ? '패배'
      : participant.status === 'won'
      ? '승리'
      : participant.status === 'draw'
      ? '무승부'
      : '진행 중'
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 92vw)',
          maxHeight: '80vh',
          overflowY: 'auto',
          borderRadius: 16,
          background: '#fff',
          padding: 20,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{hero?.name || `슬롯 ${participant?.slotNo || ''}`}</h3>
          <button onClick={onClose} style={{ padding: '6px 10px' }}>
            닫기
          </button>
        </div>
        {hero?.image_url && (
          <img
            src={hero.image_url}
            alt=""
            style={{ width: '100%', borderRadius: 12, objectFit: 'cover' }}
          />
        )}
        <div style={{ fontSize: 13, color: '#475569' }}>{hero?.description || '설명 없음'}</div>
        <div style={{ fontSize: 12, color: '#334155', display: 'grid', gap: 4 }}>
          <div>역할: {participant?.slotRole || participant?.role || '미지정'}</div>
          <div>현재 상태: {statusLabel}</div>
          <div>점수: {participant?.score ?? '—'}{participant?.lastDelta ? ` (${participant.lastDelta >= 0 ? '+' : ''}${participant.lastDelta})` : ''}</div>
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'grid', gap: 4 }}>
          {[hero?.ability1, hero?.ability2, hero?.ability3, hero?.ability4]
            .filter(Boolean)
            .map((ability, index) => (
              <div key={index} style={{ fontSize: 12, color: '#475569' }}>
                • {ability}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function HistoryOverlay({ open, onClose, chatLog, slotMap }) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          width: 'min(960px, 94vw)',
          maxHeight: '80vh',
          overflowY: 'auto',
          display: 'grid',
          gap: 16,
          padding: 20,
          boxShadow: '0 24px 80px -36px rgba(15, 23, 42, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>세션 히스토리</h3>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 999, border: '1px solid #cbd5f5' }}
          >
            닫기
          </button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {chatLog.length === 0 && <div style={{ color: '#94a3b8' }}>아직 기록된 히스토리가 없습니다.</div>}
          {chatLog.map((entry) => (
            <ChatEntry key={entry.id} entry={entry} slotMap={slotMap} />
          ))}
        </div>
      </div>
    </div>
  )
}

function appendChat(setter, entry) {
  const uid = `log_${Date.now()}_${Math.random().toString(16).slice(2)}`
  setter((prev) => [...prev, { id: uid, ...entry }])
}

export default function StartClient() {
  const router = useRouter()
  const gameId = router.query.id

  const [loading, setLoading] = useState(true)
  const [game, setGame] = useState(null)
  const [roles, setRoles] = useState([])
  const [participants, setParticipants] = useState([])
  const [activeRoster, setActiveRoster] = useState([])
  const [graph, setGraph] = useState({ nodes: [], edges: [] })
  const [slotRedirects, setSlotRedirects] = useState({})

  const history = useMemo(() => createAiHistory(), [])
  const visitedSlotIds = useRef(new Set())
  const systemPromptRef = useRef('')

  const [preflight, setPreflight] = useState(true)
  const [turn, setTurn] = useState(1)
  const [currentNodeId, setCurrentNodeId] = useState(null)
  const [currentSlotNo, setCurrentSlotNo] = useState(null)

  const [activeGlobal, setActiveGlobal] = useState([])
  const [activeLocal, setActiveLocal] = useState([])

  const [starting, setStarting] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [awaitingManual, setAwaitingManual] = useState(false)
  const [awaitingUserAction, setAwaitingUserAction] = useState(false)

  const [currentPrompt, setCurrentPrompt] = useState('')
  const [currentResponse, setCurrentResponse] = useState('')
  const [currentOutcome, setCurrentOutcome] = useState('')

  const [logs, setLogs] = useState([])
  const [chatLog, setChatLog] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [resultBanner, setResultBanner] = useState('')

  const [apiKey, setApiKey] = useState('')
  const [manualResponse, setManualResponse] = useState('')
  const [pendingTurn, setPendingTurn] = useState(null)
  const [pendingUserAction, setPendingUserAction] = useState(null)
  const [userActionSlot, setUserActionSlot] = useState('')
  const [userActionText, setUserActionText] = useState('')
  const [gameState, setGameState] = useState('idle')
  const [focusedParticipant, setFocusedParticipant] = useState(null)
  const [finalizing, setFinalizing] = useState(false)
  const finalizeGuardRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('rank.openai_key')
    if (saved) setApiKey(saved)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (apiKey) {
      window.localStorage.setItem('rank.openai_key', apiKey)
    } else {
      window.localStorage.removeItem('rank.openai_key')
    }
  }, [apiKey])

  useEffect(() => {
    if (!gameId) return
    let alive = true
    setLoading(true)

    ;(async () => {
      const { data: gameRow } = await supabase
        .from('rank_games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (!alive) return
      setGame(gameRow || null)

      const { data: roleRows } = await supabase
        .from('rank_game_roles')
        .select('id,name,slot_count,active,score_delta_min,score_delta_max')
        .eq('game_id', gameId)
        .order('id')

      if (!alive) return
      setRoles(
        (roleRows || [])
          .filter((role) => role?.active !== false)
          .map((role) => ({
            ...role,
            score_delta_min: Number.isFinite(Number(role?.score_delta_min)) ? Number(role.score_delta_min) : 20,
            score_delta_max: Number.isFinite(Number(role?.score_delta_max)) ? Number(role.score_delta_max) : 40,
          })),
      )

      const { data: participantRows } = await supabase
        .from('rank_participants')
        .select(
          'id, owner_id, role, hero_id, status, score, updated_at, heroes:hero_id(id,name,description,image_url,ability1,ability2,ability3,ability4)'
        )
        .eq('game_id', gameId)

      if (!alive) return

      const normalizedParticipants = (participantRows || []).map((row) => ({
        id: row.id,
        owner_id: row.owner_id,
        role: row.role,
        hero_id: row.hero_id,
        score: Number.isFinite(Number(row.score)) ? Number(row.score) : 1000,
        status: row.status || 'alive',
        hero: row.heroes
          ? {
              id: row.heroes.id,
              name: row.heroes.name,
              description: row.heroes.description,
              image_url: row.heroes.image_url,
              ability1: row.heroes.ability1,
              ability2: row.heroes.ability2,
              ability3: row.heroes.ability3,
              ability4: row.heroes.ability4,
            }
          : null,
        updated_at: row.updated_at || null,
      }))

      setParticipants(normalizedParticipants)

      const promptSetId = gameRow?.prompt_set_id || gameRow?.set_id

      if (promptSetId) {
        const [{ data: slots }, { data: bridges }] = await Promise.all([
          supabase
            .from('prompt_slots')
            .select('*')
            .eq('set_id', promptSetId)
            .order('slot_no', { ascending: true }),
          supabase
            .from('prompt_bridges')
            .select('*')
            .eq('from_set', promptSetId),
        ])

        if (!alive) return

        const nodes = (slots || []).map((slot) => createNodeFromSlot(slot))
        const edges = (bridges || [])
          .filter((bridge) => bridge.from_slot_id && bridge.to_slot_id)
          .map((bridge) => ({
            id: String(bridge.id),
            from: String(bridge.from_slot_id),
            to: String(bridge.to_slot_id),
            data: {
              trigger_words: bridge.trigger_words || [],
              conditions: bridge.conditions || [],
              priority: bridge.priority ?? 0,
              probability: bridge.probability ?? 1,
              fallback: !!bridge.fallback,
              action: bridge.action || 'continue',
            },
          }))

        setGraph({ nodes, edges })
      } else {
        setGraph({ nodes: [], edges: [] })
      }

      setLoading(false)
    })()

    return () => {
      alive = false
    }
  }, [gameId])

  const activeParticipants = activeRoster.length ? activeRoster : participants

  const baseSlots = useMemo(
    () => buildSlotsFromParticipants(activeParticipants),
    [activeParticipants],
  )

  const effectiveSlots = useMemo(
    () => applyRedirectedSlots(baseSlots, slotRedirects, activeRoster),
    [baseSlots, slotRedirects, activeRoster],
  )

  const slotNumbers = useMemo(
    () =>
      Object.keys(effectiveSlots)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b),
    [effectiveSlots],
  )

  const slotMetaMap = useMemo(() => {
    const map = new Map()
    slotNumbers.forEach((slot) => {
      map.set(slot, effectiveSlots[slot] || {})
    })
    return map
  }, [effectiveSlots, slotNumbers])

  const participantsStatus = useMemo(
    () => activeParticipants.map((p) => ({ role: p.role, status: p.status || 'alive' })),
    [activeParticipants],
  )

  useEffect(() => {
    const next = computeRedirects(activeRoster)
    setSlotRedirects((prev) => (shallowEqualRedirects(prev, next) ? prev : next))
  }, [activeRoster])

  const nodeMap = useMemo(() => {
    const map = new Map()
    graph.nodes.forEach((node) => {
      map.set(String(node.id), node)
    })
    return map
  }, [graph.nodes])

  const currentNode = useMemo(() => {
    if (!currentNodeId) return null
    return nodeMap.get(String(currentNodeId)) || null
  }, [currentNodeId, nodeMap])

  function findStartNodeId() {
    const start = graph.nodes.find((node) => node.is_start) || graph.nodes[0]
    return start ? start.id : null
  }

  function buildSystemPrompt() {
    const rawRules = game?.rules_json ?? game?.rules ?? null
    let parsed = {}
    if (typeof rawRules === 'string') {
      try {
        parsed = JSON.parse(rawRules || '{}')
      } catch {
        parsed = {}
      }
    } else if (rawRules && typeof rawRules === 'object') {
      parsed = rawRules
    }

    const checklist = buildSystemPromptFromChecklist(parsed || {})
    const prefix = game?.rules_prefix ? String(game.rules_prefix) : ''
    if (prefix) {
      return `${prefix}\n${checklist}`
    }
    return checklist
  }

  const startGame = useCallback(async () => {
    if (starting || loading) return
    if (!graph.nodes.length) {
      setErrorMessage('프롬프트 세트에 노드가 없습니다.')
      return
    }

    setStarting(true)
    try {
      const roster = buildRoleRoster(participants, roles).map((entry) => {
        if (!entry?.hero_id) return entry
        const baseScore = Number.isFinite(Number(entry.score)) ? Number(entry.score) : Number(entry.initialScore)
        return {
          ...entry,
          status: 'alive',
          score: Number.isFinite(baseScore) ? baseScore : entry.score,
          lastDelta: 0,
        }
      })
      setActiveRoster(roster)
      setSlotRedirects({})
      finalizeGuardRef.current = false

      setResultBanner('')
      setErrorMessage('')
      setStatusMessage('')
      setLogs([])
      setChatLog([])
      setCurrentPrompt('')
      setCurrentResponse('')
      setCurrentOutcome('')
      setManualResponse('')
      setActiveGlobal([])
      setActiveLocal([])
      visitedSlotIds.current = new Set()
      setTurn(1)
      setCurrentSlotNo(null)
      setPendingTurn(null)
      setPendingUserAction(null)
      setAwaitingManual(false)
      setAwaitingUserAction(false)
      setUserActionSlot('')
      setUserActionText('')

      history.beginSession()
      const systemPrompt = buildSystemPrompt()
      systemPromptRef.current = systemPrompt
      history.push({ role: 'system', content: systemPrompt, public: false })

      const startId = findStartNodeId()
      setCurrentNodeId(startId)
      setPreflight(false)
      setGameState('running')
    } finally {
      setStarting(false)
    }
  }, [graph.nodes, history, loading, participants, roles, starting])

  const finalizeSession = useCallback(
    async (reason, rosterOverride = activeRoster) => {
      if (finalizeGuardRef.current) return
      const combatants = (rosterOverride || []).filter((entry) => entry?.hero_id)
      if (combatants.length === 0) return

      finalizeGuardRef.current = true
      setFinalizing(true)

      const deltas = calculateScoreDeltas(rosterOverride, roles)
      const payloadRoster = deltas
        .map(({ entry, delta, scoreAfter }) => ({ entry, delta, scoreAfter }))
        .filter(({ entry }) => entry?.id)
        .map(({ entry, delta, scoreAfter }) => ({
          participantId: entry.id,
          heroId: entry.hero_id,
          ownerId: entry.owner_id,
          role: entry.slotRole || entry.role || '역할',
          status: entry.status,
          scoreBefore: entry.score,
          scoreAfter,
          scoreDelta: delta,
          updatedAt: entry.updated_at || null,
        }))

      let success = false
      try {
        const { data } = await supabase.auth.getSession()
        const token = data?.session?.access_token
        if (!token) {
          throw new Error('로그인 세션이 만료되었습니다. 다시 로그인하세요.')
        }

        const resp = await fetch('/api/rank/finalize-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            gameId,
            roster: payloadRoster,
            summary: {
              reason,
              turn,
              resultBanner,
              finishedAt: new Date().toISOString(),
            },
            chatLog: chatLog.slice(-200),
          }),
        })

        const json = await resp.json()
        if (!resp.ok || json?.error) {
          throw new Error(json?.error || 'finalize_failed')
        }

        const rosterWithDeltas = rosterOverride.map((entry) => {
          if (!entry?.hero_id) return entry
          const match = deltas.find((d) => d.entry === entry)
          if (!match) return entry
          return {
            ...entry,
            score: match.scoreAfter,
            lastDelta: match.delta,
            updated_at: new Date().toISOString(),
          }
        })
        setActiveRoster(rosterWithDeltas)
        setResultBanner((prev) => prev || '전투가 종료되었습니다.')
        setStatusMessage('결과가 저장되었습니다.')
        success = true
      } catch (error) {
        finalizeGuardRef.current = false
        setErrorMessage(`결과 저장 실패: ${String(error?.message || error).slice(0, 160)}`)
      } finally {
        setFinalizing(false)
        if (!success) {
          // allow retry
          finalizeGuardRef.current = false
        }
      }
    },
    [activeRoster, chatLog, gameId, resultBanner, roles, turn],
  )

  const applyTurnResult = useCallback(
    async (assistantText) => {
      if (!pendingTurn) {
        setStatusMessage('진행할 턴이 없습니다. 먼저 "다음 턴"을 실행하세요.')
        return
      }

      const { nodeId, promptText, pickedSlot, recipients } = pendingTurn
      const node = nodeMap.get(String(nodeId))
      if (!node) {
        setErrorMessage('현재 노드를 찾을 수 없습니다.')
        return
      }

      const cleanedAssistant = String(assistantText || '').replace(/\r/g, '')

      history.push({ role: 'assistant', content: cleanedAssistant, public: true })
      appendChat(setChatLog, {
        turn,
        nodeId,
        kind: 'assistant',
        content: cleanedAssistant,
        recipients: recipients && recipients.length ? recipients : slotNumbers,
        slot: null,
      })

      const outcome = parseOutcome(cleanedAssistant)
      const mergedGlobal = Array.from(new Set([...activeGlobal, ...outcome.variables]))

      setActiveGlobal(mergedGlobal)
      setActiveLocal(outcome.variables)
      setCurrentResponse(cleanedAssistant)
      setCurrentOutcome(outcome.lastLine)
      setManualResponse('')
      setPendingTurn(null)
      setAwaitingManual(false)
      setStatusMessage('')
      setErrorMessage('')

      const affectedSlots = []
      if (pickedSlot) affectedSlots.push(Number(pickedSlot))
      if (!pickedSlot && Array.isArray(recipients) && recipients.length) {
        recipients.forEach((slot) => {
          if (Number.isFinite(Number(slot))) affectedSlots.push(Number(slot))
        })
      }

      let rosterSnapshot = activeRoster
      const statusFromLine = resolveStatusFromLine(outcome.lastLine)
      if (statusFromLine && affectedSlots.length) {
        const nextRoster = applyStatusToRoster(activeRoster, affectedSlots, statusFromLine)
        if (nextRoster !== activeRoster) {
          rosterSnapshot = nextRoster
          setActiveRoster(nextRoster)
        }
      }

      if (nodeId != null) {
        visitedSlotIds.current.add(String(nodeId))
      }

      const context = {
        turn,
        historyUserText: history.joinedText({ onlyPublic: false, last: 6 }),
        historyAiText: history.joinedText({ onlyPublic: true, last: 6 }),
        visitedSlotIds: visitedSlotIds.current,
        myRole: null,
        participantsStatus,
        activeGlobalNames: mergedGlobal,
        activeLocalNames: outcome.variables,
      }

      const outgoing = graph.edges.filter((edge) => edge.from === String(nodeId))
      const chosenEdge = pickNextEdge(outgoing, context)

      setLogs((prev) => [
        ...prev,
        {
          turn,
          nodeId,
          prompt: promptText,
          response: cleanedAssistant,
          outcome: outcome.lastLine,
          variables: outcome.variables,
          nextNodeId: chosenEdge ? chosenEdge.to : null,
          action: chosenEdge?.data?.action || 'continue',
        },
      ])

      setCurrentSlotNo(pickedSlot || null)

      const advanceTurn = () => setTurn((prev) => prev + 1)

      if (!chosenEdge) {
        setResultBanner('다음으로 진행할 브릿지가 없어 전투를 종료합니다.')
        setGameState('finished')
        setPreflight(true)
        setCurrentNodeId(null)
        advanceTurn()
        if (!finalizeGuardRef.current) {
          finalizeSession('no_bridge', rosterSnapshot)
        }
        return
      }

      const action = chosenEdge.data?.action || 'continue'
      if (action === 'continue') {
        setCurrentNodeId(String(chosenEdge.to))
        advanceTurn()
        if (!finalizeGuardRef.current && rosterResolved(rosterSnapshot)) {
          finalizeSession('auto_resolution', rosterSnapshot)
        }
        return
      }

      if (action === 'win') {
        setResultBanner('🎉 승리!')
      } else if (action === 'lose') {
        setResultBanner('패배하였습니다…')
      } else if (action === 'goto_set') {
        setResultBanner('다른 세트로 이동하는 브릿지는 아직 지원되지 않습니다.')
      } else {
        setResultBanner(`전투가 종료되었습니다. (action: ${action})`)
      }

      setGameState('finished')
      setPreflight(true)
      setCurrentNodeId(null)
      advanceTurn()
      if (!finalizeGuardRef.current) {
        finalizeSession(action, rosterSnapshot)
      }
    },
    [
      activeGlobal,
      activeRoster,
      graph.edges,
      history,
      nodeMap,
      participantsStatus,
      pendingTurn,
      finalizeSession,
      slotNumbers,
      turn,
    ],
  )

  const advanceFromUserAction = useCallback(() => {
    if (!pendingUserAction) return
    const node = nodeMap.get(String(pendingUserAction.nodeId))
    if (!node) {
      setErrorMessage('현재 노드를 찾을 수 없습니다.')
      return
    }

    const slotValue = Number(userActionSlot)
    if (!Number.isFinite(slotValue)) {
      setStatusMessage('응답할 슬롯을 선택하세요.')
      return
    }
    if (!pendingUserAction.recipients.includes(slotValue)) {
      setStatusMessage('선택한 슬롯은 이 턴에 응답할 수 없습니다.')
      return
    }
    const trimmed = userActionText.trim()
    if (!trimmed) {
      setStatusMessage('유저 행동 입력을 작성하세요.')
      return
    }

    history.push({ role: 'user', content: `[슬롯 ${slotValue}] ${trimmed}`, public: true })
    appendChat(setChatLog, {
      turn,
      nodeId: pendingUserAction.nodeId,
      kind: 'user',
      content: trimmed,
      recipients: [slotValue],
      slot: slotValue,
    })

       visitedSlotIds.current.add(String(pendingUserAction.nodeId))
    setCurrentOutcome('')
    setCurrentResponse('')
    setPendingUserAction(null)
    setAwaitingUserAction(false)
    setUserActionSlot('')
    setUserActionText('')
    setStatusMessage('')
    setErrorMessage('')

    // 유저 액션 후 브릿지 평가 → 다음 노드로 진행/종료 판단
    const context = {
      turn,
      historyUserText: history.joinedText({ onlyPublic: false, last: 6 }),
      historyAiText: history.joinedText({ onlyPublic: true, last: 6 }),
      visitedSlotIds: visitedSlotIds.current,
      myRole: null,
      participantsStatus,
      activeGlobalNames: activeGlobal,
      activeLocalNames: activeLocal,
    }

    const outgoing = graph.edges.filter((edge) => edge.from === String(pendingUserAction.nodeId))
    const chosenEdge = pickNextEdge(outgoing, context)

    setLogs((prev) => [
      ...prev,
      {
        turn,
        nodeId: pendingUserAction.nodeId,
        prompt: pendingUserAction.promptText,
        response: trimmed,
        outcome: 'user_action',
        variables: [],
        nextNodeId: chosenEdge ? chosenEdge.to : null,
        action: chosenEdge?.data?.action || 'continue',
      },
    ])

    const advanceTurn = () => setTurn((prev) => prev + 1)

    if (!chosenEdge) {
      setResultBanner('다음으로 진행할 브릿지가 없어 전투를 종료합니다.')
      setGameState('finished')
      setPreflight(true)
      setCurrentNodeId(null)
      advanceTurn()
      if (!finalizeGuardRef.current) {
        finalizeSession('no_bridge', activeRoster)
      }
      return
    }

    const action = chosenEdge.data?.action || 'continue'
    if (action === 'continue') {
      setCurrentNodeId(String(chosenEdge.to))
      advanceTurn()
      if (!finalizeGuardRef.current && rosterResolved(activeRoster)) {
        finalizeSession('auto_resolution', activeRoster)
      }
      return
    }

    if (action === 'win') {
      setResultBanner('🎉 승리!')
    } else if (action === 'lose') {
      setResultBanner('패배하였습니다…')
    } else if (action === 'goto_set') {
      setResultBanner('다른 세트로 이동하는 브릿지는 아직 지원되지 않습니다.')
    } else {
      setResultBanner(`전투가 종료되었습니다. (action: ${action})`)
    }

    setGameState('finished')
    setPreflight(true)
    setCurrentNodeId(null)
    advanceTurn()
    if (!finalizeGuardRef.current) {
      finalizeSession(action, activeRoster)
    }
  }, [
    activeGlobal,
    activeLocal,
    activeRoster,
    finalizeSession,
     // eslint-disable-next-line react-hooks/exhaustive-deps
    graph.edges,
    history,
    nodeMap,
    participantsStatus,
    pendingUserAction,
    turn,
    userActionSlot,
    userActionText,
  ])

  const handleUserActionSkip = useCallback(
    (node, promptText, message) => {
      if (!node) return

      const reasonText = (() => {
        if (!message) return '이 유저 행동 노드는 대상이 없어 건너뜁니다.'
        const trimmed = String(message).trim()
        return trimmed || '이 유저 행동 노드는 대상이 없어 건너뜁니다.'
      })()

      visitedSlotIds.current.add(String(node.id))
      setPendingTurn(null)
      setPendingUserAction(null)
      setAwaitingUserAction(false)
      setUserActionSlot('')
      setUserActionText('')
      setStatusMessage(reasonText)
      setErrorMessage('')

      appendChat(setChatLog, {
        turn,
        nodeId: node.id,
        kind: 'info',
        content: reasonText,
        recipients: [],
        slot: null,
      })

      const context = {
        turn,
        historyUserText: history.joinedText({ onlyPublic: false, last: 6 }),
        historyAiText: history.joinedText({ onlyPublic: true, last: 6 }),
        visitedSlotIds: visitedSlotIds.current,
        myRole: null,
        participantsStatus,
        activeGlobalNames: activeGlobal,
        activeLocalNames: activeLocal,
      }

      const outgoing = graph.edges.filter((edge) => edge.from === String(node.id))
      const chosenEdge = pickNextEdge(outgoing, context)

      setLogs((prev) => [
        ...prev,
        {
          turn,
          nodeId: node.id,
          prompt: promptText,
          response: '',
          outcome: 'user_action_skipped',
          variables: [],
          nextNodeId: chosenEdge ? chosenEdge.to : null,
          action: chosenEdge?.data?.action || 'continue',
        },
      ])

      const advanceTurnCounter = () => setTurn((prev) => prev + 1)

      if (!chosenEdge) {
        setResultBanner('다음으로 진행할 브릿지가 없어 전투를 종료합니다.')
        setGameState('finished')
        setPreflight(true)
        setCurrentNodeId(null)
        advanceTurnCounter()
        if (!finalizeGuardRef.current) {
          finalizeSession('no_bridge', activeRoster)
        }
        return
      }

      const action = chosenEdge.data?.action || 'continue'
      if (action === 'continue') {
        setCurrentNodeId(String(chosenEdge.to))
        advanceTurnCounter()
        if (!finalizeGuardRef.current && rosterResolved(activeRoster)) {
          finalizeSession('auto_resolution', activeRoster)
        }
        return
      }

      if (action === 'win') {
        setResultBanner('🎉 승리!')
      } else if (action === 'lose') {
        setResultBanner('패배하였습니다…')
      } else {
        setResultBanner(`전투가 종료되었습니다. (action: ${action})`)
      }

      setGameState('finished')
      setPreflight(true)
      setCurrentNodeId(null)
      advanceTurnCounter()
      if (!finalizeGuardRef.current) {
        finalizeSession(action, activeRoster)
      }
    },
    [
      activeGlobal,
      activeLocal,
      activeRoster,
      finalizeSession,
      graph.edges,
      history,
      participantsStatus,
      turn,
    ],
  )

  const nextStep = useCallback(async () => {
    if (preflight) {
      setStatusMessage('게임을 먼저 시작하세요.')
      return
    }
    if (!currentNode) {
      setErrorMessage('현재 노드를 찾을 수 없습니다.')
      return
    }
    if (awaitingManual) {
      setStatusMessage('수동 응답을 적용한 후에 진행하세요.')
      return
    }
    if (awaitingUserAction) {
      setStatusMessage('유저 행동 입력을 먼저 마치세요.')
      return
    }
    if (aiLoading) return

    setStatusMessage('')
    setErrorMessage('')

    const historyText = history.joinedText({ onlyPublic: false, last: 5 })
    const compiled = makeNodePrompt({
      node: currentNode,
      slots: effectiveSlots,
      historyText,
      activeGlobalNames: activeGlobal,
      activeLocalNames: activeLocal,
      currentSlot: currentSlotNo,
    })

    let promptText = compiled.text
    let recipients = resolveRecipients(currentNode, slotNumbers) || []

    if (currentNode.slot_type === 'user_action') {
      if (!recipients.length) {
        handleUserActionSkip(
          currentNode,
          promptText,
          '이 유저 행동 노드는 비공개로 설정되어 있어 건너뜁니다.',
        )
        return
      }

      const targets = buildUserActionTargets({
        recipients,
        slots: effectiveSlots,
        roster: activeParticipants,
      })

      if (targets.length === 0) {
        handleUserActionSkip(
          currentNode,
          promptText,
          '이 유저 행동 노드는 모든 대상이 탈락해 건너뜁니다.',
        )
        return
      }

      recipients = targets.map((target) => target.slot)
      promptText = augmentUserActionPrompt(promptText, targets)
    }

    history.push({ role: 'system', content: `[PROMPT]\n${promptText}`, public: false })
    appendChat(setChatLog, {
      turn,
      nodeId: currentNode.id,
      kind: 'prompt',
      content: promptText,
      recipients,
      slot: null,
    })

    setCurrentPrompt(promptText)
    setPendingTurn({ nodeId: currentNode.id, promptText, pickedSlot: compiled.pickedSlot || null, recipients })

    if (currentNode.slot_type === 'user_action') {
      setAwaitingUserAction(true)
      setPendingUserAction({
        nodeId: currentNode.id,
        promptText,
        recipients,
      })
      setUserActionSlot(String(recipients[0]))
      setStatusMessage('플레이어 입력을 기다리는 중입니다.')
      return
    }

    if (!apiKey) {
      setAwaitingManual(true)
      setStatusMessage('OpenAI API 키가 없어 수동 응답이 필요합니다.')
      return
    }

    setAiLoading(true)
    try {
      const resp = await fetch('/api/rank/run-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          prompt: promptText,
          system: systemPromptRef.current,
        }),
      })

      const json = await resp.json()
      if (json?.error || !json?.text) {
        const detail = json?.detail ? ` (${json.detail})` : ''
        setErrorMessage(
          json?.error === 'missing_user_api_key'
            ? 'OpenAI API 키가 필요합니다. 수동 응답을 입력해 주세요.'
            : `AI 호출 실패: ${json?.error || 'unknown'}${detail}`,
        )
        setAwaitingManual(true)
      } else {
        await applyTurnResult(json.text)
      }
    } catch (error) {
      setErrorMessage(`AI 호출 실패: ${String(error).slice(0, 160)}`)
      setAwaitingManual(true)
    } finally {
      setAiLoading(false)
    }
  }, [
    activeGlobal,
    activeLocal,
    activeParticipants,
    aiLoading,
    apiKey,
    applyTurnResult,
    awaitingManual,
    awaitingUserAction,
    currentNode,
    currentSlotNo,
    effectiveSlots,
    handleUserActionSkip,
    history,
    preflight,
    slotNumbers,
    turn,
  ])

  const applyManual = useCallback(() => {
    if (!pendingTurn) {
      setStatusMessage('먼저 "다음 턴"을 눌러 프롬프트를 준비하세요.')
      return
    }
    if (!manualResponse.trim()) {
      setStatusMessage('AI 응답을 입력한 뒤 적용하세요.')
      return
    }
    applyTurnResult(manualResponse)
  }, [applyTurnResult, manualResponse, pendingTurn])

  const canAdvance =
    !preflight &&
    !awaitingManual &&
    !aiLoading &&
    !awaitingUserAction &&
    !!currentNode &&
    gameState === 'running'

  return (
    <div style={{ maxWidth: 1280, margin: '16px auto', padding: 12, display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <button onClick={() => router.replace(`/rank/${gameId}`)} style={{ padding: '6px 10px' }}>
          ← 랭킹으로
        </button>
        <h2 style={{ margin: 0 }}>{game?.name || '랭킹 게임'}</h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          턴 {turn}{currentNode ? ` · 노드 ${currentNode.id}` : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setHistoryOpen(true)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5f5', background: '#f8fafc' }}
            disabled={chatLog.length === 0}
          >
            히스토리 보기
          </button>
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="OpenAI API 키 (선택)"
            style={{
              minWidth: 240,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
            }}
          />
          <button
            onClick={startGame}
            disabled={starting || loading}
            style={{ padding: '8px 12px', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700 }}
          >
            {preflight ? (starting ? '준비 중…' : '게임 시작') : '다시 시작'}
          </button>
          <button
            onClick={nextStep}
            disabled={!canAdvance}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: canAdvance ? '#2563eb' : '#94a3b8',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            {aiLoading ? 'AI 호출 중…' : '다음 턴 실행'}
          </button>
        </div>
      </div>

      {(statusMessage || errorMessage || resultBanner || finalizing) && (
        <div style={{ display: 'grid', gap: 6 }}>
          {resultBanner && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
              {resultBanner}
            </div>
          )}
          {finalizing && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>결과 저장 중…</div>
          )}
          {statusMessage && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8' }}>{statusMessage}</div>
          )}
          {errorMessage && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' }}>{errorMessage}</div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 120px) minmax(420px, 560px) minmax(96px, 120px)', gap: 12, alignItems: 'start' }}>
        <SlotRibbon
          side="left"
          roster={activeParticipants.length ? activeParticipants : participants}
          onSelect={setFocusedParticipant}
        />

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 700, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>진행 정보</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>상태: {gameState === 'running' ? '진행 중' : preflight ? '대기' : '종료'}</span>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: '#334155' }}>
              <div>전역 변수: {activeGlobal.length ? activeGlobal.join(', ') : '없음'}</div>
              <div>로컬 변수: {activeLocal.length ? activeLocal.join(', ') : '없음'}</div>
              {currentSlotNo != null && <div>랜덤 슬롯 선택: #{currentSlotNo}</div>}
              {currentOutcome && <div>최근 결론: {currentOutcome}</div>}
            </div>
          </div>

          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              background: '#fff',
              padding: 12,
              display: 'grid',
              gap: 12,
              maxHeight: '55vh',
              overflowY: 'auto',
            }}
          >
            {chatLog.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>아직 대화가 시작되지 않았습니다. "게임 시작" 후 턴을 진행해 보세요.</div>
            )}
            {chatLog.map((entry) => (
              <ChatEntry key={entry.id} entry={entry} slotMap={slotMetaMap} />
            ))}
          </div>

          {awaitingUserAction && pendingUserAction && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, display: 'grid', gap: 8 }}>
              <span style={{ fontWeight: 700 }}>유저 행동 입력</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select
                  value={userActionSlot}
                  onChange={(event) => setUserActionSlot(event.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5f5' }}
                >
                  {pendingUserAction.recipients.map((slot) => (
                    <option key={slot} value={slot}>
                      슬롯 {slot}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  응답 가능 슬롯: {formatRecipientsLabel(pendingUserAction.recipients, slotMetaMap)}
                </span>
              </div>
              <textarea
                value={userActionText}
                onChange={(event) => setUserActionText(event.target.value)}
                rows={5}
                placeholder="플레이어가 수행할 행동을 입력하세요."
                style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb', fontFamily: 'monospace' }}
              />
              <button
                onClick={advanceFromUserAction}
                style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 700 }}
              >
                유저 행동 적용
              </button>
            </div>
          )}

          {(awaitingManual || !apiKey) && pendingTurn && !awaitingUserAction && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, display: 'grid', gap: 8 }}>
              <span style={{ fontWeight: 700 }}>수동 응답 입력</span>
              <textarea
                value={manualResponse}
                onChange={(event) => setManualResponse(event.target.value)}
                rows={6}
                placeholder="AI 응답을 직접 입력하거나 붙여넣으세요."
                style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb', fontFamily: 'monospace' }}
              />
              <button
                onClick={applyManual}
                style={{ padding: '8px 12px', borderRadius: 8, background: '#0ea5e9', color: '#fff', fontWeight: 700 }}
              >
                수동 응답 적용
              </button>
            </div>
          )}

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>턴 로그</div>
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 8 }}>
              {logs.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>아직 진행된 턴이 없습니다.</div>}
              {logs.map((log) => (
                <div key={`${log.turn}-${log.nodeId}-${log.action}`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#f8fafc' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    턴 {log.turn} · 노드 {log.nodeId}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                    결과: {log.outcome || '미확인'} · 변수: {log.variables.length ? log.variables.join(', ') : '없음'}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    다음: {log.action === 'continue' ? (log.nextNodeId ? `노드 ${log.nextNodeId}` : '미정') : log.action}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SharedChatDock height={300} />
        </div>

        <SlotRibbon
          side="right"
          roster={activeParticipants.length ? activeParticipants : participants}
          onSelect={setFocusedParticipant}
        />
      </div>

      <HistoryOverlay open={historyOpen} onClose={() => setHistoryOpen(false)} chatLog={chatLog} slotMap={slotMetaMap} />
      <HeroDetailOverlay participant={focusedParticipant} onClose={() => setFocusedParticipant(null)} />
    </div>
  )
}
