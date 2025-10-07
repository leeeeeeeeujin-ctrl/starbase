import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { resolveViewerProfile } from '@/lib/heroes/resolveViewerProfile'
import { supabase } from '@/lib/supabase'
import { withTable } from '@/lib/supabaseTables'
import {
  HERO_ID_KEY,
  HERO_OWNER_KEY,
  clearHeroSelection,
  persistHeroOwner,
  persistHeroSelection,
  readHeroSelection,
} from '@/lib/heroes/selectedHeroStorage'

const HOST_CLEANUP_DELAY_MS = 15000

const hostCleanupState = {
  timerId: null,
  roomId: null,
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    padding: '32px 16px 96px',
    boxSizing: 'border-box',
  },
  shell: {
    maxWidth: 960,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  header: {
    display: 'grid',
    gap: 16,
    background: 'rgba(15, 23, 42, 0.78)',
    borderRadius: 24,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    padding: '24px 26px',
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  titleBlock: {
    display: 'grid',
    gap: 6,
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    color: '#94a3b8',
  },
  backLink: {
    textDecoration: 'none',
    color: '#38bdf8',
    fontWeight: 700,
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(15, 23, 42, 0.6)',
    alignSelf: 'flex-start',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 13,
    color: '#cbd5f5',
  },
  heroSummary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 13,
    color: '#94a3b8',
  },
  actionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  primaryButton: (disabled) => ({
    padding: '10px 18px',
    borderRadius: 12,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: disabled ? 'rgba(37, 99, 235, 0.28)' : 'rgba(37, 99, 235, 0.75)',
    color: disabled ? '#94a3b8' : '#f8fafc',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
  }),
  secondaryButton: (disabled) => ({
    padding: '10px 18px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: disabled ? 'rgba(30, 41, 59, 0.45)' : 'rgba(30, 41, 59, 0.8)',
    color: disabled ? '#94a3b8' : '#f8fafc',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  dangerButton: (disabled) => ({
    padding: '10px 18px',
    borderRadius: 12,
    border: '1px solid rgba(248, 113, 113, 0.45)',
    background: disabled ? 'rgba(127, 29, 29, 0.45)' : 'rgba(239, 68, 68, 0.75)',
    color: disabled ? '#fecaca' : '#fee2e2',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  infoText: {
    margin: 0,
    fontSize: 13,
    color: '#fca5a5',
  },
  loadingState: {
    textAlign: 'center',
    padding: '80px 20px',
    fontSize: 15,
    color: '#94a3b8',
  },
  errorCard: {
    background: 'rgba(248, 113, 113, 0.12)',
    border: '1px solid rgba(248, 113, 113, 0.35)',
    borderRadius: 18,
    padding: '22px 24px',
    display: 'grid',
    gap: 12,
    color: '#fecaca',
  },
  errorTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  errorText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
  },
  retryButton: {
    justifySelf: 'flex-start',
    padding: '9px 16px',
    borderRadius: 12,
    border: '1px solid rgba(248, 113, 113, 0.55)',
    background: 'rgba(127, 29, 29, 0.65)',
    color: '#fee2e2',
    fontWeight: 600,
    cursor: 'pointer',
  },
  slotSection: {
    background: 'rgba(15, 23, 42, 0.78)',
    borderRadius: 22,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    padding: '24px 26px',
    display: 'grid',
    gap: 18,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 20px',
    color: '#94a3b8',
  },
  slotGrid: {
    display: 'grid',
    gap: 14,
  },
  slotCard: (highlighted) => ({
    borderRadius: 18,
    border: highlighted
      ? '1px solid rgba(59, 130, 246, 0.55)'
      : '1px solid rgba(148, 163, 184, 0.25)',
    background: highlighted ? 'rgba(30, 64, 175, 0.35)' : 'rgba(15, 23, 42, 0.6)',
    padding: '16px 18px',
    display: 'grid',
    gap: 10,
  }),
  slotHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 14,
    fontWeight: 700,
  },
  slotRole: {
    margin: 0,
  },
  slotIndex: {
    fontSize: 12,
    color: '#94a3b8',
  },
  slotBody: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
    lineHeight: 1.6,
  },
  slotTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 11,
  },
  slotTag: {
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.22)',
    color: '#bfdbfe',
    fontWeight: 600,
  },
}

