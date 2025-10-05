import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  flattenAssignmentMembers,
  loadHeroesByIds,
  loadQueueEntries,
  loadRoleLayout,
  runMatching,
} from '../../../lib/rank/matchmakingService'
import { supabase } from '../../../lib/supabase'

function buildLocalSampleMeta({ queue = [], assignments = [], result = null, layout = [] }) {
  const queueCount = Array.isArray(queue) ? queue.length : 0
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

  return {
    sampleType: 'client_simulation',
    generatedAt: new Date().toISOString(),
    queueCount,
    queueSampled: queueCount,
    simulatedSelected: selectedCount,
    simulatedFiltered: Math.max(0, queueCount - selectedCount),
    simulatedEligible: selectedCount,
    slotLayoutCount: layoutCount,
    uniqueHeroCount: uniqueHeroes.size,
    scoreWindow: Number.isFinite(scoreWindow) ? scoreWindow : 0,
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
      const [{ roles: roleList, slotLayout: layout }, queueRows] = await Promise.all([
        loadRoleLayout(supabase, gameId),
        loadQueueEntries(supabase, { gameId, mode }),
      ])

      setRoles(roleList)
      setSlotLayout(layout)
      setQueueSnapshot(queueRows)

      const result = runMatching({ mode, roles: roleList, queue: queueRows })
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
        assignments,
        result,
        layout,
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
      assignments: plan.assignments,
      totalSlots: plan.totalSlots,
      maxWindow: plan.maxWindow,
      ready: plan.ready,
      warnings: plan.warnings,
      memberCount: plan.memberCount,
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
  }, [plan, gameId, mode, roles, slotLayout, queueSnapshot, meta])

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
    meta,
    lastUpdated,
    refresh,
    exportPlan,
  }
}
