import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'
import {
  enqueueParticipant,
  extractViewerAssignment,
  flattenAssignmentMembers,
  loadActiveRoles,
  loadHeroesByIds,
  loadQueueEntries,
  removeQueueEntry,
} from '../../../lib/rank/matchmakingService'

const POLL_INTERVAL_MS = 4000

function readStoredHeroId() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem('selectedHeroId') || ''
  } catch (error) {
    console.warn('히어로 정보를 불러오지 못했습니다:', error)
    return ''
  }
}

async function loadViewer() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return data.user.id
}

async function loadViewerParticipation(gameId, ownerId) {
  if (!gameId || !ownerId) {
    return { score: 1000, role: '', heroId: '' }
  }
  const result = await withTable(supabase, 'rank_participants', (table) =>
    supabase
      .from(table)
      .select('score, rating, role, hero_id')
      .eq('game_id', gameId)
      .eq('owner_id', ownerId)
      .maybeSingle(),
  )
  if (result?.error) return { score: 1000, role: '', heroId: '' }
  const row = result?.data
  if (!row) return { score: 1000, role: '', heroId: '' }
  const score = Number(row.score)
  if (Number.isFinite(score) && score > 0) {
    return { score, role: row.role || '', heroId: row.hero_id || row.heroId || '' }
  }
  const rating = Number(row.rating)
  if (Number.isFinite(rating) && rating > 0) {
    return { score: rating, role: row.role || '', heroId: row.hero_id || row.heroId || '' }
  }
  return { score: 1000, role: row?.role || '', heroId: row.hero_id || row.heroId || '' }
}

async function upsertParticipantRole({ gameId, ownerId, heroId, role, score }) {
  if (!gameId || !ownerId || !role) return { ok: true }

  const payload = {
    game_id: gameId,
    owner_id: ownerId,
    hero_id: heroId || null,
    role,
    score,
    updated_at: new Date().toISOString(),
  }

  const result = await withTable(supabase, 'rank_participants', (table) =>
    supabase.from(table).upsert(payload, { onConflict: 'game_id,owner_id', ignoreDuplicates: false }),
  )

  if (result?.error) {
    console.warn('역할 정보를 저장하지 못했습니다:', result.error)
    return { ok: false, error: result.error.message || '역할 정보를 저장하지 못했습니다.' }
  }

  return { ok: true }
}

