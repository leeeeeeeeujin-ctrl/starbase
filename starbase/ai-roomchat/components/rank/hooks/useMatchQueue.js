import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'
import {
  enqueueParticipant,
  extractViewerAssignment,
  filterStaleQueueEntries,
  flattenAssignmentMembers,
  heartbeatQueueEntry,
  loadActiveRoles,
  loadHeroesByIds,
  loadOwnerParticipantRoster,
  loadQueueEntries,
  normalizeQueueEntry,
  removeQueueEntry,
} from '../../../lib/rank/matchmakingService'
import { guessOwnerParticipant, normalizeHeroIdValue } from '../../../lib/rank/participantUtils'
import {
  QUEUE_HEARTBEAT_INTERVAL_MS,
  QUEUE_STALE_THRESHOLD_MS,
} from '../matchConstants'
import {
  HERO_ID_KEY,
  HERO_OWNER_KEY,
  clearHeroSelection,
  persistHeroOwner,
  persistHeroSelection,
  readHeroSelection,
} from '../../../lib/heroes/selectedHeroStorage'
import { getQueueModes } from '../../../lib/rank/matchModes'

const POLL_INTERVAL_MS = 4000
const REALTIME_PROBE_DELAY_MS = 240

function normalizeModeToken(value) {
  if (value == null) {
    return ''
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed.toLowerCase() : ''
  }
  const stringValue = String(value)
  const trimmed = stringValue.trim()
  return trimmed ? trimmed.toLowerCase() : ''
}

function buildQueueModeSet(mode) {
  const derived = getQueueModes(mode)
  const source = Array.isArray(derived) && derived.length ? derived : [mode]
  const set = new Set()
  source.forEach((token) => {
    const normalized = normalizeModeToken(token)
    if (normalized) {
      set.add(normalized)
    }
  })
  return set
}

function parseQueueTimestamp(value) {
  if (value == null) {
    return Number.NaN
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : Number.NaN
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return Number.NaN
    }
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric) && trimmed.replace(/\.0+$/, '') === String(numeric)) {
      return numeric
    }
    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return Number.NaN
}

function resolveQueueTimestamp(entry) {
  if (!entry || typeof entry !== 'object') {
    return Number.POSITIVE_INFINITY
  }
  const candidates = [
    entry.joined_at,
    entry.joinedAt,
    entry.created_at,
    entry.createdAt,
    entry.updated_at,
    entry.updatedAt,
  ]
  for (const candidate of candidates) {
    const parsed = parseQueueTimestamp(candidate)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return Number.POSITIVE_INFINITY
}

function sortQueueEntries(entries = []) {
  if (!Array.isArray(entries)) {
    return []
  }
  return entries
    .slice()
    .sort((a, b) => {
      const left = resolveQueueTimestamp(a)
      const right = resolveQueueTimestamp(b)
      if (left === right) {
        const leftId = a?.id ? String(a.id) : ''
        const rightId = b?.id ? String(b.id) : ''
        return leftId.localeCompare(rightId)
      }
      return left - right
    })
}

function applyQueueRealtimeChange(current, entry, eventType) {
  const list = Array.isArray(current) ? [...current] : []
  const id = entry?.id ? String(entry.id) : ''
  if (!id) {
    return list
  }

  const waiting = (entry?.status || 'waiting') === 'waiting'
  const index = list.findIndex((item) => (item?.id ? String(item.id) : '') === id)

  if (!waiting || eventType === 'DELETE') {
    if (index !== -1) {
      list.splice(index, 1)
    }
    return list
  }

  if (index !== -1) {
    list[index] = { ...list[index], ...entry }
  } else {
    list.push(entry)
  }
  return list
}

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

function normalizeRoleEntry(entry) {
  if (!entry) return null
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    return trimmed ? { name: trimmed, slot_count: 1, slotCount: 1 } : null
  }

  if (typeof entry !== 'object') return null

  const name = extractRoleName(entry)
  if (!name) return null

  const slotRaw = entry.slot_count ?? entry.slotCount ?? entry.slots ?? entry.capacity
  const slotNumeric = Number(slotRaw)
  const slotCount = Number.isFinite(slotNumeric) && slotNumeric > 0 ? Math.trunc(slotNumeric) : 0

  if (slotCount > 0) {
    return { ...entry, name, slot_count: slotCount, slotCount }
  }

  return { ...entry, name }
}

