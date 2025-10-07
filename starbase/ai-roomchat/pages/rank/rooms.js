import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '@/lib/supabase'
import { withTable } from '@/lib/supabaseTables'
import { getMatchModeConfig } from '@/lib/rank/matchModes'

const STATUS_LABELS = {
  open: '모집 중',
  ready: '시작 대기',
  running: '진행 중',
  closed: '종료됨',
  archived: '보관됨',
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    padding: '32px 16px 80px',
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
    gap: 16,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 1.6,
  },
  controlsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  searchInput: {
    flex: '1 1 260px',
    minWidth: 220,
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  refreshButton: (disabled) => ({
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: disabled ? 'rgba(30, 41, 59, 0.55)' : 'rgba(30, 41, 59, 0.85)',
    color: disabled ? '#94a3b8' : '#f8fafc',
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    transition: 'background 0.2s ease',
  }),
  linkRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 13,
  },
  subtleLink: {
    color: '#38bdf8',
    fontWeight: 600,
    textDecoration: 'none',
  },
  summaryRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 12,
    color: '#94a3b8',
  },
  errorBox: {
    background: 'rgba(248, 113, 113, 0.12)',
    border: '1px solid rgba(248, 113, 113, 0.4)',
    borderRadius: 16,
    padding: 20,
    display: 'grid',
    gap: 12,
    color: '#fecaca',
  },
  errorTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
  },
  errorMessage: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
  },
  retryButton: {
    justifySelf: 'flex-start',
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid rgba(248, 113, 113, 0.65)',
    background: 'rgba(127, 29, 29, 0.65)',
    color: '#fff1f2',
    fontWeight: 600,
    cursor: 'pointer',
  },
  loadingState: {
    padding: '80px 0',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 15,
  },
  roomGrid: {
    display: 'grid',
    gap: 16,
  },
  roomCard: {
    background: 'rgba(15, 23, 42, 0.78)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: 22,
    padding: 20,
    display: 'grid',
    gap: 14,
    boxShadow: '0 36px 90px -50px rgba(15, 23, 42, 0.85)',
  },
  roomHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 18,
  },
  roomTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  roomGameName: {
    margin: 0,
    fontSize: 20,
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
  roomCodeBadge: {
    background: 'rgba(2, 132, 199, 0.18)',
    color: '#bae6fd',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  roomCounts: {
    margin: 0,
    fontSize: 14,
    color: '#cbd5f5',
  },
  roleGrid: {
    display: 'grid',
    gap: 8,
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  },
  roleChip: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    borderRadius: 14,
    background: 'rgba(30, 64, 175, 0.22)',
    border: '1px solid rgba(37, 99, 235, 0.35)',
  },
  roleName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#bfdbfe',
    margin: 0,
  },
  roleCounts: {
    fontSize: 13,
    color: '#e2e8f0',
  },
  roleReady: {
    fontSize: 12,
    color: '#93c5fd',
  },
  emptyRoles: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
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
    background: 'rgba(15, 23, 42, 0.62)',
    border: '1px dashed rgba(148, 163, 184, 0.35)',
    borderRadius: 18,
    padding: '40px 28px',
    textAlign: 'center',
    color: '#94a3b8',
    display: 'grid',
    gap: 10,
  },
  emptyTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  emptyDescription: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
  },
}

function formatRelativeTime(value) {
  if (!value) return '시간 정보 없음'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '시간 정보 없음'
  const now = Date.now()
  const diff = now - date.getTime()
  if (!Number.isFinite(diff)) return '시간 정보 없음'
  if (diff < 0) return '곧 업데이트'
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

function formatModeLabel(mode) {
  if (!mode) return '모드 미지정'
  const config = getMatchModeConfig(mode)
  if (config?.label) {
    return config.label
  }
  if (typeof mode === 'string') {
    const trimmed = mode.trim()
    if (!trimmed) return '모드 미지정'
    if (trimmed === 'solo') return '솔로'
    if (trimmed === 'duo') return '듀오'
    if (trimmed === 'casual') return '캐주얼'
    return trimmed
  }
  return '모드 미지정'
}

function formatStatusLabel(status) {
  if (!status) return '상태 미지정'
  const normalized = String(status).toLowerCase()
  if (STATUS_LABELS[normalized]) {
    return STATUS_LABELS[normalized]
  }
  return status
}

function resolveErrorMessage(error) {
  if (!error) return '알 수 없는 오류가 발생했습니다.'
  if (typeof error === 'string') return error
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }
  if (typeof error.details === 'string' && error.details.trim()) {
    return error.details
  }
  if (typeof error.hint === 'string' && error.hint.trim()) {
    return error.hint
  }
  return '알 수 없는 오류가 발생했습니다.'
}