const FLEXIBLE_ROLE_KEYS = new Set([
  '',
  '역할 미지정',
  '미정',
  '자유',
  '자유 선택',
  'any',
  'all',
  'flex',
  'flexible',
])

function normalizeRole(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isFlexibleRole(role) {
  const normalized = normalizeRole(role)
  return FLEXIBLE_ROLE_KEYS.has(normalized)
}

function formatRelativeTime(value) {
  if (!value) return '시간 정보 없음'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '시간 정보 없음'
  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff)) return '시간 정보 없음'
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '방금 전'
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  const hh = `${date.getHours()}`.padStart(2, '0')
  const mm = `${date.getMinutes()}`.padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}`
}

function resolveErrorMessage(error) {
  if (!error) return '알 수 없는 오류가 발생했습니다.'
  if (typeof error === 'string') return error
  if (typeof error.message === 'string' && error.message.trim()) return error.message
  if (typeof error.details === 'string' && error.details.trim()) return error.details
  if (typeof error.hint === 'string' && error.hint.trim()) return error.hint
  return '알 수 없는 오류가 발생했습니다.'
}

export default function RoomDetailPage() {
  const router = useRouter()
  const roomParam = router.query.id
  const heroParamRaw = router.query.hero

  const roomId = useMemo(() => {
    if (Array.isArray(roomParam)) return roomParam[0] || ''
    return roomParam || ''
  }, [roomParam])

  const heroParam = useMemo(() => {
    if (Array.isArray(heroParamRaw)) return heroParamRaw[0] || ''
    return heroParamRaw || ''
  }, [heroParamRaw])

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const [room, setRoom] = useState(null)
  const [slots, setSlots] = useState([])
  const [lastLoadedAt, setLastLoadedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [joinPending, setJoinPending] = useState(false)
  const [leavePending, setLeavePending] = useState(false)
  const [deletePending, setDeletePending] = useState(false)

  const [viewer, setViewer] = useState({
    heroId: '',
    heroName: '',
    ownerId: null,
    userId: null,
    rating: null,
    role: '',
  })
  const [viewerLoading, setViewerLoading] = useState(true)
  const [activeSlotId, setActiveSlotId] = useState(null)
  const latestPresenceRef = useRef({
    activeSlotId: null,
    ownerId: null,
    isHost: false,
    roomId: null,
  })

  const occupancy = useMemo(() => {
    const total = slots.length
    const filled = slots.filter((slot) => !!slot.occupantOwnerId).length
    return { total, filled }
  }, [slots])

  const scoreWindowLabel = useMemo(() => {
    if (!room) return '정보 없음'
    if (!Number.isFinite(room.scoreWindow)) return '제한 없음'
    return `±${room.scoreWindow}`
  }, [room])

  const ratingDelta = useMemo(() => {
    if (!Number.isFinite(room?.hostRating) || !Number.isFinite(viewer.rating)) return null
    return viewer.rating - room.hostRating
  }, [room?.hostRating, viewer.rating])

  const absoluteDelta = useMemo(() => {
    if (ratingDelta === null) return null
    return Math.abs(ratingDelta)
  }, [ratingDelta])

  const isHost = useMemo(() => {
    if (!room?.ownerId || !viewer.ownerId) return false
    return room.ownerId === viewer.ownerId
  }, [room?.ownerId, viewer.ownerId])
  const loadViewerHero = useCallback(
    async (explicitHeroId) => {
      setViewerLoading(true)
      try {
        const selection = readHeroSelection()
        let storedHeroId = selection?.heroId || ''
        let storedOwnerId = selection?.ownerId || ''

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        let user = sessionData?.session?.user || null
        if (!user) {
          const { data: userData, error: userError } = await supabase.auth.getUser()
          if (userError) throw userError
          user = userData?.user || null
        }

        const viewerOwnerKey = user?.id ? String(user.id) : ''
        if (viewerOwnerKey) {
          persistHeroOwner(viewerOwnerKey)
        }

        if (viewerOwnerKey && storedOwnerId && storedOwnerId !== viewerOwnerKey) {
          clearHeroSelection()
          storedHeroId = ''
          storedOwnerId = ''
        }

        const heroCandidate = explicitHeroId || storedHeroId || null
        let profile = null
        if (user) {
          profile = await resolveViewerProfile(user, heroCandidate)
        }

        let resolvedHeroId = ''
        if (profile?.hero_id) {
          resolvedHeroId = profile.hero_id
        } else if (heroCandidate) {
          resolvedHeroId = heroCandidate
        }

        let resolvedHeroName = ''
        if (resolvedHeroId) {
          resolvedHeroName = profile?.name || '이름 없는 영웅'
          if (!profile?.name) {
            const heroResult = await withTable(supabase, 'heroes', (table) =>
              supabase.from(table).select('id, name').eq('id', resolvedHeroId).maybeSingle(),
            )
            if (!heroResult.error && heroResult.data?.name) {
              resolvedHeroName = heroResult.data.name.trim() || '이름 없는 영웅'
            }
          }
        }

        let resolvedOwnerId =
          profile?.owner_id || profile?.user_id || storedOwnerId || viewerOwnerKey || null

        if (viewerOwnerKey && resolvedOwnerId && resolvedOwnerId !== viewerOwnerKey) {
          clearHeroSelection()
          resolvedHeroId = ''
          resolvedHeroName = ''
          resolvedOwnerId = viewerOwnerKey
        }

        if (resolvedHeroId && resolvedOwnerId) {
          persistHeroSelection({ id: resolvedHeroId }, resolvedOwnerId)
        } else if (viewerOwnerKey) {
          persistHeroOwner(viewerOwnerKey)
        }

        if (mountedRef.current) {
          setViewer((prev) => ({
            ...prev,
            heroId: resolvedHeroId,
            heroName: resolvedHeroId ? resolvedHeroName || '이름 없는 영웅' : '',
            ownerId: resolvedOwnerId || viewerOwnerKey || null,
            userId: viewerOwnerKey || null,
            role: resolvedHeroId && resolvedHeroId === prev.heroId ? prev.role : '',
          }))
        }
      } catch (viewerError) {
        console.error('[RoomDetail] Failed to resolve viewer hero:', viewerError)
        if (mountedRef.current) {
          setViewer((prev) => ({
            ...prev,
            heroId: '',
            heroName: '',
            ownerId: prev.ownerId || null,
            role: '',
          }))
        }
      } finally {
        if (mountedRef.current) {
          setViewerLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    loadViewerHero(heroParam)
  }, [heroParam, loadViewerHero])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleStorage = (event) => {
      if (event.key && event.key !== HERO_ID_KEY && event.key !== HERO_OWNER_KEY) {
        return
      }
      loadViewerHero(heroParam)
    }
    const handleOverlayRefresh = () => loadViewerHero(heroParam)
    window.addEventListener('storage', handleStorage)
    window.addEventListener('hero-overlay:refresh', handleOverlayRefresh)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('hero-overlay:refresh', handleOverlayRefresh)
    }
  }, [heroParam, loadViewerHero])
  const loadRoom = useCallback(
    async (fromRefresh = false) => {
      if (!roomId) return
      if (fromRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError('')
      setActionError('')
      try {
        const roomResult = await withTable(supabase, 'rank_rooms', (table) =>
          supabase
            .from(table)
            .select(
              [
                'id',
                'game_id',
                'owner_id',
                'code',
                'mode',
                'status',
                'score_window',
                'created_at',
                'updated_at',
              ].join(','),
            )
            .eq('id', roomId)
            .maybeSingle(),
        )

        if (roomResult.error && roomResult.error.code !== 'PGRST116') {
          throw roomResult.error
        }

        const roomRow = roomResult.data
        if (!roomRow) {
          throw new Error('방 정보를 찾을 수 없습니다.')
        }

        const baseRoom = {
          id: roomRow.id,
          gameId: roomRow.game_id || '',
          ownerId: roomRow.owner_id || null,
          code: roomRow.code || '미지정',
          mode: roomRow.mode || '모드 미지정',
          status: roomRow.status || '상태 미지정',
          scoreWindow: Number.isFinite(Number(roomRow.score_window))
            ? Number(roomRow.score_window)
            : null,
          updatedAt: roomRow.updated_at || roomRow.created_at || null,
        }

        let gameName = '알 수 없는 게임'
        if (baseRoom.gameId) {
          const gameResult = await withTable(supabase, 'rank_games', (table) =>
            supabase.from(table).select('id, name').eq('id', baseRoom.gameId).maybeSingle(),
          )
          if (gameResult.error && gameResult.error.code !== 'PGRST116') {
            throw gameResult.error
          }
          if (gameResult.data?.name) {
            gameName = gameResult.data.name.trim() || gameName
          }
        }

        const slotResult = await withTable(supabase, 'rank_room_slots', (table) =>
          supabase
            .from(table)
            .select('id, slot_index, role, occupant_owner_id, occupant_hero_id, occupant_ready, joined_at')
            .eq('room_id', roomId)
            .order('slot_index', { ascending: true }),
        )

        let slotRows = []
        if (slotResult.error && slotResult.error.code !== 'PGRST116') {
          console.warn('[RoomDetail] Failed to load slots:', slotResult.error)
        } else {
          slotRows = Array.isArray(slotResult.data) ? slotResult.data : []
        }

        let activeIndexes = null
        if (baseRoom.gameId) {
          const templateResult = await withTable(supabase, 'rank_game_slots', (table) =>
            supabase
              .from(table)
              .select('slot_index, active')
              .eq('game_id', baseRoom.gameId)
              .order('slot_index', { ascending: true }),
          )

          const templates =
            templateResult.error && templateResult.error.code !== 'PGRST116'
              ? []
              : Array.isArray(templateResult.data)
              ? templateResult.data
              : []

          if (templateResult.error && templateResult.error.code !== 'PGRST116') {
            console.warn('[RoomDetail] Failed to load game slot template:', templateResult.error)
          }
          activeIndexes = new Set(
            templates
              .filter((template) => template?.active ?? true)
              .map((template) => template.slot_index),
          )
        }

        const filteredSlots =
          activeIndexes && activeIndexes.size
            ? slotRows.filter((row) => activeIndexes.has(row.slot_index))
            : slotRows

        const heroIds = filteredSlots
          .map((row) => row?.occupant_hero_id)
          .filter(
            (value, index, self) =>
              typeof value === 'string' && value && self.indexOf(value) === index,
          )

        let heroMap = new Map()
        if (heroIds.length) {
          const heroResult = await withTable(supabase, 'heroes', (table) =>
            supabase.from(table).select('id, name').in('id', heroIds),
          )
          if (heroResult.error && heroResult.error.code !== 'PGRST116') {
            console.warn('[RoomDetail] Failed to load hero names:', heroResult.error)
          } else {
            const heroRows = Array.isArray(heroResult.data) ? heroResult.data : []
            heroMap = new Map(heroRows.map((row) => [row.id, row]))
          }
        }

        let hostRating = null
        if (baseRoom.ownerId && baseRoom.gameId) {
          const hostResult = await withTable(supabase, 'rank_participants', (table) =>
            supabase
              .from(table)
              .select('rating')
              .eq('game_id', baseRoom.gameId)
              .eq('owner_id', baseRoom.ownerId)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          )
          if (hostResult.error && hostResult.error.code !== 'PGRST116') {
            console.warn('[RoomDetail] Failed to load host rating:', hostResult.error)
          } else {
            const ratingValue = Number(hostResult.data?.rating)
            if (Number.isFinite(ratingValue)) {
              hostRating = ratingValue
            }
          }
        }

        const normalizedSlots = filteredSlots
          .map((row) => {
            const roleName = row?.role?.trim?.() || '역할 미지정'
            const occupantHeroId = row?.occupant_hero_id || null
            const heroRow = occupantHeroId ? heroMap.get(occupantHeroId) : null
            return {
              id: row.id,
              slotIndex: Number(row.slot_index) || 0,
              role: roleName,
              occupantOwnerId: row?.occupant_owner_id || null,
              occupantHeroId,
              occupantHeroName:
                heroRow?.name?.trim?.() || (occupantHeroId ? '이름 없는 영웅' : '비어 있음'),
              occupantReady: !!row?.occupant_ready,
              joinedAt: row?.joined_at || null,
            }
          })
          .sort((a, b) => a.slotIndex - b.slotIndex)

        if (!mountedRef.current) return

        setRoom({ ...baseRoom, gameName, hostRating })
        setSlots(normalizedSlots)
        setLastLoadedAt(new Date())
      } catch (loadError) {
        console.error('[RoomDetail] Failed to load room:', loadError)
        if (mountedRef.current) {
          setError(resolveErrorMessage(loadError))
        }
      } finally {
        if (!mountedRef.current) return
        if (!fromRefresh) {
          setLoading(false)
        }
        setRefreshing(false)
      }
    },
    [roomId],
  )

  useEffect(() => {
    if (!roomId) return
    loadRoom(false)
  }, [roomId, loadRoom])

  useEffect(() => {
    const nextActive = viewer.ownerId
      ? slots.find((slot) => slot.occupantOwnerId === viewer.ownerId)?.id || null
      : null
    setActiveSlotId((prev) => (prev === nextActive ? prev : nextActive))
  }, [slots, viewer.ownerId])

  useEffect(() => {
    if (!room?.gameId || !viewer.ownerId) {
      setViewer((prev) => ({ ...prev, rating: null, role: '' }))
      return
    }

    let cancelled = false

    const loadRating = async () => {
      try {
        const ratingResult = await withTable(supabase, 'rank_participants', (table) =>
          supabase
            .from(table)
            .select('rating, role')
            .eq('game_id', room.gameId)
            .eq('owner_id', viewer.ownerId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        )
        if (ratingResult.error && ratingResult.error.code !== 'PGRST116') {
          throw ratingResult.error
        }
        const ratingValue = Number(ratingResult.data?.rating)
        const roleValue =
          typeof ratingResult.data?.role === 'string' ? ratingResult.data.role.trim() : ''
        if (!cancelled && mountedRef.current) {
          setViewer((prev) => ({
            ...prev,
            rating: Number.isFinite(ratingValue) ? ratingValue : null,
            role: roleValue,
          }))
        }
      } catch (ratingError) {
        console.error('[RoomDetail] Failed to load viewer rating:', ratingError)
        if (!cancelled && mountedRef.current) {
          setViewer((prev) => ({ ...prev, rating: null, role: '' }))
        }
      }
    }

    loadRating()

    return () => {
      cancelled = true
    }
  }, [room?.gameId, viewer.ownerId])
  const leaveRoom = useCallback(
    async ({ silent = false, skipReload = false } = {}) => {
      if (!viewer.ownerId || !activeSlotId) return
      if (!silent) {
        setLeavePending(true)
        setActionError('')
      }
      try {
        const leaveResult = await withTable(supabase, 'rank_room_slots', (table) =>
          supabase
            .from(table)
            .update({
              occupant_owner_id: null,
              occupant_hero_id: null,
              occupant_ready: false,
              joined_at: null,
            })
            .eq('id', activeSlotId)
            .eq('occupant_owner_id', viewer.ownerId),
        )
        if (leaveResult.error && leaveResult.error.code !== 'PGRST116') {
          throw leaveResult.error
        }
        if (!skipReload) {
          await loadRoom(true)
        }
        if (mountedRef.current) {
          setActiveSlotId((prev) => (prev === activeSlotId ? null : prev))
        }
      } catch (leaveError) {
        if (!silent) {
          console.error('[RoomDetail] Failed to leave room:', leaveError)
          if (mountedRef.current) {
            setActionError(resolveErrorMessage(leaveError))
          }
        }
      } finally {
        if (!silent && mountedRef.current) {
          setLeavePending(false)
        }
      }
    },
    [activeSlotId, loadRoom, viewer.ownerId],
  )

  const leaveRoomRef = useRef(leaveRoom)
  useEffect(() => {
    leaveRoomRef.current = leaveRoom
  }, [leaveRoom])

  const cancelHostCleanup = useCallback(() => {
    if (hostCleanupState.timerId) {
      clearTimeout(hostCleanupState.timerId)
      hostCleanupState.timerId = null
      hostCleanupState.roomId = null
    }
  }, [])

  const deleteRoom = useCallback(
    async ({ silent = false, skipNavigate = false } = {}) => {
      if (!room?.id || !isHost) return
      cancelHostCleanup()
      if (!silent) {
        setDeletePending(true)
        setActionError('')
      }
      try {
        const deleteResult = await withTable(supabase, 'rank_rooms', (table) =>
          supabase.from(table).delete().eq('id', room.id),
        )
        if (deleteResult.error && deleteResult.error.code !== 'PGRST116') {
          throw deleteResult.error
        }
        if (!skipNavigate) {
          router.replace('/rooms')
        }
      } catch (deleteError) {
        if (!silent) {
          console.error('[RoomDetail] Failed to delete room:', deleteError)
          if (mountedRef.current) {
            setActionError(resolveErrorMessage(deleteError))
          }
        }
      } finally {
        if (!silent && mountedRef.current) {
          setDeletePending(false)
        }
      }
    },
    [cancelHostCleanup, isHost, room?.id, router],
  )

  const requestHostCleanup = useCallback(() => {
    if (!isHost || !room?.id) return
    if (typeof window === 'undefined') {
      deleteRoom({ silent: true, skipNavigate: true })
      return
    }
    cancelHostCleanup()
    hostCleanupState.roomId = room.id
    hostCleanupState.timerId = window.setTimeout(() => {
      cancelHostCleanup()
      deleteRoom({ silent: true, skipNavigate: true })
    }, HOST_CLEANUP_DELAY_MS)
  }, [cancelHostCleanup, deleteRoom, isHost, room?.id])

  const requestHostCleanupRef = useRef(requestHostCleanup)
  useEffect(() => {
    requestHostCleanupRef.current = requestHostCleanup
  }, [requestHostCleanup])

  useEffect(() => {
    latestPresenceRef.current = {
      activeSlotId,
      ownerId: viewer.ownerId,
      isHost,
      roomId: room?.id ?? null,
    }
  }, [activeSlotId, isHost, room?.id, viewer.ownerId])

  const handleJoin = useCallback(async () => {
    if (!roomId) return
    if (!viewer.ownerId) {
      setActionError('로그인이 필요합니다.')
      return
    }
    if (!viewer.heroId) {
      setActionError('참여할 캐릭터를 먼저 선택해 주세요.')
      return
    }
    const normalizedViewerRole = normalizeRole(viewer.role)
    if (!normalizedViewerRole) {
      setActionError('이 캐릭터의 역할 정보를 불러오지 못했습니다. 다시 시도해 주세요.')
      return
    }
    const availableSlots = slots.filter((slot) => !slot.occupantOwnerId)
    if (!availableSlots.length) {
      setActionError('비어 있는 슬롯이 없습니다.')
      return
    }
    const exactMatch = availableSlots.find(
      (slot) => normalizeRole(slot.role) === normalizedViewerRole,
    )
    const flexibleMatch = availableSlots.find((slot) => isFlexibleRole(slot.role))
    const targetSlot = exactMatch || flexibleMatch
    if (!targetSlot) {
      setActionError('이 역할에 맞는 빈 슬롯이 없습니다.')
      return
    }
    setJoinPending(true)
    setActionError('')
    try {
      const joinResult = await withTable(supabase, 'rank_room_slots', (table) =>
        supabase
          .from(table)
          .update({
            occupant_owner_id: viewer.ownerId,
            occupant_hero_id: viewer.heroId,
            occupant_ready: false,
            joined_at: new Date().toISOString(),
          })
          .eq('id', targetSlot.id)
          .is('occupant_owner_id', null)
          .select('id')
          .maybeSingle(),
      )
      if (joinResult.error && joinResult.error.code !== 'PGRST116') {
        throw joinResult.error
      }
      await loadRoom(true)
    } catch (joinError) {
      console.error('[RoomDetail] Failed to join room:', joinError)
      if (mountedRef.current) {
        setActionError(resolveErrorMessage(joinError))
      }
    } finally {
      if (mountedRef.current) {
        setJoinPending(false)
      }
    }
  }, [loadRoom, roomId, slots, viewer.heroId, viewer.ownerId, viewer.role])

  const handleRefresh = useCallback(() => {
    loadRoom(true)
  }, [loadRoom])

  useEffect(() => {
    return () => {
      const { activeSlotId: latestSlotId, ownerId, isHost: latestIsHost, roomId } =
        latestPresenceRef.current
      if (latestSlotId && ownerId) {
        leaveRoomRef.current({ silent: true, skipReload: true })
      }
      if (latestIsHost && roomId) {
        requestHostCleanupRef.current()
      }
    }
  }, [])

  useEffect(() => {
    const handleRouteChange = () => {
      const { activeSlotId: latestSlotId, ownerId, isHost: latestIsHost, roomId } =
        latestPresenceRef.current
      if (latestSlotId && ownerId) {
        leaveRoomRef.current({ silent: true, skipReload: true })
      }
      if (latestIsHost && roomId) {
        requestHostCleanupRef.current()
      }
    }
    router.events.on('routeChangeStart', handleRouteChange)
    return () => {
      router.events.off('routeChangeStart', handleRouteChange)
    }
  }, [router.events])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleBeforeUnload = () => {
      const { activeSlotId: latestSlotId, ownerId, isHost: latestIsHost, roomId } =
        latestPresenceRef.current
      if (latestSlotId && ownerId) {
        leaveRoomRef.current({ silent: true, skipReload: true })
      }
      if (latestIsHost && roomId) {
        requestHostCleanupRef.current()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    if (isHost && room?.id) {
      cancelHostCleanup()
    }
  }, [cancelHostCleanup, isHost, room?.id])

  const joined = !!activeSlotId
  const hostRatingText = Number.isFinite(room?.hostRating)
    ? `${room.hostRating}점`
    : '정보 없음'

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.titleRow}>
            <div style={styles.titleBlock}>
              <h1 style={styles.title}>{room?.gameName || '방 세부 정보'}</h1>
              <p style={styles.subtitle}>
                {room
                  ? `${room.mode} · 코드 ${room.code} · ${formatRelativeTime(room.updatedAt)} 업데이트`
                  : '방 정보를 불러오는 중입니다.'}
              </p>
            </div>
            <Link href="/rooms" style={styles.backLink} prefetch>
              방 목록으로
            </Link>
          </div>
          <div style={styles.metaRow}>
            <span>상태: {room?.status || '알 수 없음'}</span>
            <span>방장 점수: {hostRatingText}</span>
            <span>허용 범위: {scoreWindowLabel}</span>
            <span>
              인원: {occupancy.filled}/{occupancy.total}
            </span>
            {Number.isFinite(viewer.rating) ? <span>내 점수: {viewer.rating}점</span> : null}
            {absoluteDelta !== null ? (
              <span>
                방장과 차이: {ratingDelta >= 0 ? '+' : '-'}
                {absoluteDelta}
              </span>
            ) : null}
            {lastLoadedAt ? <span>새로고침: {formatRelativeTime(lastLoadedAt)}</span> : null}
          </div>
          <div style={styles.heroSummary}>
            {viewerLoading ? (
              <span>캐릭터 정보를 불러오는 중...</span>
            ) : viewer.heroId ? (
              <span>
                선택 캐릭터: <strong>{viewer.heroName || '이름 없는 영웅'}</strong>
                {normalizeRole(viewer.role) ? (
                  <>
                    {' '}
                    <em style={{ color: '#facc15' }}>({viewer.role})</em>
                  </>
                ) : null}
              </span>
            ) : (
              <span>선택된 캐릭터가 없습니다. 캐릭터를 선택하면 참여할 수 있습니다.</span>
            )}
            {room?.gameName ? <span>게임: {room.gameName}</span> : null}
          </div>
          <div style={styles.actionsRow}>
            <button
              type="button"
              onClick={handleRefresh}
              style={styles.secondaryButton(refreshing)}
              disabled={refreshing}
            >
              {refreshing ? '새로고침 중...' : '정보 새로고침'}
            </button>
            {joined ? (
              <button
                type="button"
                onClick={() => leaveRoom()}
                style={styles.secondaryButton(leavePending)}
                disabled={leavePending}
              >
                {leavePending ? '나가는 중...' : '방 나가기'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleJoin}
                style={styles.primaryButton(
                  joinPending ||
                    !viewer.heroId ||
                    !viewer.ownerId ||
                    !normalizeRole(viewer.role),
                )}
                disabled={
                  joinPending || !viewer.heroId || !viewer.ownerId || !normalizeRole(viewer.role)
                }
              >
                {joinPending ? '참여 중...' : '빈 슬롯 참여'}
              </button>
            )}
            {isHost ? (
              <button
                type="button"
                onClick={() => deleteRoom()}
                style={styles.dangerButton(deletePending)}
                disabled={deletePending}
              >
                {deletePending ? '방 삭제 중...' : '방 닫기'}
              </button>
            ) : null}
          </div>
          {actionError ? <p style={styles.infoText}>{actionError}</p> : null}
        </header>

        {loading ? (
          <div style={styles.loadingState}>방 정보를 불러오는 중입니다...</div>
        ) : error ? (
          <section style={styles.errorCard}>
            <h2 style={styles.errorTitle}>방 정보를 불러오지 못했습니다.</h2>
            <p style={styles.errorText}>{error}</p>
            <button type="button" onClick={handleRefresh} style={styles.retryButton}>
              다시 시도
            </button>
          </section>
        ) : (
          <section style={styles.slotSection}>
            <h2 style={styles.sectionTitle}>슬롯 현황</h2>
            {slots.length === 0 ? (
              <div style={styles.emptyState}>활성화된 슬롯이 없습니다.</div>
            ) : (
              <div style={styles.slotGrid}>
                {slots.map((slot) => {
                  const isViewerSlot = viewer.ownerId && slot.occupantOwnerId === viewer.ownerId
                  const isHostSlot = room?.ownerId && slot.occupantOwnerId === room.ownerId
                  return (
                    <div key={slot.id || `${slot.slotIndex}`} style={styles.slotCard(isViewerSlot)}>
                      <div style={styles.slotHeader}>
                        <span style={styles.slotRole}>{slot.role}</span>
                        <span style={styles.slotIndex}>#{slot.slotIndex + 1}</span>
                      </div>
                      <p style={styles.slotBody}>
                        {slot.occupantOwnerId ? (
                          <>
                            <strong>{slot.occupantHeroName}</strong>
                            <br />
                            {slot.occupantReady ? '준비 완료' : '준비 대기'}
                          </>
                        ) : (
                          <>비어 있는 자리</>
                        )}
                      </p>
                      <div style={styles.slotTags}>
                        {isViewerSlot ? <span style={styles.slotTag}>내 자리</span> : null}
                        {isHostSlot ? <span style={styles.slotTag}>방장</span> : null}
                        {slot.occupantOwnerId && !slot.occupantReady ? (
                          <span style={styles.slotTag}>준비 중</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