function normalizeRoleList(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((entry) => normalizeRoleEntry(entry))
    .filter(Boolean)
}

  function readStoredHeroId() {
    const selection = readHeroSelection()
    return selection?.heroId || ''
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

    const participantEntries = roster instanceof Map ? roster.get(String(ownerId)) || [] : []
    const heroEntries = await loadOwnerHeroEntries(ownerId)
    const combinedEntries = mergeRosterEntries(participantEntries, heroEntries)

    const guess = guessOwnerParticipant({
      ownerId,
      roster,
      rolePreference,
      fallbackHeroId,
    })

    const rosterCandidate = pickRosterHeroCandidate(combinedEntries, {
      rolePreference,
      fallbackHeroId,
    })

    const guessHeroId = normalizeHeroIdValue(guess.heroId)
    const fallbackHeroCandidateId = normalizeHeroIdValue(rosterCandidate?.heroId)
    const storedFallbackHeroId = normalizeHeroIdValue(fallbackHeroId)

    const resolvedHeroId =
      guessHeroId || fallbackHeroCandidateId || storedFallbackHeroId || ''

    const resolvedRole =
      (typeof guess.role === 'string' && guess.role.trim()) ||
      (typeof rosterCandidate?.role === 'string' && rosterCandidate.role.trim()) ||
      (typeof rolePreference === 'string' ? rolePreference.trim() : '') ||
      ''

    let resolvedScore = Number.isFinite(guess.score) && guess.score > 0 ? guess.score : null
    if (!Number.isFinite(resolvedScore) || resolvedScore == null) {
      const candidateScore = Number.isFinite(rosterCandidate?.score) ? rosterCandidate.score : null
      resolvedScore = Number.isFinite(candidateScore) && candidateScore != null ? candidateScore : 1000
    }

    return {
      score: resolvedScore,
      role: resolvedRole,
      heroId: resolvedHeroId ? String(resolvedHeroId) : '',
      rosterEntries: combinedEntries,
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

function normalizeRoleKey(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed.toLowerCase() : ''
  }
  return ''
}

function coerceRosterScore(value, fallback = 1000) {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric
  }
  return fallback
}

async function loadOwnerHeroEntries(ownerId) {
  if (!ownerId) return []

  try {
    const result = await withTable(supabase, 'heroes', (table) =>
      supabase
        .from(table)
        .select('id, owner_id, name, hero_name:name, image_url, updated_at, created_at')
        // NOTE: per-game 역할/점수 정보는 `rank_participants`에 저장되어 있으므로
        // `heroes` 뷰에서는 기본 프로필 필드만 요청한다.
        .eq('owner_id', ownerId),
    )

    if (result?.error) {
      throw result.error
    }

    const rows = Array.isArray(result?.data) ? result.data : []
    return rows
      .map((row) => {
        const heroId = normalizeHeroIdValue(row?.id)
        if (!heroId) return null

        const roleFields = [row?.role, row?.role_name, row?.roleName]
        let role = ''
        for (const field of roleFields) {
          if (typeof field === 'string' && field.trim()) {
            role = field.trim()
            break
          }
        }

        const scoreCandidates = [row?.score, row?.rating, row?.mmr, row?.rank_score, row?.rankScore]
        let score = 1000
        for (const candidate of scoreCandidates) {
          const normalizedScore = coerceRosterScore(candidate, NaN)
          if (Number.isFinite(normalizedScore)) {
            score = normalizedScore
            break
          }
        }

        if (!Number.isFinite(score)) {
          score = 1000
        }

        const status = typeof row?.status === 'string' ? row.status.trim().toLowerCase() : ''

        return {
          ownerId: String(row?.owner_id || ownerId),
          heroId: String(heroId),
          role,
          score,
          slotIndex: null,
          status,
          name: row?.name || row?.hero_name || row?.heroName || '',
          raw: {
            hero_id: heroId,
            name: row?.name || '',
            hero_name: row?.name || row?.hero_name || row?.heroName || '',
            hero_avatar_url: row?.image_url || row?.avatar_url || row?.hero_avatar_url || null,
          },
        }
      })
      .filter(Boolean)
  } catch (error) {
    console.warn('히어로 목록을 불러오지 못했습니다:', error)
    return []
  }
}

