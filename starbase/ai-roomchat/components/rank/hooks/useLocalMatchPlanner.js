import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  flattenAssignmentMembers,
  loadHeroesByIds,
  loadMatchSampleSource,
  loadRoleLayout,
  runMatching,
} from '../../../lib/rank/matchmakingService'
import { supabase } from '../../../lib/supabase'

function buildLocalSampleMeta({
  queue = [],
  participantPool = [],
  sampleEntries = [],
  sampleType = 'realtime_queue',
  realtimeEnabled = false,
  assignments = [],
  result = null,
  layout = [],
  generatedAt = null,
  standinCount = 0,
  queueWaitSeconds = null,
  queueWaitThresholdSeconds = null,
}) {
  const queueCount = Array.isArray(queue) ? queue.length : 0
  const poolCount = Array.isArray(participantPool) ? participantPool.length : 0
  const sampleCount = Array.isArray(sampleEntries) ? sampleEntries.length : 0
  const members = flattenAssignmentMembers(assignments)
  const selectedCount = members.length
  const layoutCount = Array.isArray(layout) ? layout.length : 0
  const uniqueHeroes = new Set(
    members
      .map((member) => member?.hero_id || member?.heroId || null)
      .filter(Boolean)
      .map((id) => String(id)),
  )

  const scoreWindow = Number(result?.maxWindow)
  const queueSampled =
    sampleType === 'realtime_queue'
      ? sampleCount
      : Math.min(queueCount, sampleCount)
  const filteredCount = Math.max(0, sampleCount - selectedCount)
  const standinSampled = Array.isArray(sampleEntries)
    ? sampleEntries.filter((entry) => entry?.standin || entry?.match_source === 'participant_pool')
        .length
    : 0
  const standinSelected = members.filter(
    (member) => member?.standin || member?.match_source === 'participant_pool',
  ).length

  return {
    sampleType,
    realtime: Boolean(realtimeEnabled),
    generatedAt: generatedAt || new Date().toISOString(),
    queueCount,
    queueSampled,
    participantPoolCount: poolCount,
    sampleCount,
    simulatedSelected: selectedCount,
    simulatedFiltered: filteredCount,
    simulatedEligible: selectedCount,
    slotLayoutCount: layoutCount,
    uniqueHeroCount: uniqueHeroes.size,
    scoreWindow: Number.isFinite(scoreWindow) ? scoreWindow : 0,
    standinSampled,
    standinSelected,
    standinAvailable: Number.isFinite(Number(standinCount)) ? Number(standinCount) : standinCount,
    queueWaitSeconds:
      typeof queueWaitSeconds === 'number' && Number.isFinite(queueWaitSeconds)
        ? queueWaitSeconds
        : null,
    queueWaitThresholdSeconds:
      typeof queueWaitThresholdSeconds === 'number' && Number.isFinite(queueWaitThresholdSeconds)
        ? queueWaitThresholdSeconds
        : null,
    ready: Boolean(result?.ready),
    totalSlots: Number(result?.totalSlots) || layoutCount || 0,
  }
}

function formatHeroConflicts(assignments = []) {
  const members = flattenAssignmentMembers(assignments)
  const seen = new Set()
  const duplicates = new Set()

  members.forEach((member) => {
    const heroId = member?.hero_id || member?.heroId || null
    if (!heroId) return
    const key = String(heroId)
    if (seen.has(key)) {
      duplicates.add(key)
    } else {
      seen.add(key)
    }
  })

  if (!duplicates.size) return []
  return [`중복 영웅 ${duplicates.size}명 감지 (${Array.from(duplicates).join(', ')})`]
}

function mapToPlain(map) {
  const plain = {}
  if (!map || typeof map.forEach !== 'function') return plain
  map.forEach((value, key) => {
    plain[key] = value
  })
  return plain
}

