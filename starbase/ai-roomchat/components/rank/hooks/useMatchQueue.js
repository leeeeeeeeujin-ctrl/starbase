import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'
import {
  enqueueParticipant,
  extractViewerAssignment,
  flattenAssignmentMembers,
  loadActiveRoles,
  loadHeroesByIds,
  loadOwnerParticipantRoster,
  loadQueueEntries,
  removeQueueEntry,
} from '../../../lib/rank/matchmakingService'
import { guessOwnerParticipant } from '../../../lib/rank/participantUtils'

const POLL_INTERVAL_MS = 4000

function extractRoleName(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    return trimmed
  }
  if (typeof entry === 'object') {
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (name) return name
  }
  return ''
}

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

async function loadViewerParticipation(
  gameId,
  ownerId,
  { rolePreference = '', fallbackHeroId = '' } = {},
) {
  if (!gameId || !ownerId) {
    return { score: 1000, role: rolePreference || '', heroId: fallbackHeroId || '' }
  }

  try {
    const roster = await loadOwnerParticipantRoster(supabase, {
      gameId,
      ownerIds: [ownerId],
    })

    const guess = guessOwnerParticipant({
      ownerId,
      roster,
      rolePreference,
      fallbackHeroId,
    })

    const ownerEntries = roster instanceof Map ? roster.get(String(ownerId)) || [] : []

    return {
      score: Number.isFinite(guess.score) ? guess.score : 1000,
      role: guess.role || rolePreference || '',
      heroId: guess.heroId || fallbackHeroId || '',
      rosterEntries: ownerEntries,
    }
  } catch (error) {
    console.warn('참가자 정보를 불러오지 못했습니다:', error)
  }

  return {
    score: 1000,
    role: rolePreference || '',
    heroId: fallbackHeroId || '',
    rosterEntries: [],
  }
}