export default function useMatchQueue({ gameId, mode, enabled }) {
  const [viewerId, setViewerId] = useState('')
  const [heroId, setHeroId] = useState('')
  const [roles, setRoles] = useState([])
  const [queue, setQueue] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [score, setScore] = useState(1000)
  const [lockedRole, setLockedRole] = useState('')
  const [roleReady, setRoleReady] = useState(false)
  const [match, setMatch] = useState(null)
  const [heroMeta, setHeroMeta] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    loadViewer()
      .then((id) => {
        if (!cancelled && id) {
          setViewerId(id)
        }
      })
      .catch((cause) => console.warn('사용자 정보를 불러오지 못했습니다:', cause))
    setHeroId(readStoredHeroId())
    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !gameId) return
    let cancelled = false
    loadActiveRoles(supabase, gameId)
      .then((list) => {
        if (!cancelled) setRoles(list)
      })
      .catch((cause) => {
        console.error('역할 정보를 불러오지 못했습니다:', cause)
        if (!cancelled) setRoles([])
      })
    return () => {
      cancelled = true
    }
  }, [enabled, gameId])

  useEffect(() => {
    if (!enabled || !gameId || !viewerId) {
      setRoleReady(false)
      return
    }
    let cancelled = false
    setRoleReady(false)
    loadViewerParticipation(gameId, viewerId)
      .then((value) => {
        if (cancelled || !value) return
        setScore(value.score)
        setLockedRole(value.role || '')
        if (value.heroId) {
          setHeroId(String(value.heroId))
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem('selectedHeroId', String(value.heroId))
            } catch (error) {
              console.warn('히어로 정보를 저장하지 못했습니다:', error)
            }
          }
        }
      })
      .catch((cause) => console.warn('점수를 불러오지 못했습니다:', cause))
      .finally(() => {
        if (!cancelled) {
          setRoleReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, gameId, viewerId])

  useEffect(() => {
    if (!enabled) return
    if (!heroId) {
      setHeroMeta(null)
      return
    }
    let cancelled = false
    loadHeroesByIds(supabase, [heroId])
      .then((map) => {
        if (cancelled) return
        const meta = map.get(heroId) || map.get(String(heroId)) || null
        setHeroMeta(meta)
      })
      .catch((cause) => {
        console.warn('히어로 정보를 불러오지 못했습니다:', cause)
        if (!cancelled) setHeroMeta(null)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, heroId])

  useEffect(() => {
    if (!enabled) return
    const handleStorage = (event) => {
      if (event?.key && event.key !== 'selectedHeroId') return
      setHeroId(readStoredHeroId())
    }
    const handleFocus = () => {
      setHeroId(readStoredHeroId())
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', handleFocus)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || status !== 'queued') return

    async function runCheck() {
      try {
        const [roleList, queueRows] = await Promise.all([
          loadActiveRoles(supabase, gameId),
          loadQueueEntries(supabase, { gameId, mode }),
        ])
        setRoles(roleList)
        setQueue(queueRows)
        const response = await fetch('/api/rank/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, mode }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message = payload?.detail || payload?.error || '매칭 정보를 불러오지 못했습니다.'
          setError(message)
          return
        }
        if (payload?.error?.type) {
          setError(payload.error.type)
        } else {
          setError(payload?.error ? String(payload.error) : '')
        }
        if (!payload?.ready) {
          return
        }
        const assignment = extractViewerAssignment({ assignments: payload.assignments, viewerId })
        if (!assignment) return

        let heroMap = null
        if (payload.heroMap) {
          heroMap = new Map(Object.entries(payload.heroMap))
        }
        if (!heroMap) {
          const members = flattenAssignmentMembers(payload.assignments)
          heroMap = await loadHeroesByIds(
            supabase,
            members.map((member) => member.hero_id || member.heroId),
          )
        }

        setStatus('matched')
        setMatch({
          assignments: payload.assignments,
          maxWindow: payload.maxWindow,
          heroMap,
          matchCode: payload.matchCode || '',
        })
      } catch (cause) {
        console.error('매칭 확인 실패:', cause)
      }
    }

    runCheck()
    pollRef.current = setInterval(runCheck, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [enabled, gameId, mode, status, viewerId])

  const joinQueue = useCallback(
    async (role) => {
      if (!enabled) return { ok: false, error: '매칭이 비활성화되어 있습니다.' }
      if (!viewerId) return { ok: false, error: '로그인이 필요합니다.' }
      const activeHero = readStoredHeroId() || heroId
      if (!activeHero) return { ok: false, error: '먼저 사용할 캐릭터를 선택해 주세요.' }
      const finalRole = lockedRole || role
      if (!finalRole) return { ok: false, error: '역할을 선택해 주세요.' }

      setLoading(true)
      setError('')
      try {
        const response = await enqueueParticipant(supabase, {
          gameId,
          mode,
          ownerId: viewerId,
          heroId: activeHero,
          role: finalRole,
          score,
        })
        if (!response.ok) {
          setError(response.error || '대기열에 참가하지 못했습니다.')
          return response
        }

        const persisted = await upsertParticipantRole({
          gameId,
          ownerId: viewerId,
          heroId: activeHero,
          role: finalRole,
          score,
        })
        if (!persisted.ok && persisted.error) {
          setError(persisted.error)
        }

        setStatus('queued')
        setMatch(null)
        setHeroId(activeHero)
        if (!roleReady) {
          setRoleReady(true)
        }
        if (!lockedRole && finalRole) {
          setLockedRole(finalRole)
        }
        return { ok: true }
      } finally {
        setLoading(false)
      }
    },
    [enabled, gameId, mode, viewerId, heroId, score, lockedRole, roleReady],
  )

  const cancelQueue = useCallback(async () => {
    if (!viewerId) return { ok: true }
    setLoading(true)
    try {
      const result = await removeQueueEntry(supabase, { gameId, mode, ownerId: viewerId })
      setStatus('idle')
      setMatch(null)
      return result
    } finally {
      setLoading(false)
    }
  }, [gameId, mode, viewerId])

  const reset = useCallback(() => {
    setStatus('idle')
    setMatch(null)
    setQueue([])
  }, [])

  const derived = useMemo(
    () => ({
      viewerId,
      heroId,
      roles,
      queue,
      status,
      error,
      loading,
      score,
      match,
      lockedRole,
      roleReady,
      heroMeta,
    }),
    [
      viewerId,
      heroId,
      roles,
      queue,
      status,
      error,
      loading,
      score,
      match,
      lockedRole,
      roleReady,
      heroMeta,
    ],
  )

  return {
    state: derived,
    actions: {
      joinQueue,
      cancelQueue,
      reset,
      refreshHero: () => setHeroId(readStoredHeroId()),
    },
  }
}