export default function useLocalMatchPlanner({ gameId, mode, enabled }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState(null)
  const [roles, setRoles] = useState([])
  const [slotLayout, setSlotLayout] = useState([])
  const [queueSnapshot, setQueueSnapshot] = useState([])
  const [sampleSnapshot, setSampleSnapshot] = useState([])
  const [participantSnapshot, setParticipantSnapshot] = useState([])
  const [sampleType, setSampleType] = useState('realtime_queue')
  const [sampleRealtime, setSampleRealtime] = useState(false)
  const [sampleGeneratedAt, setSampleGeneratedAt] = useState('')
  const [meta, setMeta] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const refresh = useCallback(async () => {
    if (!enabled) return { ok: false, error: '로컬 매칭이 비활성화되어 있습니다.' }
    if (!gameId || !mode) {
      setError('게임 또는 모드 정보가 없습니다.')
      return { ok: false, error: '필수 정보가 부족합니다.' }
    }

    setLoading(true)
    setError('')

    try {
      const [{ roles: roleList, slotLayout: layout }, sampleSet] = await Promise.all([
        loadRoleLayout(supabase, gameId),
        loadMatchSampleSource(supabase, { gameId, mode }),
      ])

      setRoles(roleList)
      setSlotLayout(layout)
      const queueRows = Array.isArray(sampleSet.queue) ? sampleSet.queue : []
      const participantPool = Array.isArray(sampleSet.participantPool)
        ? sampleSet.participantPool
        : []
      const sampleEntries = Array.isArray(sampleSet.entries) ? sampleSet.entries : []

      setQueueSnapshot(queueRows)
      setParticipantSnapshot(participantPool)
      setSampleSnapshot(sampleEntries)
      setSampleType(sampleSet.sampleType || (sampleSet.realtimeEnabled ? 'realtime_queue' : 'participant_pool'))
      setSampleRealtime(Boolean(sampleSet.realtimeEnabled))
      setSampleGeneratedAt(sampleSet.generatedAt || new Date().toISOString())

      const result = runMatching({ mode, roles: roleList, queue: sampleEntries })
      const assignments = Array.isArray(result.assignments) ? result.assignments : []

      const members = flattenAssignmentMembers(assignments)
      const heroIds = members
        .map((member) => member?.hero_id || member?.heroId || null)
        .filter(Boolean)
      const heroMap = heroIds.length ? await loadHeroesByIds(supabase, heroIds) : new Map()

      const warnings = [...formatHeroConflicts(assignments)]
      const slotTarget = layout.length || Number(result.totalSlots) || 0
      if (slotTarget && members.length !== slotTarget) {
        warnings.push(`필요 슬롯 ${slotTarget}개 중 ${members.length}개만 채워졌습니다.`)
      }

      const metaPayload = buildLocalSampleMeta({
        queue: queueRows,
        participantPool,
        sampleEntries,
        sampleType: sampleSet.sampleType || (sampleSet.realtimeEnabled ? 'realtime_queue' : 'participant_pool'),
        realtimeEnabled: sampleSet.realtimeEnabled,
        assignments,
        result,
        layout,
        generatedAt: sampleSet.generatedAt,
        standinCount: sampleSet.standinCount,
        queueWaitSeconds: sampleSet.queueWaitSeconds,
        queueWaitThresholdSeconds: sampleSet.queueWaitThresholdSeconds,
      })

      if (!warnings.length && result?.error?.type) {
        warnings.push(`매칭 보류 사유: ${result.error.type}`)
      }

      const snapshot = {
        ready: Boolean(result.ready),
        assignments,
        totalSlots: Number(result.totalSlots) || layout.length || 0,
        maxWindow: Number(result.maxWindow) || 0,
        error: result.error || null,
        heroMap,
        warnings,
        memberCount: members.length,
        sampleType: metaPayload.sampleType,
        realtime: metaPayload.realtime,
        sampleGeneratedAt: metaPayload.generatedAt,
        standinSelected: metaPayload.standinSelected,
        standinSampled: metaPayload.standinSampled,
        queueWaitSeconds: metaPayload.queueWaitSeconds,
        queueWaitThresholdSeconds: metaPayload.queueWaitThresholdSeconds,
      }

      setPlan(snapshot)
      setMeta(metaPayload)
      setLastUpdated(new Date())

      return { ok: true, plan: snapshot, meta: metaPayload }
    } catch (cause) {
      console.error('로컬 매칭 시뮬레이션 실패:', cause)
      const message = cause?.message || '로컬 매칭에 실패했습니다.'
      setError(message)
      setPlan(null)
      setMeta(null)
      return { ok: false, error: message }
    } finally {
      setLoading(false)
    }
  }, [enabled, gameId, mode])

  const exportPlan = useCallback(() => {
    if (!plan) {
      return { ok: false, error: '내보낼 매칭 정보가 없습니다.' }
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      gameId,
      mode,
      roles,
      slotLayout,
      queue: queueSnapshot,
      sample: sampleSnapshot,
      participantPool: participantSnapshot,
      sampleType,
      realtime: sampleRealtime,
      sampleGeneratedAt,
      assignments: plan.assignments,
      totalSlots: plan.totalSlots,
      maxWindow: plan.maxWindow,
      ready: plan.ready,
      warnings: plan.warnings,
      memberCount: plan.memberCount,
      standinSelected: plan.standinSelected,
      standinSampled: plan.standinSampled,
      queueWaitSeconds: plan.queueWaitSeconds,
      queueWaitThresholdSeconds: plan.queueWaitThresholdSeconds,
      meta,
      heroMap: mapToPlain(plan.heroMap),
    }

    if (typeof window !== 'undefined') {
      try {
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        link.download = `match-plan-${gameId || 'unknown'}-${stamp}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } catch (downloadError) {
        console.warn('매칭 계획 내보내기 실패:', downloadError)
        return { ok: false, error: '파일을 저장하지 못했습니다.' }
      }
    }

    return { ok: true, payload }
  }, [
    plan,
    gameId,
    mode,
    roles,
    slotLayout,
    queueSnapshot,
    sampleSnapshot,
    participantSnapshot,
    sampleType,
    sampleRealtime,
    sampleGeneratedAt,
    meta,
  ])

  useEffect(() => {
    if (!enabled) return
    refresh()
  }, [enabled, refresh])

  const derivedPlan = useMemo(() => {
    if (!plan) return null
    return {
      ...plan,
      heroMap: plan.heroMap,
    }
  }, [plan])

  return {
    loading,
    error,
    plan: derivedPlan,
    roles,
    slotLayout,
    queue: queueSnapshot,
    sample: sampleSnapshot,
    participantPool: participantSnapshot,
    sampleType,
    realtimeEnabled: sampleRealtime,
    meta,
    lastUpdated,
    refresh,
    exportPlan,
  }
}