function mergeRosterEntries(participantEntries = [], heroEntries = []) {
  const output = []
  const indexByHeroId = new Map()

  const addEntry = (entry, { preferExisting = false } = {}) => {
    if (!entry) return
    const heroId = entry.heroId != null ? String(entry.heroId) : ''
    if (!heroId) return
    if (indexByHeroId.has(heroId)) {
      if (preferExisting) {
        return
      }
      const index = indexByHeroId.get(heroId)
      const existing = output[index]
      const nextScore = coerceRosterScore(entry.score, NaN)
      const prevScore = coerceRosterScore(existing.score, NaN)
      output[index] = {
        ...existing,
        ...entry,
        heroId,
        role: entry.role || existing.role || '',
        score: Number.isFinite(nextScore) ? nextScore : Number.isFinite(prevScore) ? prevScore : null,
        status: entry.status || existing.status || '',
        slotIndex: entry.slotIndex ?? existing.slotIndex ?? null,
        raw: entry.raw || existing.raw || null,
      }
      return
    }

    indexByHeroId.set(heroId, output.length)
    const initialScore = coerceRosterScore(entry.score, NaN)
    output.push({
      ...entry,
      heroId,
      role: entry.role || '',
      status: entry.status || '',
      slotIndex: entry.slotIndex ?? null,
      score: Number.isFinite(initialScore) ? initialScore : null,
    })
  }

  ;(participantEntries || []).forEach((entry) => addEntry(entry))
  ;(heroEntries || []).forEach((entry) => addEntry(entry, { preferExisting: true }))

  return output
}