async function loadFallbackHeroId(ownerId) {
  if (!ownerId) return ''

  const result = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id, owner_id, updated_at, created_at')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )

  if (result?.error) {
    console.warn('히어로 기본값을 불러오지 못했습니다:', result.error)
    return ''
  }

  const hero = result?.data
  if (!hero?.id) return ''
  return String(hero.id)
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

export default function useMatchQueue({ gameId, mode, enabled, initialHeroId }) {
  const [viewerId, setViewerId] = useState('')
  const [heroId, setHeroId] = useState(() => (initialHeroId ? String(initialHeroId) : ''))
  const heroIdRef = useRef(heroId || '')
  const updateHeroSelection = useCallback(
    (value, { ownerId: ownerIdOverride, persistOwner = true } = {}) => {
      const normalized = value != null ? String(value).trim() : ''
      heroIdRef.current = normalized
      setHeroId((prev) => {
        if (prev === normalized) {
          return prev
        }
        return normalized
      })

      if (typeof window === 'undefined') {
        return normalized
      }

      try {
        if (normalized) {
          window.localStorage.setItem('selectedHeroId', normalized)
          if (persistOwner) {
            const targetOwner = ownerIdOverride || viewerId
            if (targetOwner) {
              window.localStorage.setItem('selectedHeroOwnerId', String(targetOwner))
            }
          }
        } else {
          window.localStorage.removeItem('selectedHeroId')
        }
      } catch (error) {
        console.warn('히어로 정보를 저장하지 못했습니다:', error)
      }

      return normalized
    },
    [viewerId],
  )
  useEffect(() => {
    heroIdRef.current = heroId || ''
  }, [heroId])
  const [roles, setRoles] = useState([])
  const [queue, setQueue] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [score, setScore] = useState(1000)
  const [lockedRole, setLockedRole] = useState('')
  const [roleReady, setRoleReady] = useState(false)
  const [match, setMatch] = useState(null)
  const [sampleMeta, setSampleMeta] = useState(null)
  const [pendingMatch, setPendingMatch] = useState(null)
  const [viewerRoster, setViewerRoster] = useState([])
  const [heroMap, setHeroMap] = useState(() => new Map())
  const pollRef = useRef(null)
  const probeRef = useRef(null)

  useEffect(() => {
    if (!viewerId) return
    const active = heroIdRef.current || ''
    if (!active) return
    updateHeroSelection(active, { ownerId: viewerId })
  }, [viewerId, updateHeroSelection])

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
    const storedHeroId = readStoredHeroId()
    if (storedHeroId) {
      setHeroId((prev) => {
        if (prev && String(prev).trim()) {
          return prev
        }
        return String(storedHeroId)
      })
    }
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
    if (!enabled) return
    if (!initialHeroId) return

    const normalized = String(initialHeroId)
    updateHeroSelection(normalized, { ownerId: viewerId || undefined })
  }, [enabled, initialHeroId])

  useEffect(() => {
    if (!enabled) return
    if (lockedRole) return
    if (!Array.isArray(roles) || roles.length === 0) return

    const fallback = extractRoleName(roles.find((role) => extractRoleName(role)))
    if (!fallback) return

    setLockedRole(fallback)
  }, [enabled, lockedRole, roles])

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
        setViewerRoster(Array.isArray(value.rosterEntries) ? value.rosterEntries : [])
        const existing = readStoredHeroId() || heroIdRef.current || ''
        if (!existing && value.heroId) {
          updateHeroSelection(String(value.heroId), { ownerId: viewerId || undefined })
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
    if (!enabled || !viewerId) return
    if (heroId) return

    let cancelled = false
    loadFallbackHeroId(viewerId)
      .then((fallbackId) => {
        if (cancelled || !fallbackId) return
        updateHeroSelection(fallbackId, { ownerId: viewerId || undefined })
      })
      .catch((cause) => console.warn('히어로 기본값을 불러오지 못했습니다:', cause))

    return () => {
      cancelled = true
    }
  }, [enabled, viewerId, heroId])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const ids = new Set()
    if (heroId) {
      ids.add(String(heroId))
    }
    if (Array.isArray(viewerRoster)) {
      viewerRoster.forEach((entry) => {
        if (entry?.heroId) {
          ids.add(String(entry.heroId))
        }
      })
    }
    const list = Array.from(ids).filter((item) => item && item.length > 0)
    if (list.length === 0) {
      setHeroMap(new Map())
      return () => {}
    }

    loadHeroesByIds(supabase, list)
      .then((map) => {
        if (cancelled) return
        setHeroMap(map)
      })
      .catch((cause) => {
        console.warn('히어로 정보를 불러오지 못했습니다:', cause)
        if (!cancelled) setHeroMap(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [enabled, heroId, viewerRoster])

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

  const runMatchProbe = useCallback(async () => {
    if (!enabled) return
    if (status !== 'queued') return

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

      const meta = payload?.sampleMeta || null
      setSampleMeta(meta)
      if (meta && process.env.NODE_ENV !== 'production') {
        try {
          if (typeof console.groupCollapsed === 'function') {
            console.groupCollapsed('[MatchQueue] 샘플 메타')
            console.log(meta)
            console.groupEnd()
          } else {
            console.log('[MatchQueue] 샘플 메타', meta)
          }
        } catch (logError) {
          console.info('[MatchQueue] 샘플 메타', meta, logError)
        }
      }

      if (!payload?.ready) {
        setPendingMatch({
          assignments: Array.isArray(payload?.assignments) ? payload.assignments : [],
          rooms: Array.isArray(payload?.rooms) ? payload.rooms : [],
          error: payload?.error || null,
          totalSlots: payload?.totalSlots ?? 0,
          maxWindow: payload?.maxWindow ?? 0,
          sampleMeta: meta,
        })
        return
      }

      setPendingMatch(null)
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
        matchType: payload.matchType || 'standard',
        brawlVacancies: Array.isArray(payload.brawlVacancies) ? payload.brawlVacancies : [],
        roleStatus: payload.roleStatus || null,
        sampleMeta: meta,
        dropInTarget: payload.dropInTarget || null,
        dropInMeta: payload.meta || null,
        rooms: Array.isArray(payload.rooms) ? payload.rooms : [],
      })
    } catch (cause) {
      console.error('매칭 확인 실패:', cause)
    }
  }, [enabled, status, gameId, mode, viewerId])

  useEffect(() => {
    probeRef.current = runMatchProbe
  }, [runMatchProbe])

  useEffect(() => {
    if (!enabled || status !== 'queued') return
    runMatchProbe()
    pollRef.current = setInterval(runMatchProbe, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [enabled, status, runMatchProbe])

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

        const queueHeroId =
          response.heroId != null && response.heroId !== ''
            ? String(response.heroId)
            : String(activeHero)

        const persisted = await upsertParticipantRole({
          gameId,
          ownerId: viewerId,
          heroId: queueHeroId,
          role: finalRole,
          score,
        })
        if (!persisted.ok && persisted.error) {
          setError(persisted.error)
        }

        setStatus('queued')
        setMatch(null)
        updateHeroSelection(queueHeroId, { ownerId: viewerId || undefined })
        if (!roleReady) {
          setRoleReady(true)
        }
        if (!lockedRole && finalRole) {
          setLockedRole(finalRole)
        }
        setSampleMeta(null)
        setPendingMatch(null)
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
      setSampleMeta(null)
      setPendingMatch(null)
      return result
    } finally {
      setLoading(false)
    }
  }, [gameId, mode, viewerId])

  const reset = useCallback(() => {
    setStatus('idle')
    setMatch(null)
    setQueue([])
    setSampleMeta(null)
    setPendingMatch(null)
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
      heroMeta:
        heroId
          ? heroMap.get(heroId) || heroMap.get(String(heroId)) || null
          : null,
      heroOptions: Array.isArray(viewerRoster)
        ? viewerRoster
            .map((entry) => {
              if (!entry) return null
              const resolvedId = entry.heroId ? String(entry.heroId) : ''
              if (!resolvedId) return null
              const meta = resolvedId
                ? heroMap.get(resolvedId) || heroMap.get(String(resolvedId)) || null
                : null
              return {
                heroId: resolvedId,
                role: entry.role || '',
                score: entry.score ?? null,
                slotIndex: entry.slotIndex ?? null,
                status: entry.status || '',
                name:
                  meta?.name ||
                  meta?.hero_name ||
                  entry.raw?.hero_name ||
                  (resolvedId ? `ID ${resolvedId}` : ''),
                avatarUrl: meta?.image_url || meta?.avatar_url || null,
              }
            })
            .filter(Boolean)
        : [],
      heroMap,
      viewerRoster,
      sampleMeta,
      pendingMatch,
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
      sampleMeta,
      pendingMatch,
      heroMap,
      viewerRoster,
    ],
  )

  const refresh = useCallback(async () => {
    if (typeof probeRef.current === 'function') {
      await probeRef.current()
    }
  }, [])

  return {
    state: derived,
    actions: {
      joinQueue,
      cancelQueue,
      reset,
      refresh,
      refreshHero: () => updateHeroSelection(readStoredHeroId() || '', { persistOwner: false }),
      setHero: (value, options = {}) =>
        updateHeroSelection(value != null ? String(value) : '', {
          ownerId: (options && options.ownerId) || viewerId || undefined,
          persistOwner: options?.persistOwner !== false,
        }),
    },
  }
}