export default function RankRoomSearchPage() {
  const router = useRouter()
  const mountedRef = useRef(true)
  const pendingGameIdRef = useRef(null)

  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState(null)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

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

        let slotMap = new Map()
        if (roomIds.length > 0) {
          const slotResult = await withTable(supabase, 'rank_room_slots', (table) =>
            supabase
              .from(table)
              .select('room_id, role, occupant_owner_id, occupant_ready')
              .in('room_id', roomIds),
          )

          if (slotResult.error && slotResult.error.code !== 'PGRST116') {
            throw slotResult.error
          }

          const slotRows = Array.isArray(slotResult.data) ? slotResult.data : []
          slotMap = slotRows.reduce((map, row) => {
            const roomId = row?.room_id
            if (!roomId) return map
            if (!map.has(roomId)) {
              map.set(roomId, new Map())
            }
            const roleNameRaw = typeof row?.role === 'string' ? row.role : ''
            const roleName = roleNameRaw.trim() || '역할 미지정'
            const roleMap = map.get(roomId)
            const entry = roleMap.get(roleName) || { total: 0, occupied: 0, ready: 0 }
            entry.total += 1
            if (row?.occupant_owner_id) {
              entry.occupied += 1
            }
            if (row?.occupant_ready) {
              entry.ready += 1
            }
            roleMap.set(roleName, entry)
            return map
          }, new Map())
        }

        const gameIds = Array.from(new Set(roomRows.map((row) => row.game_id).filter(Boolean)))
        let gameMap = new Map()
        if (gameIds.length > 0) {
          const gamesResult = await withTable(supabase, 'rank_games', (table) =>
            supabase.from(table).select('id, name, image_url').in('id', gameIds),
          )

          if (gamesResult.error && gamesResult.error.code !== 'PGRST116') {
            throw gamesResult.error
          }

          const gameRows = Array.isArray(gamesResult.data) ? gamesResult.data : []
          gameMap = new Map(gameRows.map((row) => [row.id, row]))
        }

        const normalized = roomRows.map((row) => {
          const gameMeta = gameMap.get(row.game_id) || null
          const slotStats = slotMap.get(row.id) || null
          const roles = []
          if (slotStats) {
            slotStats.forEach((stats, roleName) => {
              roles.push({
                role: roleName,
                total: stats.total,
                occupied: stats.occupied,
                ready: stats.ready,
              })
            })
            roles.sort((a, b) => a.role.localeCompare(b.role, 'ko', { sensitivity: 'base' }))
          }

          const slotCount = Number.isFinite(Number(row.slot_count)) ? Number(row.slot_count) : 0
          const filledCount = Number.isFinite(Number(row.filled_count)) ? Number(row.filled_count) : 0
          const readyCount = Number.isFinite(Number(row.ready_count)) ? Number(row.ready_count) : 0

          return {
            id: row.id,
            code: row.code || '미지정',
            status: row.status || 'unknown',
            mode: row.mode || '',
            slotCount,
            filledCount,
            readyCount,
            createdAt: row.created_at || null,
            updatedAt: row.updated_at || row.created_at || null,
            gameId: row.game_id || '',
            gameName: (gameMeta?.name || '알 수 없는 게임').trim() || '알 수 없는 게임',
            roles,
          }
        })

        if (!mountedRef.current) return

        setRooms(normalized)
        setLastLoadedAt(new Date())

        if (pendingGameIdRef.current) {
          const target = normalized.find((room) => room.gameId === pendingGameIdRef.current)
          if (target?.gameName) {
            setSearchTerm((prev) => {
              if (!prev || prev === pendingGameIdRef.current) {
                return target.gameName
              }
              return prev
            })
            pendingGameIdRef.current = null
          }
        }
      } catch (loadError) {
        console.error('[RankRoomSearch] 방 목록을 불러오지 못했습니다:', loadError)
        if (!mountedRef.current) return
        setError(resolveErrorMessage(loadError))
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

  const { game: gameQueryParam, gameId: gameIdQueryParam } = router.query || {}

  useEffect(() => {
    if (!router.isReady) return

    if (typeof gameQueryParam === 'string' && gameQueryParam.trim()) {
      setSearchTerm(gameQueryParam.trim())
    }

    if (typeof gameIdQueryParam === 'string' && gameIdQueryParam.trim()) {
      const trimmed = gameIdQueryParam.trim()
      pendingGameIdRef.current = trimmed
      setSearchTerm((prev) => (prev ? prev : trimmed))
    }
  }, [router.isReady, gameQueryParam, gameIdQueryParam])

  const filteredRooms = useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase()
    if (!trimmed) return rooms
    return rooms.filter((room) => {
      const nameMatch = room.gameName?.toLowerCase?.().includes(trimmed)
      if (nameMatch) return true
      const idMatch = room.gameId?.toLowerCase?.().includes(trimmed)
      return Boolean(idMatch)
    })
  }, [rooms, searchTerm])

  const handleRefresh = useCallback(() => {
    loadRooms(true)
  }, [loadRooms])

  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value)
  }, [])

  const refreshDisabled = loading || refreshing
  const refreshLabel = refreshing ? '새로고치는 중…' : '새로고침'

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>방 검색</h1>
            <p style={styles.subtitle}>
              모든 게임의 공개 방을 한눈에 모아두었습니다. 검색창에 게임 이름이나 ID를 입력해 원하는
              매치 방만 빠르게 찾아보세요.
            </p>
          </div>

          <div style={styles.controlsRow}>
            <input
              type="search"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="게임 이름 또는 ID로 필터링"
              style={styles.searchInput}
            />
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshDisabled}
              style={styles.refreshButton(refreshDisabled)}
            >
              {refreshLabel}
            </button>
          </div>

          <div style={styles.linkRow}>
            <Link href="/roster" style={styles.subtleLink}>
              로스터로 돌아가기
            </Link>
            <Link href="/rank" style={styles.subtleLink}>
              랭킹 허브
            </Link>
          </div>

          <div style={styles.summaryRow}>
            <span>총 {rooms.length}개 방</span>
            <span>검색 결과 {filteredRooms.length}개</span>
            {lastLoadedAt ? <span>마지막 업데이트 {formatRelativeTime(lastLoadedAt)}</span> : null}
          </div>
        </header>

        {error ? (
          <div style={styles.errorBox}>
            <p style={styles.errorTitle}>방 목록을 불러오지 못했습니다.</p>
            <p style={styles.errorMessage}>{error}</p>
            <button type="button" style={styles.retryButton} onClick={() => loadRooms(true)}>
              다시 시도
            </button>
          </div>
        ) : null}

        {loading && rooms.length === 0 ? (
          <div style={styles.loadingState}>방 목록을 불러오는 중…</div>
        ) : filteredRooms.length > 0 ? (
          <div style={styles.roomGrid}>
            {filteredRooms.map((room) => {
              const available = Math.max(0, room.slotCount - room.filledCount)
              const modeLabel = formatModeLabel(room.mode)
              const statusLabel = formatStatusLabel(room.status)
              const updatedLabel = formatRelativeTime(room.updatedAt || room.createdAt)

              return (
                <article key={room.id} style={styles.roomCard}>
                  <div style={styles.roomHeader}>
                    <div style={styles.roomTitleGroup}>
                      <h2 style={styles.roomGameName}>{room.gameName}</h2>
                      <p style={styles.roomMeta}>
                        <span>{modeLabel}</span>
                        <span>·</span>
                        <span>{statusLabel}</span>
                      </p>
                    </div>
                    <span style={styles.roomCodeBadge}>코드 {room.code}</span>
                  </div>

                  <p style={styles.roomCounts}>
                    정원 {room.slotCount}명 · 착석 {room.filledCount}명 · 준비 {room.readyCount}명 · 남은 자리 {available}개
                  </p>

                  {room.roles.length ? (
                    <div style={styles.roleGrid}>
                      {room.roles.map((role) => {
                        const remaining = Math.max(0, role.total - role.occupied)
                        return (
                          <div key={`${room.id}-${role.role}`} style={styles.roleChip}>
                            <p style={styles.roleName}>{role.role}</p>
                            <span style={styles.roleCounts}>
                              {role.occupied}/{role.total}명
                              {remaining ? ` · 남은 ${remaining}` : ''}
                            </span>
                            <span style={styles.roleReady}>
                              {role.ready ? `${role.ready}명 준비 완료` : '준비 대기 중'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={styles.emptyRoles}>역할 슬롯 정보가 아직 등록되지 않았습니다.</p>
                  )}

                  <div style={styles.roomFooter}>
                    <span>최근 갱신 {updatedLabel}</span>
                    <span>게임 ID {room.gameId || '미지정'}</span>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>조건에 맞는 방이 없습니다.</p>
            <p style={styles.emptyDescription}>
              검색어를 바꾸거나 새로고침을 눌러 최신 공개 방을 다시 불러와 주세요.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
