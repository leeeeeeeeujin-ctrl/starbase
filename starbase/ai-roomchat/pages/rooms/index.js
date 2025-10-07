import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'
import { resolveViewerProfile } from '@/lib/heroes/resolveViewerProfile'
import { withTable } from '@/lib/supabaseTables'
import { fetchHeroParticipationBundle } from '@/modules/character/participation'

const MODE_TABS = [
  { key: 'rank', label: '랭크' },
  { key: 'casual', label: '캐주얼' },
]

const SCORE_WINDOWS = [
  { key: 'off', label: '점수 제한 없음', value: null },
  { key: '80', label: '±80', value: 80 },
  { key: '120', label: '±120', value: 120 },
  { key: '160', label: '±160', value: 160 },
  { key: '200', label: '±200', value: 200 },
]

const RANK_SCORE_WINDOWS = SCORE_WINDOWS.filter((option) => option.value !== null)
const DEFAULT_RANK_SCORE_WINDOW = RANK_SCORE_WINDOWS[0]?.value ?? 80

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
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
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
    gap: 8,
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 1.6,
  },
  createButton: (disabled) => ({
    padding: '12px 18px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: disabled ? 'rgba(30, 41, 59, 0.55)' : 'rgba(59, 130, 246, 0.85)',
    color: disabled ? '#94a3b8' : '#f8fafc',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
  }),
  helperRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 13,
  },
  helperLink: {
    color: '#38bdf8',
    fontWeight: 600,
    textDecoration: 'none',
  },
  filterCard: {
    background: 'rgba(15, 23, 42, 0.78)',
    border: '1px solid rgba(148, 163, 184, 0.28)',
    borderRadius: 20,
    padding: '20px 22px',
    display: 'grid',
    gap: 18,
  },
  modeTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeTab: (active) => ({
    padding: '8px 16px',
    borderRadius: 12,
    border: active ? '1px solid rgba(96, 165, 250, 0.55)' : '1px solid rgba(148, 163, 184, 0.35)',
    background: active ? 'rgba(37, 99, 235, 0.35)' : 'rgba(15, 23, 42, 0.6)',
    color: active ? '#bfdbfe' : '#cbd5f5',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
  }),
  gameFilters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  gameFilterButton: (active) => ({
    padding: '8px 14px',
    borderRadius: 10,
    border: active ? '1px solid rgba(45, 212, 191, 0.6)' : '1px solid rgba(148, 163, 184, 0.32)',
    background: active ? 'rgba(16, 185, 129, 0.22)' : 'rgba(15, 23, 42, 0.5)',
    color: active ? '#99f6e4' : '#cbd5f5',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
  scoreWindowRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  scoreButton: (active) => ({
    padding: '8px 14px',
    borderRadius: 999,
    border: active ? '1px solid rgba(59, 130, 246, 0.6)' : '1px solid rgba(148, 163, 184, 0.3)',
    background: active ? 'rgba(59, 130, 246, 0.2)' : 'rgba(15, 23, 42, 0.45)',
    color: active ? '#bfdbfe' : '#cbd5f5',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
  }),
  filtersLabel: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  filterHint: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  roomsCard: {
    background: 'rgba(15, 23, 42, 0.78)',
    border: '1px solid rgba(148, 163, 184, 0.28)',
    borderRadius: 22,
    padding: '20px 22px',
    display: 'grid',
    gap: 18,
  },
  roomGrid: {
    display: 'grid',
    gap: 16,
  },
  roomCard: {
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background: 'rgba(15, 23, 42, 0.65)',
    padding: '18px 20px',
    display: 'grid',
    gap: 12,
  },
  roomHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  roomTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  roomMeta: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  roomRoles: {
    display: 'grid',
    gap: 6,
    fontSize: 13,
    color: '#cbd5f5',
  },
  roomFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    fontSize: 12,
    color: '#94a3b8',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#94a3b8',
  },
  loadingState: {
    textAlign: 'center',
    padding: '80px 20px',
    color: '#94a3b8',
    fontSize: 15,
  },
  errorCard: {
    background: 'rgba(248, 113, 113, 0.12)',
    border: '1px solid rgba(248, 113, 113, 0.35)',
    borderRadius: 18,
    padding: '18px 20px',
    display: 'grid',
    gap: 12,
    color: '#fecaca',
  },
  errorTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
  },
  errorText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
  },
  retryButton: {
    justifySelf: 'flex-start',
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid rgba(248, 113, 113, 0.55)',
    background: 'rgba(127, 29, 29, 0.6)',
    color: '#fff1f2',
    fontWeight: 600,
    cursor: 'pointer',
  },
  roomCode: {
    fontSize: 12,
    fontWeight: 700,
    color: '#38bdf8',
  },
  ratingBadge: {
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.22)',
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: 700,
  },
  heroSummary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    fontSize: 12,
    color: '#94a3b8',
  },
  refreshButton: (disabled) => ({
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: disabled ? 'rgba(30, 41, 59, 0.55)' : 'rgba(30, 41, 59, 0.85)',
    color: disabled ? '#94a3b8' : '#f8fafc',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
  }),
  createPanel: {
    background: 'rgba(15, 23, 42, 0.78)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 18,
    padding: '18px 20px',
    display: 'grid',
    gap: 14,
  },
  formRow: {
    display: 'grid',
    gap: 8,
  },
  select: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.62)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  submitButton: (disabled) => ({
    padding: '10px 18px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: disabled ? 'rgba(30, 41, 59, 0.55)' : 'rgba(34, 197, 94, 0.7)',
    color: disabled ? '#94a3b8' : '#f0fdf4',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  createError: {
    margin: 0,
    fontSize: 13,
    color: '#fca5a5',
  },
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

function generateRoomCode(existing = []) {
  const used = new Set(existing.map((value) => value?.toUpperCase?.() ?? ''))
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 64; attempt += 1) {
    let code = ''
    for (let i = 0; i < 6; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    if (!used.has(code)) {
      return code
    }
  }
  return `ROOM-${Date.now().toString(36).toUpperCase()}`
}

export default function RoomBrowserPage() {
  const router = useRouter()
  const heroQuery = router.query.hero
  const gameQuery = router.query.game

  const heroId = useMemo(() => {
    if (Array.isArray(heroQuery)) return heroQuery[0] || ''
    return heroQuery || ''
  }, [heroQuery])

  const initialGameId = useMemo(() => {
    if (Array.isArray(gameQuery)) return gameQuery[0] || 'all'
    return gameQuery || 'all'
  }, [gameQuery])

  const mountedRef = useRef(true)

  const [storedHeroId, setStoredHeroId] = useState('')
  const [viewerHeroProfile, setViewerHeroProfile] = useState(null)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState(null)

  const [modeTab, setModeTab] = useState('rank')
  const [participations, setParticipations] = useState([])
  const [selectedGameId, setSelectedGameId] = useState('all')
  const [scoreWindow, setScoreWindow] = useState(null)
  const [heroSummary, setHeroSummary] = useState({ heroName: '', ownerId: null })
  const [heroRatings, setHeroRatings] = useState({})
  const [heroLoading, setHeroLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createState, setCreateState] = useState({
    mode: 'rank',
    gameId: '',
    scoreWindow: DEFAULT_RANK_SCORE_WINDOW,
  })
  const [createPending, setCreatePending] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (createState.mode !== 'rank') return
    if (
      createState.scoreWindow === null ||
      !RANK_SCORE_WINDOWS.some((option) => option.value === createState.scoreWindow)
    ) {
      const fallback = DEFAULT_RANK_SCORE_WINDOW
      setCreateState((prev) => {
        if (prev.mode !== 'rank') return prev
        if (prev.scoreWindow === fallback) return prev
        return { ...prev, scoreWindow: fallback }
      })
    }
  }, [createState.mode, createState.scoreWindow])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncStoredHero = () => {
      try {
        const savedHeroId = window.localStorage.getItem('selectedHeroId') || ''
        setStoredHeroId((prev) => {
          if (prev === savedHeroId) return prev
          return savedHeroId
        })
        if (!savedHeroId) {
          setViewerHeroProfile((prev) => {
            if (!prev) return prev
            return null
          })
        }
      } catch (storageError) {
        console.error('[RoomBrowser] Failed to read stored hero id:', storageError)
      }
    }

    syncStoredHero()

    const handleStorage = (event) => {
      if (!event) return
      if (event.key && event.key !== 'selectedHeroId' && event.key !== 'selectedHeroOwnerId') {
        return
      }
      syncStoredHero()
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('hero-overlay:refresh', syncStoredHero)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('hero-overlay:refresh', syncStoredHero)
    }
  }, [])

  const resolvedHeroId = viewerHeroProfile?.hero_id || ''
  const effectiveHeroId = heroId || storedHeroId || resolvedHeroId

  const viewerHeroSeed = useMemo(() => {
    if (!viewerHeroProfile?.hero_id) return null
    return {
      id: viewerHeroProfile.hero_id,
      name: viewerHeroProfile.name || '이름 없는 영웅',
      owner_id: viewerHeroProfile.owner_id || viewerHeroProfile.user_id || null,
    }
  }, [viewerHeroProfile?.hero_id, viewerHeroProfile?.name, viewerHeroProfile?.owner_id, viewerHeroProfile?.user_id])

  const resolvingViewerHeroRef = useRef(false)

  useEffect(() => {
    if (heroId || storedHeroId || viewerHeroProfile?.hero_id) {
      return
    }
    if (resolvingViewerHeroRef.current) return

    let cancelled = false
    resolvingViewerHeroRef.current = true

    const resolveHeroProfile = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        let user = sessionData?.session?.user || null
        if (!user) {
          const { data: userData, error: userError } = await supabase.auth.getUser()
          if (userError) throw userError
          user = userData?.user || null
        }

        if (!user) {
          if (!cancelled && mountedRef.current) {
            setViewerHeroProfile(null)
          }
          return
        }

        const profile = await resolveViewerProfile(user, null)
        if (!cancelled && mountedRef.current) {
          if (profile?.hero_id) {
            setViewerHeroProfile(profile)
            setStoredHeroId((prev) => (prev ? prev : profile.hero_id))
          } else {
            setViewerHeroProfile(null)
          }
        }
      } catch (profileError) {
        console.error('[RoomBrowser] Failed to resolve viewer hero profile:', profileError)
        if (!cancelled && mountedRef.current) {
          setViewerHeroProfile(null)
        }
      } finally {
        resolvingViewerHeroRef.current = false
      }
    }

    resolveHeroProfile()

    return () => {
      cancelled = true
    }
  }, [heroId, storedHeroId, viewerHeroProfile?.hero_id])

  const loadHeroContext = useCallback(async (targetHeroId) => {
    const normalizedHeroId = typeof targetHeroId === 'string' ? targetHeroId.trim() : ''

    if (!normalizedHeroId) {
      setHeroSummary({ heroName: '', ownerId: null })
      setParticipations([])
      setHeroRatings({})
      setSelectedGameId('all')
      setCreateState((prev) => ({ ...prev, gameId: '' }))
      return
    }

    setHeroLoading(true)
    const fallbackSeed =
      viewerHeroSeed?.id === normalizedHeroId
        ? {
            id: viewerHeroSeed.id,
            name: viewerHeroSeed.name || '이름 없는 영웅',
            owner_id: viewerHeroSeed.owner_id || null,
          }
        : null

    try {
      const { data: heroRow, error: heroError } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select('id, name, owner_id')
          .eq('id', normalizedHeroId)
          .maybeSingle(),
      )

      if (heroError && heroError.code !== 'PGRST116') {
        throw heroError
      }

      const heroName =
        heroRow?.name?.trim?.() || fallbackSeed?.name || viewerHeroProfile?.name || '이름 없는 영웅'
      const ownerId =
        heroRow?.owner_id ?? fallbackSeed?.owner_id ?? viewerHeroProfile?.owner_id ?? viewerHeroProfile?.user_id ?? null

      const bundle = await fetchHeroParticipationBundle(normalizedHeroId, {
        heroSeed: heroRow
          ? {
              id: heroRow.id,
              name: heroName,
              owner_id: ownerId,
            }
          : fallbackSeed || undefined,
      })

      if (!mountedRef.current) return

      const participationsList = Array.isArray(bundle?.participations) ? bundle.participations : []
      const hydratedParticipations = participationsList.map((entry) => {
        const existingGame = entry?.game
        const existingId = existingGame?.id
        const fallbackId = entry?.game_id || null

        if (existingId) {
          const normalisedName = existingGame?.name?.trim?.() || '이름 없는 게임'
          return {
            ...entry,
            game: {
              ...existingGame,
              id: existingId,
              name: normalisedName,
            },
          }
        }

        if (!fallbackId) {
          return entry
        }

        return {
          ...entry,
          game: {
            id: fallbackId,
            name: '이름 없는 게임',
            cover_path: null,
            description: '',
            owner_id: null,
            created_at: null,
            image_url: null,
          },
        }
      })
      const gameEntries = []
      const seenGameIds = new Set()

      hydratedParticipations.forEach((entry) => {
        const gameId = entry?.game?.id
        if (!gameId || seenGameIds.has(gameId)) return
        seenGameIds.add(gameId)
        gameEntries.push(entry)
      })

      let rankParticipantGames = []
      const { data: participantGamesRows, error: participantGamesError } = await withTable(
        supabase,
        'rank_participants',
        (table) =>
          supabase
            .from(table)
            .select('game_id')
            .eq('hero_id', normalizedHeroId),
      )

      if (participantGamesError && participantGamesError.code !== 'PGRST116') {
        throw participantGamesError
      }

      if (Array.isArray(participantGamesRows)) {
        rankParticipantGames = participantGamesRows
          .map((row) => row?.game_id)
          .filter((gameId) => typeof gameId === 'string' && gameId.trim() !== '')
      }

      const missingGameIds = Array.from(new Set(rankParticipantGames)).filter(
        (gameId) => !seenGameIds.has(gameId),
      )

      if (missingGameIds.length) {
        const { data: fallbackGameRows, error: fallbackGameError } = await withTable(
          supabase,
          'rank_games',
          (table) =>
            supabase
              .from(table)
              .select('id, name, cover_path, description, owner_id, created_at, image_url')
              .in('id', missingGameIds),
        )

        if (fallbackGameError && fallbackGameError.code !== 'PGRST116') {
          throw fallbackGameError
        }

        const fallbackGameMap = new Map(
          (Array.isArray(fallbackGameRows) ? fallbackGameRows : [])
            .filter((row) => row?.id)
            .map((row) => [
              row.id,
              {
                id: row.id,
                name: row.name?.trim?.() || '이름 없는 게임',
                cover_path: row.cover_path || null,
                description: row.description || '',
                owner_id: row.owner_id || null,
                created_at: row.created_at || null,
                image_url: row.cover_path || row.image_url || null,
              },
            ]),
        )

        missingGameIds.forEach((gameId) => {
          if (seenGameIds.has(gameId)) return

          const fallbackGame =
            fallbackGameMap.get(gameId) ||
            {
              id: gameId,
              name: '이름 없는 게임',
              cover_path: null,
              description: '',
              owner_id: null,
              created_at: null,
              image_url: null,
            }

          gameEntries.push({
            id: `rank-participant:${gameId}`,
            game_id: gameId,
            hero_id: normalizedHeroId,
            slot_no: null,
            role: '',
            sessionCount: null,
            latestSessionAt: null,
            firstSessionAt: null,
            primaryMode: null,
            game: fallbackGame,
          })
          seenGameIds.add(gameId)
        })
      }

      const uniqueGames = gameEntries

      setHeroSummary({ heroName, ownerId })
      setParticipations(uniqueGames)

      const defaultGame = uniqueGames.find((entry) => entry.game?.id === initialGameId)
        ? initialGameId
        : uniqueGames[0]?.game?.id || 'all'

      setSelectedGameId(defaultGame || 'all')
      setCreateState((prev) => ({ ...prev, gameId: defaultGame || '' }))

      if (ownerId && uniqueGames.length) {
        const gameIds = uniqueGames.map((entry) => entry.game.id)
        const { data: ratingRows, error: ratingError } = await withTable(
          supabase,
          'rank_participants',
          (table) =>
            supabase
              .from(table)
              .select('game_id, rating')
              .eq('owner_id', ownerId)
              .in('game_id', gameIds),
        )

        if (ratingError && ratingError.code !== 'PGRST116') {
          throw ratingError
        }

        const ratingMap = {}
        if (Array.isArray(ratingRows)) {
          ratingRows.forEach((row) => {
            if (!row?.game_id) return
            if (!Number.isFinite(Number(row.rating))) return
            ratingMap[row.game_id] = Number(row.rating)
          })
        }

        if (mountedRef.current) {
          setHeroRatings(ratingMap)
        }
      } else {
        setHeroRatings({})
      }
    } catch (heroLoadError) {
      console.error('[RoomBrowser] Failed to load hero context:', heroLoadError)
      if (mountedRef.current) {
        const fallbackName = fallbackSeed?.name || viewerHeroProfile?.name || ''
        const fallbackOwner =
          fallbackSeed?.owner_id ?? viewerHeroProfile?.owner_id ?? viewerHeroProfile?.user_id ?? null
        setHeroSummary({ heroName: fallbackName, ownerId: fallbackOwner })
        setParticipations([])
        setHeroRatings({})
      }
    } finally {
      if (mountedRef.current) {
        setHeroLoading(false)
      }
    }
  }, [initialGameId, viewerHeroProfile?.name, viewerHeroProfile?.owner_id, viewerHeroProfile?.user_id, viewerHeroSeed?.id, viewerHeroSeed?.name, viewerHeroSeed?.owner_id])

  useEffect(() => {
    loadHeroContext(effectiveHeroId)
  }, [effectiveHeroId, loadHeroContext])

  const loadRooms = useCallback(
    async (fromRefresh = false) => {
      if (!mountedRef.current) return
      if (fromRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError('')

      try {
        const roomsResult = await withTable(supabase, 'rank_rooms', (table) =>
          supabase
            .from(table)
            .select(
              [
                'id',
                'game_id',
                'code',
                'mode',
                'status',
                'slot_count',
                'filled_count',
                'ready_count',
                'created_at',
                'updated_at',
              ].join(','),
            )
            .order('updated_at', { ascending: false })
            .limit(120),
        )

        if (roomsResult.error && roomsResult.error.code !== 'PGRST116') {
          throw roomsResult.error
        }

        const roomRows = Array.isArray(roomsResult.data) ? roomsResult.data : []
        const roomIds = roomRows.map((row) => row.id).filter(Boolean)

        let slotRows = []
        if (roomIds.length) {
          const slotResult = await withTable(supabase, 'rank_room_slots', (table) =>
            supabase
              .from(table)
              .select('room_id, role, occupant_owner_id, occupant_ready')
              .in('room_id', roomIds),
          )

          if (slotResult.error && slotResult.error.code !== 'PGRST116') {
            throw slotResult.error
          }

          slotRows = Array.isArray(slotResult.data) ? slotResult.data : []
        }

        const slotMap = new Map()
        const occupantOwners = new Set()
        slotRows.forEach((row) => {
          const roomId = row?.room_id
          if (!roomId) return
          if (!slotMap.has(roomId)) {
            slotMap.set(roomId, [])
          }
          slotMap.get(roomId).push({
            role: typeof row?.role === 'string' ? row.role : '',
            ownerId: row?.occupant_owner_id || null,
            ready: !!row?.occupant_ready,
          })
          if (row?.occupant_owner_id) {
            occupantOwners.add(row.occupant_owner_id)
          }
        })

        const gameIds = Array.from(new Set(roomRows.map((row) => row.game_id).filter(Boolean)))
        let gameMap = new Map()
        if (gameIds.length) {
          const gamesResult = await withTable(supabase, 'rank_games', (table) =>
            supabase.from(table).select('id, name').in('id', gameIds),
          )

          if (gamesResult.error && gamesResult.error.code !== 'PGRST116') {
            throw gamesResult.error
          }

          const gameRows = Array.isArray(gamesResult.data) ? gamesResult.data : []
          gameMap = new Map(gameRows.map((row) => [row.id, row]))
        }

        let participantRatings = new Map()
        if (gameIds.length && occupantOwners.size) {
          const participantResult = await withTable(supabase, 'rank_participants', (table) =>
            supabase
              .from(table)
              .select('game_id, owner_id, rating')
              .in('game_id', gameIds)
              .in('owner_id', Array.from(occupantOwners)),
          )

          if (participantResult.error && participantResult.error.code !== 'PGRST116') {
            throw participantResult.error
          }

          const participantRows = Array.isArray(participantResult.data) ? participantResult.data : []
          participantRatings = participantRows.reduce((map, row) => {
            if (!row?.game_id || !row?.owner_id) return map
            const ratingValue = Number(row?.rating)
            if (!Number.isFinite(ratingValue)) return map
            map.set(`${row.game_id}:${row.owner_id}`, ratingValue)
            return map
          }, new Map())
        }

        const normalized = roomRows.map((row) => {
          const slotEntries = slotMap.get(row.id) || []
          const roleMap = new Map()
          const occupantRatings = []
          slotEntries.forEach((slot) => {
            const roleName = slot.role?.trim?.() || '역할 미지정'
            const stats = roleMap.get(roleName) || { total: 0, occupied: 0, ready: 0 }
            stats.total += 1
            if (slot.ownerId) stats.occupied += 1
            if (slot.ready) stats.ready += 1
            roleMap.set(roleName, stats)

            if (slot.ownerId) {
              const ratingValue = participantRatings.get(`${row.game_id}:${slot.ownerId}`)
              if (Number.isFinite(ratingValue)) {
                occupantRatings.push(ratingValue)
              }
            }
          })

          const roles = Array.from(roleMap.entries())
            .map(([role, stats]) => ({
              role,
              total: stats.total,
              occupied: stats.occupied,
              ready: stats.ready,
            }))
            .sort((a, b) => a.role.localeCompare(b.role, 'ko', { sensitivity: 'base' }))

          let ratingStats = null
          if (occupantRatings.length) {
            const sum = occupantRatings.reduce((acc, value) => acc + value, 0)
            ratingStats = {
              count: occupantRatings.length,
              min: Math.min(...occupantRatings),
              max: Math.max(...occupantRatings),
              average: Math.round(sum / occupantRatings.length),
            }
          }

          const slotCount = Number.isFinite(Number(row.slot_count))
            ? Number(row.slot_count)
            : roles.reduce((acc, role) => acc + role.total, 0)
          const filledCount = Number.isFinite(Number(row.filled_count))
            ? Number(row.filled_count)
            : roles.reduce((acc, role) => acc + role.occupied, 0)
          const readyCount = Number.isFinite(Number(row.ready_count))
            ? Number(row.ready_count)
            : roles.reduce((acc, role) => acc + role.ready, 0)

          const mode = typeof row.mode === 'string' ? row.mode : ''
          const modeLabel = mode.trim() || '모드 미지정'

          return {
            id: row.id,
            gameId: row.game_id || '',
            gameName: (gameMap.get(row.game_id)?.name || '알 수 없는 게임').trim() || '알 수 없는 게임',
            code: row.code || '미지정',
            status: row.status || 'unknown',
            mode: modeLabel,
            slotCount,
            filledCount,
            readyCount,
            roles,
            rating: ratingStats,
            updatedAt: row.updated_at || row.created_at || null,
          }
        })

        if (!mountedRef.current) return

        setRooms(normalized)
        setLastLoadedAt(new Date())
      } catch (loadError) {
        console.error('[RoomBrowser] Failed to load rooms:', loadError)
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
    [],
  )

  useEffect(() => {
    loadRooms(false)
  }, [loadRooms])

  const handleRefresh = useCallback(() => {
    loadRooms(true)
  }, [loadRooms])

  const heroRatingForSelection = useMemo(() => {
    if (!selectedGameId || selectedGameId === 'all') return null
    const rating = heroRatings[selectedGameId]
    if (!Number.isFinite(rating)) return null
    return rating
  }, [heroRatings, selectedGameId])

  const filteredRooms = useMemo(() => {
    return rooms
      .filter((room) => {
        if (modeTab === 'rank') {
          if (room.mode.toLowerCase().includes('casual')) {
            return false
          }
        } else if (!room.mode.toLowerCase().includes('casual')) {
          return false
        }
        return true
      })
      .filter((room) => {
        if (!selectedGameId || selectedGameId === 'all') return true
        return room.gameId === selectedGameId
      })
      .filter((room) => {
        if (!scoreWindow || !heroRatingForSelection) return true
        if (!room.rating || !Number.isFinite(room.rating.average)) return false
        return Math.abs(room.rating.average - heroRatingForSelection) <= scoreWindow
      })
  }, [heroRatingForSelection, modeTab, rooms, scoreWindow, selectedGameId])

  const handleModeChange = useCallback((nextMode) => {
    setModeTab(nextMode)
  }, [])

  const handleGameFilter = useCallback((gameId) => {
    setSelectedGameId(gameId)
    setCreateState((prev) => ({ ...prev, gameId: gameId === 'all' ? '' : gameId }))
  }, [])

  const handleScoreWindowChange = useCallback((windowValue) => {
    setScoreWindow(windowValue)
    setCreateState((prev) => ({ ...prev, scoreWindow: windowValue }))
  }, [])

  const handleToggleCreate = useCallback(() => {
    setCreateOpen((prev) => !prev)
    setCreateError('')
  }, [])

  const handleCreateSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      if (!heroSummary.ownerId) {
        setCreateError('로그인이 필요합니다.')
        return
      }
      const targetGameId = createState.gameId || (selectedGameId !== 'all' ? selectedGameId : '')
      if (!targetGameId) {
        setCreateError('먼저 게임을 선택해 주세요.')
        return
      }

      setCreatePending(true)
      setCreateError('')

      try {
        const existingCodes = rooms.map((room) => room.code)
        const code = generateRoomCode(existingCodes)
        const modeValue = createState.mode === 'casual' ? 'casual' : 'solo'

        const insertResult = await withTable(supabase, 'rank_rooms', (table) =>
          supabase
            .from(table)
            .insert({
              game_id: targetGameId,
              owner_id: heroSummary.ownerId,
              code,
              mode: modeValue,
              status: 'open',
              slot_count: 0,
              filled_count: 0,
              ready_count: 0,
            })
            .select('id')
            .single(),
        )

        if (insertResult.error) {
          throw insertResult.error
        }

        const roomId = insertResult.data?.id
        if (!roomId) {
          throw new Error('생성된 방 정보를 확인하지 못했습니다.')
        }

        const templateResult = await withTable(supabase, 'rank_game_slots', (table) =>
          supabase
            .from(table)
            .select('slot_index, role')
            .eq('game_id', targetGameId)
            .order('slot_index', { ascending: true }),
        )

        if (templateResult.error && templateResult.error.code !== 'PGRST116') {
          throw templateResult.error
        }

        const templates = Array.isArray(templateResult.data) ? templateResult.data : []

        if (templates.length) {
          const slotPayload = templates.map((template) => ({
            room_id: roomId,
            slot_index: template.slot_index ?? 0,
            role: template.role || '역할 미지정',
            occupant_owner_id: null,
            occupant_hero_id: null,
            occupant_ready: false,
          }))

          const slotInsert = await withTable(supabase, 'rank_room_slots', (table) =>
            supabase.from(table).insert(slotPayload),
          )

          if (slotInsert.error && slotInsert.error.code !== 'PGRST116') {
            throw slotInsert.error
          }

          await withTable(supabase, 'rank_rooms', (table) =>
            supabase
              .from(table)
              .update({ slot_count: templates.length })
              .eq('id', roomId),
          )
        }

        setCreateOpen(false)
        setCreateState((prev) => ({ ...prev, gameId: targetGameId }))
        await loadRooms(true)
      } catch (createFailure) {
        console.error('[RoomBrowser] Failed to create room:', createFailure)
        setCreateError(resolveErrorMessage(createFailure))
      } finally {
        setCreatePending(false)
      }
    },
    [createState.mode, createState.scoreWindow, heroSummary.ownerId, loadRooms, rooms, selectedGameId],
  )

  const createScoreWindowOptions = useMemo(
    () => (createState.mode === 'casual' ? SCORE_WINDOWS : RANK_SCORE_WINDOWS),
    [createState.mode],
  )

  const gameFilters = useMemo(() => {
    const unique = participations
      .filter((entry) => entry?.game?.id)
      .map((entry) => ({ id: entry.game.id, name: entry.game.name || '이름 없는 게임' }))
    const seen = new Set()
    const deduped = unique.filter((entry) => {
      if (seen.has(entry.id)) return false
      seen.add(entry.id)
      return true
    })
    return deduped
  }, [participations])

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.titleRow}>
            <div style={styles.titleBlock}>
              <h1 style={styles.title}>방 찾기</h1>
              <p style={styles.subtitle}>
                참여했던 게임을 기준으로 필터링하고, 점수 차이를 지정해 원하는 방을 탐색하세요.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleCreate}
              style={styles.createButton(createPending)}
              disabled={createPending}
            >
              {createPending ? '생성 중...' : createOpen ? '생성 닫기' : '방 만들기'}
            </button>
          </div>
          <div style={styles.helperRow}>
            <Link href="/lobby" style={styles.helperLink} prefetch>
              로비로 돌아가기
            </Link>
            <Link href="/roster" style={styles.helperLink} prefetch>
              캐릭터 선택으로 이동
            </Link>
          </div>
          <div style={styles.heroSummary}>
            {effectiveHeroId ? (
              <>
                <span>
                  선택한 캐릭터: <strong>{heroSummary.heroName || '알 수 없는 영웅'}</strong>
                </span>
                {heroLoading ? <span>참여 기록을 불러오는 중...</span> : null}
              </>
            ) : (
              <span>특정 캐릭터 없이 전체 방을 살펴보는 중입니다.</span>
            )}
            {heroRatingForSelection && selectedGameId !== 'all' ? (
              <span>
                내 점수: <strong>{heroRatingForSelection}</strong>
              </span>
            ) : null}
            {lastLoadedAt ? <span>마지막 새로고침: {formatRelativeTime(lastLoadedAt)}</span> : null}
          </div>
        </header>

        <section style={styles.filterCard}>
          <div>
            <p style={styles.filtersLabel}>모드 선택</p>
            <div style={styles.modeTabs}>
              {MODE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleModeChange(tab.key)}
                  style={styles.modeTab(modeTab === tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={styles.filtersLabel}>게임 필터</p>
            <p style={styles.filterHint}>
              캐릭터가 참여한 게임을 기준으로 방을 좁힐 수 있습니다.
            </p>
            <div style={styles.gameFilters}>
              <button
                type="button"
                style={styles.gameFilterButton(selectedGameId === 'all')}
                onClick={() => handleGameFilter('all')}
              >
                전체 보기
              </button>
              {gameFilters.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  style={styles.gameFilterButton(selectedGameId === game.id)}
                  onClick={() => handleGameFilter(game.id)}
                >
                  {game.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={styles.filtersLabel}>점수 범위</p>
            <p style={styles.filterHint}>
              원하는 점수 차이를 설정하면 평균 점수가 범위 안에 있는 방만 표시합니다.
            </p>
            <div style={styles.scoreWindowRow}>
              {SCORE_WINDOWS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  style={styles.scoreButton(scoreWindow === option.value)}
                  onClick={() => handleScoreWindowChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleRefresh}
              style={styles.refreshButton(refreshing)}
              disabled={refreshing}
            >
              {refreshing ? '새로고침 중...' : '목록 새로고침'}
            </button>
          </div>
        </section>

        {createOpen ? (
          <section style={styles.createPanel}>
            <form onSubmit={handleCreateSubmit}>
              <div style={styles.formRow}>
                <label style={styles.filtersLabel} htmlFor="room-mode-select">
                  방 유형
                </label>
                <select
                  id="room-mode-select"
                  value={createState.mode}
                  onChange={(event) =>
                    setCreateState((prev) => ({ ...prev, mode: event.target.value === 'casual' ? 'casual' : 'rank' }))
                  }
                  style={styles.select}
                >
                  <option value="rank">랭크</option>
                  <option value="casual">캐주얼</option>
                </select>
              </div>

              <div style={styles.formRow}>
                <label style={styles.filtersLabel} htmlFor="room-game-select">
                  대상 게임
                </label>
                <select
                  id="room-game-select"
                  value={createState.gameId || ''}
                  onChange={(event) => setCreateState((prev) => ({ ...prev, gameId: event.target.value }))}
                  style={styles.select}
                >
                  <option value="">게임 선택</option>
                  {gameFilters.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formRow}>
                <label style={styles.filtersLabel} htmlFor="room-score-select">
                  점수 범위 지정 (선택)
                </label>
                  <select
                    id="room-score-select"
                    value={createState.scoreWindow === null ? '' : String(createState.scoreWindow)}
                  onChange={(event) => {
                    const value = event.target.value ? Number(event.target.value) : null
                    setCreateState((prev) => ({ ...prev, scoreWindow: value }))
                  }}
                  style={styles.select}
                >
                  {createScoreWindowOptions.map((option) => (
                    <option
                      key={option.key}
                      value={option.value === null ? '' : String(option.value)}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {createError ? <p style={styles.createError}>{createError}</p> : null}

              <button type="submit" style={styles.submitButton(createPending)} disabled={createPending}>
                {createPending ? '생성 중...' : '방 생성하기'}
              </button>
            </form>
          </section>
        ) : null}

        {error ? (
          <section style={styles.errorCard}>
            <h2 style={styles.errorTitle}>방 목록을 불러오지 못했습니다.</h2>
            <p style={styles.errorText}>{error}</p>
            <button type="button" onClick={handleRefresh} style={styles.retryButton}>
              다시 시도
            </button>
          </section>
        ) : null}

        <section style={styles.roomsCard}>
          <h2 style={styles.filtersLabel}>검색 결과</h2>
          {loading ? (
            <div style={styles.loadingState}>방 목록을 불러오는 중입니다...</div>
          ) : filteredRooms.length === 0 ? (
            <div style={styles.emptyState}>조건에 맞는 방을 찾지 못했습니다.</div>
          ) : (
            <div style={styles.roomGrid}>
              {filteredRooms.map((room) => (
                <article key={room.id} style={styles.roomCard}>
                  <div style={styles.roomHeader}>
                    <div>
                      <h3 style={styles.roomTitle}>{room.gameName}</h3>
                      <p style={styles.roomMeta}>
                        <span>
                          코드: <span style={styles.roomCode}>{room.code}</span>
                        </span>
                        <span>모드: {room.mode}</span>
                        <span>
                          인원: {room.filledCount}/{room.slotCount}
                        </span>
                      </p>
                    </div>
                    {room.rating && Number.isFinite(room.rating.average) ? (
                      <span style={styles.ratingBadge}>
                        평균 {room.rating.average}점
                      </span>
                    ) : null}
                  </div>
                  {room.roles.length ? (
                    <div style={styles.roomRoles}>
                      {room.roles.map((role) => (
                        <div key={role.role}>
                          {role.role}: {role.occupied}/{role.total} (준비 {role.ready})
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div style={styles.roomFooter}>
                    <span>{formatRelativeTime(room.updatedAt)} 업데이트</span>
                    {room.rating?.count ? (
                      <span>
                        점수 범위 {room.rating.min}~{room.rating.max} ({room.rating.count}명)
                      </span>
                    ) : (
                      <span>점수 정보 없음</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
