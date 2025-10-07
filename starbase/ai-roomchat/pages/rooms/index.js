import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'
import { resolveViewerProfile } from '@/lib/heroes/resolveViewerProfile'
import { withTable } from '@/lib/supabaseTables'
import { fetchHeroParticipationBundle } from '@/modules/character/participation'
import {
  HERO_ID_KEY,
  HERO_OWNER_KEY,
  clearHeroSelection,
  persistHeroOwner,
  persistHeroSelection,
  readHeroSelection,
} from '@/lib/heroes/selectedHeroStorage'

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

const LAST_CREATED_ROOM_KEY = 'rooms:lastCreatedHostFeedback'
const ROOM_BROWSER_AUTO_REFRESH_INTERVAL_MS = 5000

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

const CASUAL_MODE_TOKENS = ['casual', '캐주얼', 'normal']

function isCasualModeLabel(value) {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return CASUAL_MODE_TOKENS.some((token) => normalized.includes(token))
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
  actionGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
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
  secondaryButton: (active) => ({
    padding: '11px 18px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: active ? 'rgba(45, 212, 191, 0.22)' : 'rgba(15, 23, 42, 0.55)',
    color: active ? '#5eead4' : '#cbd5f5',
    fontWeight: 600,
    cursor: 'pointer',
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
  filterDiagnosticsCard: {
    background: 'rgba(148, 163, 184, 0.08)',
    border: '1px dashed rgba(148, 163, 184, 0.3)',
    borderRadius: 16,
    padding: '16px 18px',
    display: 'grid',
    gap: 8,
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 1.6,
  },
  filterDiagnosticsIntro: {
    margin: 0,
    fontWeight: 600,
    color: '#cbd5f5',
  },
  filterDiagnosticsList: {
    margin: 0,
    paddingLeft: 18,
    display: 'grid',
    gap: 4,
  },
  filterDiagnosticsItem: {
    margin: 0,
  },
  keyManagerCard: {
    background: 'rgba(15, 23, 42, 0.84)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 22,
    padding: '20px 22px',
    display: 'grid',
    gap: 16,
  },
  keyManagerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  keyManagerTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#f8fafc',
  },
  keyManagerHint: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  keyManagerLimit: {
    fontSize: 13,
    fontWeight: 700,
    color: '#5eead4',
    background: 'rgba(45, 212, 191, 0.18)',
    borderRadius: 999,
    padding: '6px 12px',
    alignSelf: 'flex-start',
  },
  keyManagerForm: {
    display: 'grid',
    gap: 10,
  },
  keyManagerInputRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  keyManagerInput: {
    flex: '1 1 260px',
    minWidth: 220,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  keyManagerCheckboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#cbd5f5',
  },
  keyManagerStatus: {
    margin: 0,
    fontSize: 13,
    color: '#5eead4',
  },
  keyManagerError: {
    margin: 0,
    fontSize: 13,
    color: '#fca5a5',
  },
  keyManagerList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 12,
  },
  keyManagerItem: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    background: 'rgba(15, 23, 42, 0.6)',
    padding: '14px 16px',
  },
  keyManagerMeta: {
    display: 'grid',
    gap: 6,
    minWidth: 200,
  },
  keyManagerSampleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 700,
    color: '#f8fafc',
  },
  keyManagerBadge: (active) => ({
    fontSize: 11,
    fontWeight: 700,
    color: active ? '#172554' : '#e0f2fe',
    background: active ? '#5eead4' : 'rgba(125, 211, 252, 0.25)',
    padding: '4px 8px',
    borderRadius: 999,
  }),
  keyManagerDetail: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
  keyManagerActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  keyManagerActionButton: (variant, disabled) => {
    const base = {
      padding: '8px 12px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      transition: 'background 0.2s ease',
    }
    if (variant === 'primary') {
      return {
        ...base,
        border: '1px solid rgba(59, 130, 246, 0.55)',
        background: disabled ? 'rgba(30, 64, 175, 0.4)' : 'rgba(37, 99, 235, 0.4)',
        color: '#bfdbfe',
      }
    }
    return {
      ...base,
      border: '1px solid rgba(248, 113, 113, 0.4)',
      background: disabled ? 'rgba(127, 29, 29, 0.35)' : 'rgba(190, 24, 93, 0.4)',
      color: '#fecaca',
    }
  },
  keyManagerEmpty: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
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
  roomLink: {
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
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

function resolveKeyringError(code, detail) {
  if (detail && typeof detail === 'string') {
    return detail
  }
  switch (code) {
    case 'keyring_limit_reached':
      return '등록 가능한 최대 개수를 초과했습니다. 기존 키를 정리한 뒤 다시 시도해 주세요.'
    case 'missing_user_api_key':
    case 'missing_api_key':
      return 'API 키를 입력해 주세요.'
    case 'unrecognized_api_key':
      return 'API 키 종류를 확인하지 못했습니다. 키를 다시 확인해 주세요.'
    case 'detect_failed':
      return 'API 키 정보를 확인하지 못했습니다.'
    case 'failed_to_store_api_key':
      return 'API 키를 저장하지 못했습니다.'
    case 'failed_to_activate_api_key':
      return 'API 키를 활성화하지 못했습니다.'
    case 'failed_to_delete_api_key':
      return 'API 키를 삭제하지 못했습니다.'
    case 'failed_to_load_keyring':
      return 'API 키 목록을 불러오지 못했습니다.'
    default:
      return 'API 키 요청을 처리하지 못했습니다.'
  }
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

  const [viewerUserId, setViewerUserId] = useState('')
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
  const [keyManagerOpen, setKeyManagerOpen] = useState(false)
  const [keyringEntries, setKeyringEntries] = useState([])
  const [keyringLimit, setKeyringLimit] = useState(5)
  const [keyringLoading, setKeyringLoading] = useState(false)
  const [keyringError, setKeyringError] = useState('')
  const [keyringStatus, setKeyringStatus] = useState('')
  const [keyringInput, setKeyringInput] = useState('')
  const [keyringActivate, setKeyringActivate] = useState(true)
  const [keyringBusy, setKeyringBusy] = useState(false)
  const [keyringAction, setKeyringAction] = useState(null)

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
    if (typeof window === 'undefined') return undefined

    const syncStoredHero = () => {
      try {
        const selection = readHeroSelection()
        const nextHeroId = selection?.heroId || ''
        const selectionOwner = selection?.ownerId || ''
        const viewerOwner = viewerUserId ? String(viewerUserId) : ''

        if (viewerOwner && selectionOwner && selectionOwner !== viewerOwner) {
          clearHeroSelection()
          setStoredHeroId('')
          setViewerHeroProfile((prev) => {
            if (!prev) return prev
            return null
          })
          return
        }

        if (nextHeroId && viewerOwner && !selectionOwner) {
          persistHeroSelection({ id: nextHeroId }, viewerOwner)
        }

        setStoredHeroId((prev) => {
          if (prev === nextHeroId) return prev
          return nextHeroId
        })

        if (!nextHeroId) {
          setViewerHeroProfile((prev) => {
            if (!prev) return prev
            return null
          })
        }
      } catch (storageError) {
        console.error('[RoomBrowser] Failed to sync hero selection:', storageError)
      }
    }

    syncStoredHero()

    const handleStorage = (event) => {
      if (!event) return
      if (event.key && event.key !== HERO_ID_KEY && event.key !== HERO_OWNER_KEY) {
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
  }, [viewerUserId])

  useEffect(() => {
    if (!viewerUserId) return
    persistHeroOwner(viewerUserId)
  }, [viewerUserId])

  useEffect(() => {
    if (!keyManagerOpen) return undefined

    loadKeyring()

    return undefined
  }, [keyManagerOpen, loadKeyring])

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

        if (!cancelled && mountedRef.current) {
          setViewerUserId(user?.id || '')
        }

        if (!user) {
          if (!cancelled && mountedRef.current) {
            setViewerHeroProfile(null)
          }
          return
        }

        const profile = await resolveViewerProfile(user, null)
        if (!cancelled && mountedRef.current) {
          const resolvedOwner = profile?.owner_id || profile?.user_id || user.id || ''
          setViewerUserId(resolvedOwner || user.id || '')
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
          setViewerUserId('')
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

      const viewerOwnerKey = viewerUserId ? String(viewerUserId) : ''
      const resolvedOwnerKey = ownerId != null ? String(ownerId) : ''

      if (viewerOwnerKey && resolvedOwnerKey && resolvedOwnerKey !== viewerOwnerKey) {
        clearHeroSelection()
        setStoredHeroId('')
        setHeroSummary({ heroName: '', ownerId: null })
        setParticipations([])
        setHeroRatings({})
        setSelectedGameId('all')
        setCreateState((prev) => ({ ...prev, gameId: '' }))
        setHeroLoading(false)
        return
      }

      const effectiveOwnerId = resolvedOwnerKey || viewerOwnerKey || null

      if (normalizedHeroId && effectiveOwnerId) {
        persistHeroSelection({ id: normalizedHeroId }, effectiveOwnerId)
      }

      const bundle = await fetchHeroParticipationBundle(normalizedHeroId, {
        heroSeed: heroRow
          ? {
              id: heroRow.id,
              name: heroName,
              owner_id: effectiveOwnerId,
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

      setHeroSummary({ heroName, ownerId: effectiveOwnerId })
      setParticipations(uniqueGames)

      const defaultGame = uniqueGames.find((entry) => entry.game?.id === initialGameId)
        ? initialGameId
        : uniqueGames[0]?.game?.id || 'all'

      setSelectedGameId(defaultGame || 'all')
      setCreateState((prev) => ({ ...prev, gameId: defaultGame || '' }))

      const ratingOwnerId = effectiveOwnerId
      if (ratingOwnerId && uniqueGames.length) {
        const gameIds = uniqueGames.map((entry) => entry.game.id)
        const { data: ratingRows, error: ratingError } = await withTable(
          supabase,
          'rank_participants',
          (table) =>
            supabase
              .from(table)
              .select('game_id, rating')
              .eq('owner_id', ratingOwnerId)
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
  }, [
    initialGameId,
    viewerHeroProfile?.name,
    viewerHeroProfile?.owner_id,
    viewerHeroProfile?.user_id,
    viewerHeroSeed?.id,
    viewerHeroSeed?.name,
    viewerHeroSeed?.owner_id,
    viewerUserId,
  ])

  useEffect(() => {
    loadHeroContext(effectiveHeroId)
  }, [effectiveHeroId, loadHeroContext])

  const loadRooms = useCallback(
    async (mode = 'initial') => {
      if (!mountedRef.current) return
      if (mode === 'refresh') {
        setRefreshing(true)
      } else if (mode === 'initial') {
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
                'owner_id',
                'code',
                'mode',
                'status',
                'slot_count',
                'filled_count',
                'ready_count',
                'score_window',
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
            console.warn('[RoomBrowser] Failed to load room slots:', slotResult.error)
          } else {
            slotRows = Array.isArray(slotResult.data) ? slotResult.data : []
          }
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

        roomRows.forEach((row) => {
          if (row?.owner_id) {
            occupantOwners.add(row.owner_id)
          }
        })

        const gameIds = Array.from(new Set(roomRows.map((row) => row.game_id).filter(Boolean)))
        let gameMap = new Map()
        if (gameIds.length) {
          const gamesResult = await withTable(supabase, 'rank_games', (table) =>
            supabase.from(table).select('id, name').in('id', gameIds),
          )

          if (gamesResult.error && gamesResult.error.code !== 'PGRST116') {
            console.warn('[RoomBrowser] Failed to load games:', gamesResult.error)
          } else {
            const gameRows = Array.isArray(gamesResult.data) ? gamesResult.data : []
            gameMap = new Map(gameRows.map((row) => [row.id, row]))
          }
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
            console.warn('[RoomBrowser] Failed to load participant ratings:', participantResult.error)
          } else {
            const participantRows = Array.isArray(participantResult.data) ? participantResult.data : []
            participantRatings = participantRows.reduce((map, row) => {
              if (!row?.game_id || !row?.owner_id) return map
              const ratingValue = Number(row?.rating)
              if (!Number.isFinite(ratingValue)) return map
              map.set(`${row.game_id}:${row.owner_id}`, ratingValue)
              return map
            }, new Map())
          }
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

          const scoreWindow = Number.isFinite(Number(row.score_window))
            ? Number(row.score_window)
            : null

          const hostRating = row.owner_id
            ? participantRatings.get(`${row.game_id}:${row.owner_id}`) ?? null
            : null

          const ratingSamples = occupantRatings.length
            ? occupantRatings
            : Number.isFinite(hostRating)
            ? [hostRating]
            : []

          let ratingStats = null
          if (ratingSamples.length) {
            const sum = ratingSamples.reduce((acc, value) => acc + value, 0)
            ratingStats = {
              count: ratingSamples.length,
              min: Math.min(...ratingSamples),
              max: Math.max(...ratingSamples),
              average: Math.round(sum / ratingSamples.length),
            }
          }

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
            scoreWindow,
            hostRating,
            ownerId: row.owner_id || null,
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
        if (mode === 'initial') {
          setLoading(false)
          setRefreshing(false)
        } else if (mode === 'refresh') {
          setRefreshing(false)
        } else {
          setRefreshing(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    loadRooms('initial')
  }, [loadRooms])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const intervalId = window.setInterval(() => {
      loadRooms('auto')
    }, ROOM_BROWSER_AUTO_REFRESH_INTERVAL_MS)
    return () => {
      clearInterval(intervalId)
    }
  }, [loadRooms])

  const handleRefresh = useCallback(() => {
    loadRooms('refresh')
  }, [loadRooms])

  const heroRatingForSelection = useMemo(() => {
    if (!selectedGameId || selectedGameId === 'all') return null
    const rating = heroRatings[selectedGameId]
    if (!Number.isFinite(rating)) return null
    return rating
  }, [heroRatings, selectedGameId])

  const { filteredRooms, filterDiagnostics } = useMemo(() => {
    const hasComparableRatings = rooms.some(
      (room) => Number.isFinite(room?.rating?.average) || Number.isFinite(room?.hostRating),
    )

    const stats = {
      total: rooms.length,
      modeExcluded: 0,
      gameExcluded: 0,
      scoreExcluded: 0,
      scoreMissing: 0,
      scoreFilterActive:
        Boolean(scoreWindow) &&
        Number.isFinite(heroRatingForSelection) &&
        hasComparableRatings,
      scoreExamples: [],
    }

    const result = []

    rooms.forEach((room) => {
      const isCasualRoom = isCasualModeLabel(room.mode || '')
      const inModeTab =
        modeTab === 'rank' ? !isCasualRoom : isCasualRoom

      if (!inModeTab) {
        stats.modeExcluded += 1
        return
      }

      const matchesGame =
        !selectedGameId || selectedGameId === 'all' || room.gameId === selectedGameId

      if (!matchesGame) {
        stats.gameExcluded += 1
        return
      }

      if (stats.scoreFilterActive) {
        const comparisonRating = Number.isFinite(room.rating?.average)
          ? room.rating.average
          : Number.isFinite(room.hostRating)
          ? room.hostRating
          : null

        if (Number.isFinite(comparisonRating)) {
          const roomWindow = Number.isFinite(room.scoreWindow) ? room.scoreWindow : null
          const allowedWindow = roomWindow ? Math.min(scoreWindow, roomWindow) : scoreWindow
          const delta = Math.abs(comparisonRating - heroRatingForSelection)

          if (delta > allowedWindow) {
            stats.scoreExcluded += 1
            if (stats.scoreExamples.length < 3) {
              stats.scoreExamples.push({
                roomName: room.gameName,
                hostRating: comparisonRating,
                delta,
                allowed: allowedWindow,
              })
            }
            return
          }
        } else {
          stats.scoreMissing += 1
        }
      }

      result.push(room)
    })

    return { filteredRooms: result, filterDiagnostics: stats }
  }, [heroRatingForSelection, modeTab, rooms, scoreWindow, selectedGameId])

  const filterMessages = useMemo(() => {
    if (!filterDiagnostics) return []
    const messages = []

    if (filterDiagnostics.modeExcluded) {
      const label = modeTab === 'rank' ? '캐주얼' : '랭크'
      messages.push(
        `${label} 모드 방 ${filterDiagnostics.modeExcluded}개는 현재 탭에서 제외되었습니다.`,
      )
    }

    if (filterDiagnostics.gameExcluded) {
      messages.push(
        `선택한 게임과 다른 방 ${filterDiagnostics.gameExcluded}개는 표시되지 않았습니다.`,
      )
    }

    if (filterDiagnostics.scoreFilterActive && filterDiagnostics.scoreExcluded) {
      const [example] = filterDiagnostics.scoreExamples
      const detail = example
        ? ` 예: ${example.roomName} 방은 호스트 ${example.hostRating}점으로 내 점수와 ±${Math.round(
            example.delta,
          )} 차이가 나서 허용 범위(±${example.allowed}) 밖입니다.`
        : ''
      messages.push(
        `점수 범위 조건으로 제외된 방이 ${filterDiagnostics.scoreExcluded}개 있습니다.${detail}`,
      )
    }

    if (filterDiagnostics.scoreFilterActive && filterDiagnostics.scoreMissing) {
      messages.push(
        `점수 비교 정보가 없는 방 ${filterDiagnostics.scoreMissing}개는 조건 확인 없이 함께 표시했습니다.`,
      )
    }

    return messages
  }, [filterDiagnostics, modeTab])

  const keyringCount = keyringEntries.length

  const getAuthToken = useCallback(async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw sessionError
    }

    const token = sessionData?.session?.access_token
    if (!token) {
      throw new Error('세션 토큰을 확인할 수 없습니다.')
    }

    return token
  }, [])

  const loadKeyring = useCallback(async () => {
    setKeyringLoading(true)
    setKeyringError('')
    setKeyringAction(null)
    try {
      const token = await getAuthToken()
      const response = await fetch('/api/rank/user-api-keyring', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = resolveKeyringError(payload?.error, payload?.detail)
        const error = new Error(message)
        error.code = payload?.error
        throw error
      }

      setKeyringEntries(Array.isArray(payload?.keys) ? payload.keys : [])
      if (typeof payload?.limit === 'number' && Number.isFinite(payload.limit)) {
        setKeyringLimit(payload.limit)
      }
    } catch (loadError) {
      console.error('[RoomBrowser] Failed to load API keyring:', loadError)
      setKeyringError(loadError?.message || 'API 키 목록을 불러오지 못했습니다.')
    } finally {
      setKeyringLoading(false)
    }
  }, [getAuthToken])

  const handleToggleKeyManager = useCallback(() => {
    setKeyManagerOpen((prev) => {
      const next = !prev
      if (!next) {
        setKeyringError('')
        setKeyringStatus('')
        setKeyringAction(null)
      }
      return next
    })
  }, [])

  const handleKeyringSubmit = useCallback(async () => {
    const trimmed = typeof keyringInput === 'string' ? keyringInput.trim() : ''
    if (!trimmed) {
      setKeyringError('API 키를 입력해 주세요.')
      return
    }

    if (keyringCount >= keyringLimit) {
      setKeyringError('등록 가능한 최대 개수를 초과했습니다.')
      return
    }

    setKeyringBusy(true)
    setKeyringError('')
    setKeyringStatus('')

    try {
      const token = await getAuthToken()
      const response = await fetch('/api/rank/user-api-keyring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apiKey: trimmed, activate: keyringActivate }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = resolveKeyringError(payload?.error, payload?.detail)
        const error = new Error(message)
        error.code = payload?.error
        throw error
      }

      const providerLabel =
        payload?.detection?.provider === 'gemini'
          ? 'Gemini'
          : payload?.detection?.provider === 'openai'
          ? 'OpenAI'
          : '새'
      const modelLabel = payload?.detection?.modelLabel
      const statusMessage = `${providerLabel} 키를 등록했습니다.${
        modelLabel ? ` (${modelLabel})` : ''
      }`
      setKeyringStatus(statusMessage)
      setKeyringInput('')
      setKeyringActivate(true)
      await loadKeyring()
    } catch (submitError) {
      console.error('[RoomBrowser] Failed to store API key:', submitError)
      setKeyringError(submitError?.message || 'API 키를 저장하지 못했습니다.')
    } finally {
      setKeyringBusy(false)
    }
  }, [
    getAuthToken,
    keyringActivate,
    keyringCount,
    keyringInput,
    keyringLimit,
    loadKeyring,
  ])

  const handleKeyringActivate = useCallback(
    async (entryId) => {
      if (!entryId) return

      setKeyringAction({ id: entryId, type: 'activate' })
      setKeyringError('')
      setKeyringStatus('')

      try {
        const token = await getAuthToken()
        const response = await fetch('/api/rank/user-api-keyring', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: entryId }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message = resolveKeyringError(payload?.error, payload?.detail)
          const error = new Error(message)
          error.code = payload?.error
          throw error
        }

        setKeyringStatus('선택한 API 키를 활성화했습니다.')
        await loadKeyring()
      } catch (activateError) {
        console.error('[RoomBrowser] Failed to activate API key:', activateError)
        setKeyringError(activateError?.message || 'API 키를 활성화하지 못했습니다.')
      } finally {
        setKeyringAction(null)
      }
    },
    [getAuthToken, loadKeyring],
  )

  const handleKeyringDelete = useCallback(
    async (entryId) => {
      if (!entryId) return

      setKeyringAction({ id: entryId, type: 'delete' })
      setKeyringError('')
      setKeyringStatus('')

      try {
        const token = await getAuthToken()
        const response = await fetch('/api/rank/user-api-keyring', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: entryId }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message = resolveKeyringError(payload?.error, payload?.detail)
          const error = new Error(message)
          error.code = payload?.error
          throw error
        }

        setKeyringStatus('API 키를 삭제했습니다.')
        await loadKeyring()
      } catch (deleteError) {
        console.error('[RoomBrowser] Failed to delete API key:', deleteError)
        setKeyringError(deleteError?.message || 'API 키를 삭제하지 못했습니다.')
      } finally {
        setKeyringAction(null)
      }
    },
    [getAuthToken, loadKeyring],
  )

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
      const roomOwnerId = heroSummary.ownerId || viewerUserId || null
      if (!roomOwnerId) {
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
              owner_id: roomOwnerId,
              code,
              mode: modeValue,
              status: 'open',
              slot_count: 0,
              filled_count: 0,
              ready_count: 0,
              score_window:
                createState.mode === 'casual'
                  ? createState.scoreWindow ?? null
                  : createState.scoreWindow ?? DEFAULT_RANK_SCORE_WINDOW,
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
            .eq('active', true)
            .order('slot_index', { ascending: true }),
        )

        if (templateResult.error && templateResult.error.code !== 'PGRST116') {
          throw templateResult.error
        }

        const templates = Array.isArray(templateResult.data) ? templateResult.data : []

        let hostSeated = false
        let participantRow = null

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

          if (roomOwnerId && targetGameId) {
            if (effectiveHeroId) {
              const byHero = await withTable(supabase, 'rank_participants', (table) =>
                supabase
                  .from(table)
                  .select('role, rating')
                  .eq('game_id', targetGameId)
                  .eq('hero_id', effectiveHeroId)
                  .order('updated_at', { ascending: false })
                  .limit(1)
                  .maybeSingle(),
              )

              if (byHero.error && byHero.error.code !== 'PGRST116') {
                throw byHero.error
              }

              if (byHero.data) {
                participantRow = byHero.data
              }
            }

            if (!participantRow) {
              const byOwner = await withTable(supabase, 'rank_participants', (table) =>
                supabase
                  .from(table)
                  .select('role, rating')
                  .eq('game_id', targetGameId)
                  .eq('owner_id', roomOwnerId)
                  .order('updated_at', { ascending: false })
                  .limit(1)
                  .maybeSingle(),
              )

              if (byOwner.error && byOwner.error.code !== 'PGRST116') {
                throw byOwner.error
              }

              if (byOwner.data) {
                participantRow = byOwner.data
              }
            }

            const normalizedHostRole = normalizeRole(participantRow?.role)

            const roleMatch = normalizedHostRole
              ? templates.find((template) => normalizeRole(template.role) === normalizedHostRole)
              : null
            const flexibleMatch = templates.find((template) => isFlexibleRole(template.role))
            const fallbackMatch = templates[0]
            const targetTemplate = roleMatch || flexibleMatch || fallbackMatch

            if (targetTemplate) {
              const seatResult = await withTable(supabase, 'rank_room_slots', (table) =>
                supabase
                  .from(table)
                  .update({
                    occupant_owner_id: roomOwnerId,
                    occupant_hero_id: effectiveHeroId || null,
                    occupant_ready: false,
                    joined_at: new Date().toISOString(),
                  })
                  .eq('room_id', roomId)
                  .eq('slot_index', targetTemplate.slot_index ?? 0)
                  .is('occupant_owner_id', null)
                  .select('id')
                  .maybeSingle(),
              )

              if (seatResult.error && seatResult.error.code !== 'PGRST116') {
                throw seatResult.error
              }

              if (!seatResult.error && seatResult.data) {
                hostSeated = true
              }
            }
          }
        }

        const nowIso = new Date().toISOString()

        await withTable(supabase, 'rank_rooms', (table) =>
          supabase
            .from(table)
            .update({
              slot_count: templates.length,
              filled_count: hostSeated ? 1 : 0,
              ready_count: 0,
              host_last_active_at: nowIso,
            })
            .eq('id', roomId),
        )

        if (mountedRef.current) {
          setCreateOpen(false)
          setCreateState((prev) => ({ ...prev, gameId: targetGameId }))
        }

        const nextRoute = {
          pathname: '/rooms/[id]',
          query: { id: roomId },
        }

        if (effectiveHeroId) {
          nextRoute.query.hero = effectiveHeroId
        }

        if (typeof window !== 'undefined') {
          const ratingValue = Number(participantRow?.rating)
          const hostRating = Number.isFinite(ratingValue) ? ratingValue : null
          const feedbackPayload = {
            roomId,
            hostSeated,
            hostRating,
            timestamp: Date.now(),
          }
          try {
            window.sessionStorage.setItem(
              LAST_CREATED_ROOM_KEY,
              JSON.stringify(feedbackPayload),
            )
          } catch (storageError) {
            console.warn('[RoomBrowser] Failed to persist creation feedback:', storageError)
          }
        }

        await router.push(nextRoute)
        return
      } catch (createFailure) {
        console.error('[RoomBrowser] Failed to create room:', createFailure)
        setCreateError(resolveErrorMessage(createFailure))
      } finally {
        setCreatePending(false)
      }
    },
    [
      createState.mode,
      createState.scoreWindow,
      effectiveHeroId,
      heroSummary.ownerId,
      viewerUserId,
      rooms,
      router,
      selectedGameId,
    ],
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

  const canAddKey = keyringCount < keyringLimit

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
            <div style={styles.actionGroup}>
              <button
                type="button"
                onClick={handleToggleKeyManager}
                style={styles.secondaryButton(keyManagerOpen)}
              >
                {keyManagerOpen ? '키 관리 닫기' : 'AI API 키 관리'}
              </button>
              <button
                type="button"
                onClick={handleToggleCreate}
                style={styles.createButton(createPending)}
                disabled={createPending}
              >
                {createPending ? '생성 중...' : createOpen ? '생성 닫기' : '방 만들기'}
              </button>
            </div>
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

        {keyManagerOpen ? (
          <section style={styles.keyManagerCard}>
            <div style={styles.keyManagerHeader}>
              <div>
                <h2 style={styles.keyManagerTitle}>AI API 키 관리</h2>
                <p style={styles.keyManagerHint}>
                  최대 {keyringLimit}개의 키를 저장해 상황에 맞게 전환할 수 있습니다.
                </p>
              </div>
              <span style={styles.keyManagerLimit}>
                {keyringCount} / {keyringLimit}
              </span>
            </div>
            {keyringError ? <p style={styles.keyManagerError}>{keyringError}</p> : null}
            {keyringStatus ? <p style={styles.keyManagerStatus}>{keyringStatus}</p> : null}
            {!canAddKey && !keyringError ? (
              <p style={styles.keyManagerHint}>
                등록 가능한 최대 개수에 도달했습니다. 사용하지 않는 키를 삭제한 뒤 다시 시도해 주세요.
              </p>
            ) : null}
            <div style={styles.keyManagerForm}>
              <div style={styles.keyManagerInputRow}>
                <input
                  type="text"
                  placeholder="API 키를 입력하세요"
                  value={keyringInput}
                  onChange={(event) => setKeyringInput(event.target.value)}
                  style={styles.keyManagerInput}
                  disabled={!canAddKey || keyringBusy || keyringLoading}
                />
                <button
                  type="button"
                  onClick={handleKeyringSubmit}
                  style={styles.createButton(keyringBusy || !canAddKey)}
                  disabled={keyringBusy || !canAddKey || keyringLoading}
                >
                  {keyringBusy ? '등록 중...' : canAddKey ? '등록' : '제한 도달'}
                </button>
              </div>
              <label style={styles.keyManagerCheckboxRow}>
                <input
                  type="checkbox"
                  checked={keyringActivate}
                  onChange={(event) => setKeyringActivate(event.target.checked)}
                  disabled={keyringBusy}
                />
                등록 후 바로 사용
              </label>
            </div>
            {keyringLoading ? (
              <p style={styles.keyManagerHint}>키 정보를 불러오는 중입니다...</p>
            ) : keyringEntries.length ? (
              <ul style={styles.keyManagerList}>
                {keyringEntries.map((entry) => {
                  const providerLabel =
                    entry.provider === 'gemini'
                      ? 'Gemini'
                      : entry.provider === 'openai'
                      ? 'OpenAI'
                      : '알 수 없음'
                  const updatedLabel = entry.updatedAt ? formatRelativeTime(entry.updatedAt) : null
                  const actionInFlight = Boolean(keyringAction)
                  const isCurrentAction = keyringAction?.id === entry.id
                  const isDeleteAction = isCurrentAction && keyringAction?.type === 'delete'
                  const disableActivate =
                    entry.isActive || actionInFlight || keyringLoading || keyringBusy
                  const disableDelete =
                    entry.isActive || actionInFlight || keyringLoading || keyringBusy
                  const activateLabel = entry.isActive
                    ? '사용 중'
                    : isCurrentAction && keyringAction?.type === 'activate'
                    ? '처리 중...'
                    : '활성화'
                  const deleteLabel = isDeleteAction ? '삭제 중...' : '삭제'

                  return (
                    <li key={entry.id} style={styles.keyManagerItem}>
                      <div style={styles.keyManagerMeta}>
                        <div style={styles.keyManagerSampleRow}>
                          <span>{entry.keySample || '알 수 없는 키'}</span>
                          {entry.isActive ? (
                            <span style={styles.keyManagerBadge(true)}>사용 중</span>
                          ) : null}
                        </div>
                        <div style={styles.keyManagerDetail}>
                          <span>{providerLabel}</span>
                          {entry.modelLabel ? <span>모델: {entry.modelLabel}</span> : null}
                          {entry.provider === 'gemini' && entry.geminiMode ? (
                            <span>모드: {entry.geminiMode}</span>
                          ) : null}
                          {entry.apiVersion ? <span>버전: {entry.apiVersion}</span> : null}
                          {updatedLabel ? <span>업데이트: {updatedLabel}</span> : null}
                        </div>
                      </div>
                      <div style={styles.keyManagerActions}>
                        <button
                          type="button"
                          style={styles.keyManagerActionButton('primary', disableActivate)}
                          disabled={disableActivate}
                          onClick={() => handleKeyringActivate(entry.id)}
                        >
                          {activateLabel}
                        </button>
                        <button
                          type="button"
                          style={styles.keyManagerActionButton('danger', disableDelete)}
                          disabled={disableDelete}
                          onClick={() => handleKeyringDelete(entry.id)}
                        >
                          {deleteLabel}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p style={styles.keyManagerEmpty}>등록된 API 키가 없습니다.</p>
            )}
          </section>
        ) : null}

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
          {filterMessages.length ? (
            <div style={styles.filterDiagnosticsCard}>
              <p style={styles.filterDiagnosticsIntro}>
                총 {filterDiagnostics.total}개 중 {filteredRooms.length}개가 현재 조건과 일치합니다.
              </p>
              <ul style={styles.filterDiagnosticsList}>
                {filterMessages.map((message, index) => (
                  <li key={index} style={styles.filterDiagnosticsItem}>
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {loading ? (
            <div style={styles.loadingState}>방 목록을 불러오는 중입니다...</div>
          ) : filteredRooms.length === 0 ? (
            <div style={styles.emptyState}>조건에 맞는 방을 찾지 못했습니다.</div>
          ) : (
            <div style={styles.roomGrid}>
              {filteredRooms.map((room) => {
                const href = effectiveHeroId
                  ? { pathname: `/rooms/${room.id}`, query: { hero: effectiveHeroId } }
                  : { pathname: `/rooms/${room.id}` }
                const scoreWindowLabel =
                  room.scoreWindow === null ? '제한 없음' : `±${room.scoreWindow}`
                const hostRatingText = Number.isFinite(room.hostRating)
                  ? `${room.hostRating}점`
                  : '정보 없음'
                const heroDelta =
                  heroRatingForSelection && Number.isFinite(room.hostRating)
                    ? Math.abs(heroRatingForSelection - room.hostRating)
                    : null

                return (
                  <Link key={room.id} href={href} style={styles.roomLink} prefetch>
                    <article style={styles.roomCard}>
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
                          <p style={styles.roomMeta}>
                            <span>방장 점수: {hostRatingText}</span>
                            <span>허용 범위: {scoreWindowLabel}</span>
                            {heroDelta !== null ? (
                              <span>내 점수와 차이: ±{heroDelta}</span>
                            ) : null}
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
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