function pickRosterHeroCandidate(entries = [], { rolePreference = '', fallbackHeroId = '' } = {}) {
  if (!Array.isArray(entries)) return null

  const normalizedFallback = normalizeHeroIdValue(fallbackHeroId)
  const normalizedRole = normalizeRoleKey(rolePreference)

  const mapped = entries
    .map((entry) => {
      if (!entry) return null
      const heroId = normalizeHeroIdValue(entry.heroId)
      if (!heroId) return null
      const role = typeof entry.role === 'string' ? entry.role.trim() : ''
      const score = coerceRosterScore(entry.score, NaN)
      return {
        heroId,
        role,
        roleKey: normalizeRoleKey(role),
        score: Number.isFinite(score) ? score : null,
        entry,
      }
    })
    .filter(Boolean)

  if (!mapped.length) {
    return null
  }

  if (normalizedFallback) {
    const fallbackMatch = mapped.find((item) => item.heroId === normalizedFallback)
    if (fallbackMatch) return fallbackMatch.entry
  }

  if (normalizedRole) {
    const roleMatch = mapped.find((item) => item.roleKey === normalizedRole)
    if (roleMatch) return roleMatch.entry
  }

  return mapped[0].entry
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

export default function useMatchQueue({
  gameId,
  mode,
  enabled,
  initialHeroId,
  onApiKeyExpired,
}) {
  const [viewerId, setViewerId] = useState('')
  const [heroId, setHeroId] = useState(() => (initialHeroId ? String(initialHeroId) : ''))
  const heroIdRef = useRef(heroId || '')
  const queueModeSet = useMemo(() => buildQueueModeSet(mode), [mode])
  const queueChannelSuffix = useMemo(
    () => (queueModeSet.size ? Array.from(queueModeSet).sort().join('|') : 'all'),
    [queueModeSet],
  )
  const gameIdKey = useMemo(() => (gameId ? String(gameId).trim() : ''), [gameId])
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

      try {
        if (normalized) {
          const existingSelection = readHeroSelection()
          const ownerToPersist = persistOwner
            ? ownerIdOverride || viewerId || existingSelection?.ownerId || null
            : existingSelection?.ownerId || null
          persistHeroSelection({ id: normalized }, ownerToPersist)
          if (persistOwner && (ownerIdOverride || viewerId)) {
            persistHeroOwner(ownerIdOverride || viewerId)
          }
        } else {
          clearHeroSelection()
          if (persistOwner && viewerId) {
            persistHeroOwner(viewerId)
          }
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
  useEffect(() => {
    queueModeSetRef.current = queueModeSet
  }, [queueModeSet])
  useEffect(() => {
    statusRef.current = status
  }, [status])
  useEffect(() => {
    return () => {
      const state = realtimeProbeRef.current
      if (state?.timer) {
        clearTimeout(state.timer)
        state.timer = null
      }
      if (state) {
        state.pending = false
      }
    }
  }, [])
  const scheduleRealtimeProbe = useCallback(() => {
    const state = realtimeProbeRef.current
    if (!state || state.pending) {
      return
    }
    state.pending = true
    state.timer = setTimeout(() => {
      state.pending = false
      state.timer = null
      if (typeof probeRef.current === 'function') {
        try {
          probeRef.current()
        } catch (error) {
          console.warn('[MatchQueue] 실시간 매칭 재조회 실패:', error)
        }
      }
    }, REALTIME_PROBE_DELAY_MS)
  }, [])
  const [roles, setRoles] = useState([])
  const [queue, setQueue] = useState([])
  const [status, setStatus] = useState('idle')
  const statusRef = useRef('idle')
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
  const [slotLayout, setSlotLayout] = useState([])
  const roleLookup = useMemo(() => {
    const register = (map, value) => {
      if (!value || typeof value !== 'string') return
      const trimmed = value.trim()
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      if (!map.has(key)) {
        map.set(key, trimmed)
      }
    }

    const map = new Map()

    if (Array.isArray(slotLayout) && slotLayout.length > 0) {
      slotLayout.forEach((slot) => {
        if (!slot) return
        register(map, typeof slot.role === 'string' ? slot.role : '')
      })
    }

    if (map.size === 0 && Array.isArray(roles)) {
      roles.forEach((entry) => {
        if (!entry) return
        if (typeof entry === 'string') {
          register(map, entry)
          return
        }
        const name =
          typeof entry.name === 'string'
            ? entry.name
            : typeof entry.role === 'string'
            ? entry.role
            : ''
        register(map, name)
      })
    }

    return map
  }, [roles, slotLayout])
  const pollRef = useRef(null)
  const probeRef = useRef(null)
  const queueModeSetRef = useRef(queueModeSet)
  const realtimeProbeRef = useRef({ timer: null, pending: false })

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
        if (!cancelled) setRoles(normalizeRoleList(list))
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
    const storedHeroFallback = readStoredHeroId() || heroIdRef.current || ''
    loadViewerParticipation(gameId, viewerId, { fallbackHeroId: storedHeroFallback })
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
        if (event?.key && event.key !== HERO_ID_KEY && event.key !== HERO_OWNER_KEY) return
        setHeroId(readStoredHeroId())
      }
      const handleRefresh = () => {
        setHeroId(readStoredHeroId())
      }
      window.addEventListener('storage', handleStorage)
      window.addEventListener('focus', handleRefresh)
      window.addEventListener('hero-overlay:refresh', handleRefresh)
      return () => {
        window.removeEventListener('storage', handleStorage)
        window.removeEventListener('focus', handleRefresh)
        window.removeEventListener('hero-overlay:refresh', handleRefresh)
      }
    }, [enabled])

  const runMatchProbe = useCallback(async () => {
    if (!enabled) return
    if (status !== 'queued') return

    try {
      const [roleList, queueRowsRaw] = await Promise.all([
        loadActiveRoles(supabase, gameId),
        loadQueueEntries(supabase, { gameId, mode }),
      ])
      setRoles(normalizeRoleList(roleList))

      const { freshEntries } = filterStaleQueueEntries(queueRowsRaw, {
        staleThresholdMs: QUEUE_STALE_THRESHOLD_MS,
      })
      setQueue(sortQueueEntries(freshEntries))

      const response = await fetch('/api/rank/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, mode }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = payload?.detail || payload?.error || '매칭 정보를 불러오지 못했습니다.'
        if (response.status === 400) {
          const notice = 'API 키가 만료되었습니다. 새 API 키를 사용해주세요.'
          setError(notice)
          setStatus('idle')
          setMatch(null)
          setPendingMatch(null)
          setSampleMeta(null)
          if (viewerId) {
            try {
              await removeQueueEntry(supabase, { gameId, mode, ownerId: viewerId })
            } catch (cleanupError) {
              console.warn('[MatchQueue] 대기열 정리 실패:', cleanupError)
            }
          }
          if (typeof onApiKeyExpired === 'function') {
            try {
              onApiKeyExpired({
                status: response.status,
                message: notice,
                detail: payload?.detail || '',
                error: payload?.error || '',
              })
            } catch (callbackError) {
              console.warn('[MatchQueue] API 키 만료 콜백 실행 실패:', callbackError)
            }
          }
          return
        }
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
      const payloadRoles = normalizeRoleList(Array.isArray(payload?.roles) ? payload.roles : [])
      const payloadLayout = Array.isArray(payload?.slotLayout) ? payload.slotLayout : []
      setRoles(payloadRoles)
      setSlotLayout(payloadLayout)
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
          roles: payloadRoles,
          slotLayout: payloadLayout,
          gameId,
        })
        return
      }

      setPendingMatch(null)
      const assignment = extractViewerAssignment({
        assignments: payload.assignments,
        viewerId,
        heroId: heroIdRef.current || heroId || '',
      })
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
        roles: payloadRoles,
        slotLayout: payloadLayout,
        gameId,
      })
    } catch (cause) {
      console.error('매칭 확인 실패:', cause)
    }
  }, [enabled, status, gameId, mode, viewerId, onApiKeyExpired])

  useEffect(() => {
    probeRef.current = runMatchProbe
  }, [runMatchProbe])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }
    if (!gameIdKey) {
      return undefined
    }

    const filter = `game_id=eq.${gameIdKey}`
    const channelName = `rank-match-queue:${gameIdKey}:${queueChannelSuffix}`
    const channel = supabase.channel(channelName)

    const handleChange = (payload) => {
      if (!payload) {
        return
      }
      const eventType = payload.eventType || payload.type || payload.event || ''
      const raw = payload.new ?? payload.old
      if (!raw) {
        return
      }
      const normalized = normalizeQueueEntry(raw)
      if (!normalized) {
        return
      }
      const rowGameId = normalized.game_id ?? normalized.gameId
      const normalizedGameId = rowGameId ? String(rowGameId).trim() : ''
      if (!normalizedGameId || normalizedGameId !== gameIdKey) {
        return
      }
      const allowedModes = queueModeSetRef.current
      const entryMode = normalizeModeToken(normalized.mode)
      if (allowedModes.size && entryMode && !allowedModes.has(entryMode)) {
        return
      }
      setQueue((prev) => {
        const next = applyQueueRealtimeChange(prev, normalized, eventType)
        const { freshEntries } = filterStaleQueueEntries(next, {
          staleThresholdMs: QUEUE_STALE_THRESHOLD_MS,
        })
        return sortQueueEntries(freshEntries)
      })
      if (statusRef.current === 'queued') {
        scheduleRealtimeProbe()
      }
    }

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rank_match_queue', filter }, handleChange)

    channel.subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[MatchQueue] 실시간 채널 상태 이상', {
          channel: channelName,
          status,
          error: err || null,
        })
      }
    })

    return () => {
      try {
        channel.unsubscribe()
      } catch (error) {
        console.warn('[MatchQueue] 실시간 채널 구독 해제 실패', {
          channel: channelName,
          error,
        })
      }
      supabase.removeChannel(channel)
    }
  }, [enabled, gameIdKey, queueChannelSuffix, scheduleRealtimeProbe])

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

  useEffect(() => {
    if (!enabled) return undefined
    if (!viewerId) return undefined
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
    if (status !== 'queued' && status !== 'matched') return undefined

    let cancelled = false
    let timer = null

    const schedule = () => {
      if (cancelled) return
      timer = setTimeout(tick, QUEUE_HEARTBEAT_INTERVAL_MS)
    }

    const tick = async () => {
      if (cancelled) return
      if (document.visibilityState !== 'visible') {
        schedule()
        return
      }
      try {
        await heartbeatQueueEntry(supabase, { gameId, mode, ownerId: viewerId })
      } catch (error) {
        console.warn('[MatchQueue] heartbeat failed:', error)
      }
      schedule()
    }

    const handleVisibility = () => {
      if (cancelled) return
      if (document.visibilityState === 'visible') {
        tick()
      }
    }

    tick()

    document.addEventListener('visibilitychange', handleVisibility, true)

    return () => {
      cancelled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      document.removeEventListener('visibilitychange', handleVisibility, true)
    }
  }, [enabled, gameId, mode, status, viewerId])

  const joinQueue = useCallback(
    async (role) => {
      if (!enabled) {
        console.warn('[MatchQueue] joinQueue 중단: 매칭 비활성화 상태', {
          gameId,
          mode,
          viewerId,
        })
        return { ok: false, error: '매칭이 비활성화되어 있습니다.' }
      }
      if (!viewerId) {
        console.warn('[MatchQueue] joinQueue 중단: 로그인 필요', { gameId, mode, role })
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      const activeHero = readStoredHeroId() || heroId
      if (!activeHero) {
        console.warn('[MatchQueue] joinQueue 중단: 선택된 캐릭터 없음', {
          viewerId,
          role,
        })
        return { ok: false, error: '먼저 사용할 캐릭터를 선택해 주세요.' }
      }
      const finalRole = lockedRole || role
      const finalRoleName = typeof finalRole === 'string' ? finalRole.trim() : ''
      if (!finalRoleName) {
        console.warn('[MatchQueue] joinQueue 중단: 역할 미선택', {
          viewerId,
          heroId: activeHero,
        })
        return { ok: false, error: '역할을 선택해 주세요.' }
      }

      const normalizedRoleKey = normalizeRoleKey(finalRoleName)
      if (roleLookup.size > 0 && !roleLookup.has(normalizedRoleKey)) {
        const message = '선택한 역할이 이 게임 구성과 일치하지 않습니다.'
        console.warn('[MatchQueue] joinQueue 중단: 역할 미정의', {
          viewerId,
          heroId: activeHero,
          role: finalRoleName,
        })
        setError(message)
        return { ok: false, error: message }
      }

      const rosterEntries = Array.isArray(viewerRoster) ? viewerRoster : []
      const normalizedHeroId = normalizeHeroIdValue(activeHero)
      const rosterEntry = rosterEntries.find((entry) => {
        if (!entry) return false
        const entryHeroId = normalizeHeroIdValue(entry.heroId)
        return entryHeroId && normalizedHeroId && entryHeroId === normalizedHeroId
      })

      const rosterRoleKey = rosterEntry ? normalizeRoleKey(rosterEntry.role) : ''
      if (rosterEntry && !rosterRoleKey) {
        const message = '선택한 캐릭터의 역할 정보를 확인할 수 없습니다.'
        console.warn('[MatchQueue] joinQueue 중단: 역할 정보 없음', {
          viewerId,
          heroId: activeHero,
          role: finalRoleName,
        })
        setError(message)
        return { ok: false, error: message }
      }

      if (rosterRoleKey && rosterRoleKey !== normalizedRoleKey) {
        const message = '선택한 캐릭터는 해당 역할에 배정되어 있지 않습니다.'
        console.warn('[MatchQueue] joinQueue 중단: 역할 불일치', {
          viewerId,
          heroId: activeHero,
          requestedRole: finalRoleName,
          rosterRole: rosterEntry.role,
        })
        setError(message)
        return { ok: false, error: message }
      }

      setLoading(true)
      setError('')
      try {
        console.info('[MatchQueue] 대기열 참가 요청', {
          gameId,
          mode,
          viewerId,
          heroId: activeHero,
          role: finalRole,
          score,
        })
        const response = await enqueueParticipant(supabase, {
          gameId,
          mode,
          ownerId: viewerId,
          heroId: activeHero,
          role: finalRoleName,
          score,
        })
        if (!response.ok) {
          console.error('[MatchQueue] 대기열 참가 실패', {
            gameId,
            mode,
            viewerId,
            heroId: activeHero,
            role: finalRoleName,
            error: response.error,
          })
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
          role: finalRoleName,
          score,
        })
        if (!persisted.ok && persisted.error) {
          console.warn('[MatchQueue] 참가자 역할 저장 실패', {
            viewerId,
            heroId: queueHeroId,
            role: finalRoleName,
            error: persisted.error,
          })
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
        console.info('[MatchQueue] 대기열 참가 완료', {
          viewerId,
          heroId: queueHeroId,
          role: finalRoleName,
        })
        return { ok: true }
      } finally {
        setLoading(false)
      }
    },
    [
      enabled,
      gameId,
      mode,
      viewerId,
      heroId,
      score,
      lockedRole,
      roleReady,
      roleLookup,
      viewerRoster,
    ],
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
    setSlotLayout([])
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
                  entry.raw?.name ||
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
      slotLayout,
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
      slotLayout,
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
