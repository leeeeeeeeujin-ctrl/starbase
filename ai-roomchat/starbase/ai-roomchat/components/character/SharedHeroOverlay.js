'use client'

import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import FriendOverlay from '@/components/social/FriendOverlay'
import { supabase } from '@/lib/supabase'
import { withTable } from '@/lib/supabaseTables'
import { getHeroAudioManager } from '@/lib/audio/heroAudioManager'
import { fetchHeroById, normaliseHero } from '@/services/heroes'
import { useHeroSocial } from '@/hooks/social/useHeroSocial'
import { clearHeroSelection, readHeroSelection } from '@/lib/heroes/selectedHeroStorage'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION =
  '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const overlayTabs = [
  { key: 'character', label: '캐릭터' },
  { key: 'abilities', label: '능력' },
  { key: 'stats', label: '통계' },
  { key: 'ranking', label: '랭킹' },
  { key: 'friends', label: '친구' },
  { key: 'search', label: '방 검색' },
]

const searchSortOptions = [
  { key: 'latest', label: '최신순' },
  { key: 'likes', label: '좋아요' },
  { key: 'plays', label: '게임횟수' },
]

const styles = {
  container: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  surface: {
    width: '100%',
    maxWidth: 640,
    padding: '0 16px 18px',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  },
  collapsedSurface: {
    width: '100%',
    maxWidth: 640,
    padding: '0 16px 24px',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  hudSection: {
    borderRadius: 22,
    background: 'rgba(15,23,42,0.82)',
    border: '1px solid rgba(148,163,184,0.15)',
    boxShadow: '0 26px 80px -48px rgba(15,23,42,0.78)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  playerShell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  playerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  playerHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  collapseButton: {
    appearance: 'none',
    border: 'none',
    background: 'rgba(15,23,42,0.65)',
    color: '#bae6fd',
    borderRadius: 14,
    width: 28,
    height: 28,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
  playerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e0f2fe',
  },
  progressBar: {
    position: 'relative',
    flex: 1,
    height: 6,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.35)',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  progressFill: (ratio) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: `${Math.min(Math.max(ratio * 100, 0), 100)}%`,
    background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
  }),
  playerControls: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  playerButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(30,41,59,0.7)',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontWeight: 600,
  },
  expandButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.78)',
    color: '#e2e8f0',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 20px 60px -40px rgba(15,23,42,0.85)',
  },
  dock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  collapseHandleRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  collapseHandleButton: {
    padding: '8px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.65)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
  dockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  dockTabs: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerActionButton: {
    position: 'relative',
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid rgba(96,165,250,0.45)',
    background: 'rgba(30,64,175,0.55)',
    color: '#dbeafe',
    fontWeight: 600,
    cursor: 'pointer',
    minWidth: 88,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    background: '#ef4444',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 18px -10px rgba(239,68,68,0.75)',
  },
  dockTabButton: (active) => ({
    padding: '10px 18px',
    borderRadius: 999,
    border: active ? '1px solid rgba(56,189,248,0.85)' : '1px solid rgba(148,163,184,0.35)',
    background: active ? 'rgba(30,64,175,0.72)' : 'rgba(15,23,42,0.6)',
    color: active ? '#bfdbfe' : '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  }),
  tabContent: {
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'rgba(15,23,42,0.55)',
    padding: '20px 22px',
    color: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 1.7,
    color: '#cbd5f5',
    margin: '4px 0 0',
    whiteSpace: 'pre-line',
  },
  listItem: {
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.55)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  listTitle: {
    fontWeight: 700,
    margin: 0,
  },
  listMeta: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.55)',
    color: '#e2e8f0',
  },
  sortRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  sortButton: (active) => ({
    padding: '8px 14px',
    borderRadius: 999,
    border: active ? '1px solid rgba(56,189,248,0.75)' : '1px solid rgba(148,163,184,0.35)',
    background: active ? 'rgba(30,64,175,0.7)' : 'rgba(15,23,42,0.55)',
    color: active ? '#bfdbfe' : '#e2e8f0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  }),
  gameList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  rankingHeroRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.55)',
  },
  rankingHeroMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: '#e2e8f0',
    fontWeight: 600,
  },
  rankingAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    objectFit: 'cover',
    border: '1px solid rgba(148,163,184,0.35)',
  },
  rankingFallback: {
    width: 44,
    height: 44,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(30,64,175,0.45)',
    color: '#cbd5f5',
    fontWeight: 700,
  },
  rankingButton: {
    padding: '8px 14px',
    borderRadius: 12,
    border: '1px solid rgba(96,165,250,0.4)',
    background: 'rgba(30,64,175,0.55)',
    color: '#dbeafe',
    fontWeight: 600,
    cursor: 'pointer',
  },
  subtleButton: {
    padding: '8px 14px',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.5)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
  settingsRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sliderRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sliderLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#cbd5f5',
  },
  toggleButton: {
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.4)',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontWeight: 600,
  },
}

const profileStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.88)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 80,
    padding: '32px 18px',
    boxSizing: 'border-box',
  },
  panel: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 28,
    background: 'rgba(15,23,42,0.92)',
    border: '1px solid rgba(96,165,250,0.35)',
    boxShadow: '0 48px 120px -64px rgba(14,165,233,0.65)',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  closeButton: {
    position: 'absolute',
    top: 18,
    right: 18,
    border: 'none',
    borderRadius: 999,
    padding: '10px 16px',
    background: 'rgba(15,23,42,0.7)',
    color: '#f8fafc',
    cursor: 'pointer',
    fontWeight: 700,
  },
  heroMedia: {
    position: 'relative',
    width: '100%',
    paddingTop: '150%',
    overflow: 'hidden',
  },
  heroImage: (dimmed) => ({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: dimmed ? 'brightness(0.55)' : 'brightness(1)',
    transition: 'filter 0.3s ease',
  }),
  heroFallback: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 72,
    fontWeight: 800,
    background: 'linear-gradient(135deg, rgba(30,64,175,0.45) 0%, rgba(30,41,59,0.92) 100%)',
  },
  namePlate: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: '20px 22px 26px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.75) 76%, rgba(15,23,42,0.92) 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  namePlateTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    color: '#f8fafc',
  },
  namePlateHint: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
  },
  mediaOverlay: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: '10%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    pointerEvents: 'none',
  },
  mediaText: {
    margin: 0,
    padding: '12px 16px',
    borderRadius: 16,
    background: 'rgba(15,23,42,0.72)',
    color: '#f8fafc',
    fontSize: 15,
    lineHeight: 1.6,
    whiteSpace: 'pre-line',
    textShadow: '0 2px 12px rgba(15,23,42,0.72)',
  },
  body: {
    padding: '22px 24px 26px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  heroName: {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    color: '#f8fafc',
  },
  actionButton: {
    padding: '10px 16px',
    borderRadius: 14,
    border: '1px solid rgba(56,189,248,0.45)',
    background: 'rgba(14,165,233,0.3)',
    color: '#f0f9ff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  statusText: {
    margin: 0,
    fontSize: 13,
    color: '#bae6fd',
  },
  historySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  historyCard: {
    padding: '12px 14px',
    borderRadius: 16,
    background: 'rgba(30,41,59,0.72)',
    border: '1px solid rgba(148,163,184,0.28)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  historyTitle: {
    margin: 0,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  historyMeta: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  loadMoreButton: {
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(96,165,250,0.4)',
    background: 'rgba(30,64,175,0.45)',
    color: '#dbeafe',
    cursor: 'pointer',
    fontWeight: 600,
  },
}

const sampleGames = [
  {
    id: 'g-1',
    title: '시간의 미궁',
    tags: ['추리', '협동'],
    players: 6,
    likes: 128,
    plays: 412,
    createdAt: new Date('2024-04-12').getTime(),
  },
  {
    id: 'g-2',
    title: '하늘섬 레이드',
    tags: ['레이드', '전략'],
    players: 8,
    likes: 256,
    plays: 689,
    createdAt: new Date('2024-05-08').getTime(),
  },
  {
    id: 'g-3',
    title: '은하 결투장',
    tags: ['PvP', '실시간'],
    players: 10,
    likes: 92,
    plays: 533,
    createdAt: new Date('2024-03-30').getTime(),
  },
]

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  return `${minutes}:${remain.toString().padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return '날짜 미확인'
  try {
    const date = new Date(value)
    return `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date
      .getDate()
      .toString()
      .padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`
  } catch (error) {
    return '날짜 미확인'
  }
}

async function fetchHeroBattleHistory(heroId, { limit = 10, offset = 0 } = {}) {
  if (!heroId) {
    return { entries: [], hasMore: false }
  }

  const baseResult = await withTable(supabase, 'rank_battles', (table) =>
    supabase
      .from(table)
      .select(
        'id, game_id, result, score_delta, created_at, attacker_owner_id, defender_owner_id, attacker_hero_ids, defender_hero_ids',
      )
      .order('created_at', { ascending: false })
      .limit(80),
  )

  if (baseResult.error) {
    throw baseResult.error
  }

  const allRows = Array.isArray(baseResult.data) ? baseResult.data : []
  const filtered = allRows.filter((row) => {
    const attackers = Array.isArray(row.attacker_hero_ids) ? row.attacker_hero_ids : []
    const defenders = Array.isArray(row.defender_hero_ids) ? row.defender_hero_ids : []
    return attackers.includes(heroId) || defenders.includes(heroId)
  })

  const slice = filtered.slice(offset, offset + limit)
  const gameIds = Array.from(new Set(slice.map((row) => row.game_id).filter(Boolean)))

  let gameMap = new Map()
  if (gameIds.length) {
    const gamesResult = await withTable(supabase, 'rank_games', (table) =>
      supabase.from(table).select('id,name').in('id', gameIds),
    )
    if (!gamesResult.error) {
      gameMap = new Map((gamesResult.data || []).map((row) => [row.id, row]))
    }
  }

  const entries = slice.map((row) => {
    const attackers = Array.isArray(row.attacker_hero_ids) ? row.attacker_hero_ids : []
    const defenders = Array.isArray(row.defender_hero_ids) ? row.defender_hero_ids : []
    const playedAs = attackers.includes(heroId) ? '공격' : defenders.includes(heroId) ? '수비' : '참전'
    return {
      id: row.id,
      gameId: row.game_id,
      gameName: gameMap.get(row.game_id)?.name || '알 수 없는 게임',
      result: row.result || 'unknown',
      scoreDelta: row.score_delta ?? null,
      createdAt: row.created_at || null,
      role: playedAs,
    }
  })

  return { entries, hasMore: filtered.length > offset + entries.length }
}

function HeroProfileModal({
  hero,
  loading,
  error,
  onClose,
  onAddFriend,
  friendStatus,
  friendBusy,
  history,
  historyLoading,
  historyHasMore,
  onLoadMore,
}) {
  const [overlayState, setOverlayState] = useState({ visible: false, index: 0 })

  const heroName = useMemo(() => {
    if (!hero) return DEFAULT_HERO_NAME
    const trimmed = typeof hero.name === 'string' ? hero.name.trim() : ''
    return trimmed || DEFAULT_HERO_NAME
  }, [hero])

  const description = useMemo(() => {
    if (!hero) return DEFAULT_DESCRIPTION
    const trimmed = typeof hero.description === 'string' ? hero.description.trim() : ''
    return trimmed || DEFAULT_DESCRIPTION
  }, [hero])

  const abilityPairs = useMemo(() => {
    if (!hero) return []
    const normalize = (value) => (typeof value === 'string' ? value.trim() : '')
    const firstPair = [normalize(hero.ability1), normalize(hero.ability2)].filter(Boolean)
    const secondPair = [normalize(hero.ability3), normalize(hero.ability4)].filter(Boolean)
    const pairs = []
    if (firstPair.length) {
      pairs.push({ label: '능력 1 & 2', text: firstPair.join(' / ') })
    }
    if (secondPair.length) {
      pairs.push({ label: '능력 3 & 4', text: secondPair.join(' / ') })
    }
    return pairs
  }, [hero])

  const overlays = useMemo(() => {
    const entries = [
      { label: '소개', text: description },
      ...abilityPairs,
    ]
    return entries.length ? entries : [{ label: '정보 없음', text: DEFAULT_DESCRIPTION }]
  }, [abilityPairs, description])

  const { visible: detailsVisible, index: infoIndex } = overlayState
  const currentOverlay = overlays[infoIndex % overlays.length]

  const handleCycle = useCallback(() => {
    setOverlayState((state) => {
      if (!state.visible) {
        return { visible: true, index: 0 }
      }
      const nextIndex = (state.index + 1) % overlays.length
      if (nextIndex === 0) {
        return { visible: false, index: 0 }
      }
      return { visible: true, index: nextIndex }
    })
  }, [overlays.length])

  useEffect(() => {
    setOverlayState({ visible: false, index: 0 })
  }, [hero?.id])

  return (
    <div style={profileStyles.backdrop} role="dialog" aria-modal>
      <div style={profileStyles.panel}>
        <button type="button" style={profileStyles.closeButton} onClick={onClose}>
          닫기
        </button>

        <div style={profileStyles.heroMedia} role="presentation" onClick={handleCycle}>
          {hero?.image_url ? (
             
            <img src={hero.image_url} alt={heroName} style={profileStyles.heroImage(detailsVisible)} />
          ) : (
            <div style={profileStyles.heroFallback}>{heroName.slice(0, 2)}</div>
          )}
          {detailsVisible ? (
            <div style={profileStyles.mediaOverlay}>
              <p style={profileStyles.mediaText}>{`${currentOverlay.label}\n${currentOverlay.text}`}</p>
            </div>
          ) : (
            <div style={profileStyles.namePlate}>
              <p style={profileStyles.namePlateTitle}>{heroName}</p>
              <p style={profileStyles.namePlateHint}>탭하면 소개와 능력을 차례로 볼 수 있어요</p>
            </div>
          )}
        </div>

        <div style={profileStyles.body}>
          <div style={profileStyles.headerRow}>
            <h2 style={profileStyles.heroName}>{heroName}</h2>
            <button type="button" style={profileStyles.actionButton} onClick={onAddFriend} disabled={friendBusy || !hero}>
              {friendBusy ? '요청 중…' : '친구 요청'}
            </button>
          </div>
          {friendStatus ? <p style={profileStyles.statusText}>{friendStatus}</p> : null}
          {loading ? <p style={profileStyles.statusText}>프로필을 불러오는 중입니다…</p> : null}
          {error ? (
            <p style={profileStyles.statusText} role="alert">
              {error}
            </p>
          ) : null}

          <section style={profileStyles.historySection}>
            <h3 style={profileStyles.historyTitle}>최근 전적</h3>
            {!history.length && !historyLoading ? (
              <p style={profileStyles.statusText}>최근 10게임 기록이 아직 없습니다.</p>
            ) : null}
            {history.map((entry) => (
              <div key={entry.id} style={profileStyles.historyCard}>
                <p style={profileStyles.historyTitle}>{`${entry.gameName} · ${entry.role}`}</p>
                <p style={profileStyles.historyMeta}>{`결과: ${entry.result} · 점수 변화: ${entry.scoreDelta ?? 0}`}</p>
                <p style={profileStyles.historyMeta}>{formatDate(entry.createdAt)}</p>
              </div>
            ))}
            {historyLoading ? <p style={profileStyles.statusText}>전적을 불러오는 중…</p> : null}
            {historyHasMore && !historyLoading ? (
              <button type="button" style={profileStyles.loadMoreButton} onClick={onLoadMore}>
                더 보기
              </button>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}

export default function SharedHeroOverlay() {
  const router = useRouter()
  const audioManager = useMemo(() => getHeroAudioManager(), [])
  const [audioState, setAudioState] = useState(() => audioManager.getState())
  const { enabled: bgmEnabled, isPlaying, progress, duration, volume: bgmVolume } = audioState

  const [currentHero, setCurrentHero] = useState(null)
  const [activeTab, setActiveTab] = useState(0)
  const activeTabKey = overlayTabs[activeTab]?.key ?? 'character'
  const [dockCollapsed, setDockCollapsed] = useState(true)
  const [playerCollapsed, setPlayerCollapsed] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchSort, setSearchSort] = useState('latest')
  const [otherHeroes, setOtherHeroes] = useState([])

  const [profileVisible, setProfileVisible] = useState(false)
  const [profileHero, setProfileHero] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState(null)
  const [profileHistory, setProfileHistory] = useState([])
  const [profileHistoryHasMore, setProfileHistoryHasMore] = useState(false)
  const [profileHistoryLoading, setProfileHistoryLoading] = useState(false)
  const [friendStatus, setFriendStatus] = useState(null)
  const [friendBusy, setFriendBusy] = useState(false)

  const [friendOpen, setFriendOpen] = useState(false)

  const profileOffsetRef = useRef(0)
  const previousAudioRef = useRef(null)

  useEffect(() => audioManager.subscribe(setAudioState), [audioManager])

  const heroName = useMemo(() => {
    if (!currentHero) return DEFAULT_HERO_NAME
    const trimmed = typeof currentHero.name === 'string' ? currentHero.name.trim() : ''
    return trimmed || DEFAULT_HERO_NAME
  }, [currentHero])

  const description = useMemo(() => {
    if (!currentHero) return DEFAULT_DESCRIPTION
    const text = typeof currentHero.description === 'string' ? currentHero.description.trim() : ''
    return text || DEFAULT_DESCRIPTION
  }, [currentHero])

  const abilityPairs = useMemo(() => {
    if (!currentHero) return []
    const normalize = (value) => (typeof value === 'string' ? value.trim() : '')
    const firstPair = [normalize(currentHero.ability1), normalize(currentHero.ability2)].filter(Boolean)
    const secondPair = [normalize(currentHero.ability3), normalize(currentHero.ability4)].filter(Boolean)
    return [
      { label: '능력 1 & 2', entries: firstPair },
      { label: '능력 3 & 4', entries: secondPair },
    ].filter((pair) => pair.entries.length > 0)
  }, [currentHero])

  const viewerHeroHint = useMemo(() => {
    if (!currentHero) return null
    return {
      heroId: currentHero.id,
      heroName,
      avatarUrl: currentHero.image_url || null,
      ownerId: currentHero.owner_id || null,
    }
  }, [currentHero, heroName])

  const {
    viewer,
    friends,
    friendRequests,
    loading: friendLoading,
    error: friendError,
    addFriend,
    removeFriend,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
  } = useHeroSocial({
    heroId: currentHero?.id || null,
    heroName,
    page: `character:${activeTabKey}`,
    viewerHero: viewerHeroHint,
  })

  const [friendSummary, setFriendSummary] = useState({ total: 0, pending: 0 })

  useEffect(() => {
    const total = Array.isArray(friends) ? friends.length : 0
    const incomingCount = Array.isArray(friendRequests?.incoming) ? friendRequests.incoming.length : 0
    const outgoingCount = Array.isArray(friendRequests?.outgoing) ? friendRequests.outgoing.length : 0
    setFriendSummary({ total, pending: incomingCount + outgoingCount })
  }, [friendRequests, friends])

  const loadOtherHeroes = useCallback(async (excludeId) => {
    try {
      const result = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select('id,name,image_url,owner_id,description,ability1,ability2,ability3,ability4,bgm_url,bgm_duration_seconds')
          .order('updated_at', { ascending: false })
          .limit(12),
      )
      if (result.error) {
        console.error('다른 영웅 목록을 불러오지 못했습니다:', result.error)
        setOtherHeroes([])
        return
      }
      const rows = Array.isArray(result.data) ? result.data : []
      const cleaned = rows
        .map(normaliseHero)
        .filter((hero) => hero && hero.id && hero.id !== excludeId)
      setOtherHeroes(cleaned)
    } catch (error) {
      console.error('다른 영웅 목록을 불러오지 못했습니다:', error)
      setOtherHeroes([])
    }
  }, [])

    const loadCurrentHero = useCallback(async () => {
      const selection = readHeroSelection()
      const storedId = selection?.heroId || ''
      if (!storedId) {
        setCurrentHero(null)
        audioManager.setEnabled(false)
        return
      }
      try {
        const heroRow = await fetchHeroById(storedId)
        if (!heroRow) {
          clearHeroSelection()
          setCurrentHero(null)
          audioManager.setEnabled(false)
          return
        }
      setCurrentHero(heroRow)
      const trackUrl = heroRow.bgm_url || null
      const snapshot = audioManager.getState()
      const sameTrack = snapshot.heroId === heroRow.id && snapshot.trackUrl === trackUrl
      const shouldResume = snapshot.isPlaying || !sameTrack
      await audioManager.loadHeroTrack({
        heroId: heroRow.id,
        heroName: heroRow.name,
        trackUrl,
        duration: heroRow.bgm_duration_seconds || 0,
        autoPlay: shouldResume && Boolean(trackUrl),
        loop: true,
      })
      if (trackUrl) {
        audioManager.setEnabled(true, { resume: shouldResume })
      } else {
        audioManager.setEnabled(false)
      }
      loadOtherHeroes(heroRow.id)
    } catch (error) {
      console.error('공유 오버레이용 캐릭터 불러오기 실패:', error)
      setCurrentHero(null)
      audioManager.setEnabled(false)
    }
  }, [audioManager, loadOtherHeroes])

  useEffect(() => {
    loadCurrentHero()
  }, [loadCurrentHero])

  useEffect(() => {
    const handleRefresh = () => {
      loadCurrentHero()
    }
    window.addEventListener('hero-overlay:refresh', handleRefresh)
    return () => {
      window.removeEventListener('hero-overlay:refresh', handleRefresh)
    }
  }, [loadCurrentHero])

  const loadProfileHistory = useCallback(
    async (heroId, { reset = false } = {}) => {
      if (!heroId) return
      const offset = reset ? 0 : profileOffsetRef.current
      if (reset) {
        setProfileHistory([])
        setProfileHistoryHasMore(false)
        profileOffsetRef.current = 0
      }
      setProfileHistoryLoading(true)
      try {
        const { entries, hasMore } = await fetchHeroBattleHistory(heroId, { limit: 10, offset })
        setProfileHistory((prev) => (reset ? entries : [...prev, ...entries]))
        profileOffsetRef.current = offset + entries.length
        setProfileHistoryHasMore(hasMore)
      } catch (error) {
        console.error('전적을 불러오지 못했습니다:', error)
        setProfileError('전적을 불러오지 못했습니다.')
      } finally {
        setProfileHistoryLoading(false)
      }
    },
    [],
  )

  const openProfile = useCallback(
    async (heroId) => {
      if (!heroId) return
      setProfileVisible(true)
      setProfileLoading(true)
      setProfileError(null)
      setFriendStatus(null)
      profileOffsetRef.current = 0
      previousAudioRef.current = audioManager.getState()
      try {
        const heroRow = await fetchHeroById(heroId)
        if (!heroRow) {
          throw new Error('해당 캐릭터를 찾을 수 없습니다.')
        }
        setProfileHero(heroRow)
        const trackUrl = heroRow.bgm_url || null
        await audioManager.loadHeroTrack({
          heroId: heroRow.id,
          heroName: heroRow.name,
          trackUrl,
          duration: heroRow.bgm_duration_seconds || 0,
          autoPlay: Boolean(trackUrl),
          loop: true,
        })
        if (trackUrl) {
          audioManager.setEnabled(true, { resume: true })
        } else {
          audioManager.setEnabled(false)
        }
        await loadProfileHistory(heroRow.id, { reset: true })
      } catch (error) {
        console.error('프로필을 불러오지 못했습니다:', error)
        setProfileError(error?.message || '프로필을 불러오지 못했습니다.')
      } finally {
        setProfileLoading(false)
      }
    },
    [audioManager, loadProfileHistory],
  )

  const closeProfile = useCallback(() => {
    setProfileVisible(false)
    setProfileHero(null)
    setProfileHistory([])
    setProfileError(null)
    profileOffsetRef.current = 0
    const snapshot = previousAudioRef.current
    previousAudioRef.current = null
    if (snapshot && snapshot.heroId) {
      audioManager
        .loadHeroTrack({
          heroId: snapshot.heroId,
          heroName: snapshot.heroName,
          trackUrl: snapshot.trackUrl,
          duration: snapshot.duration || 0,
          autoPlay: snapshot.isPlaying && snapshot.enabled && Boolean(snapshot.trackUrl),
          loop: snapshot.loop,
        })
        .catch(() => {})
      audioManager.setEnabled(snapshot.enabled && Boolean(snapshot.trackUrl), {
        resume: snapshot.isPlaying && snapshot.enabled && Boolean(snapshot.trackUrl),
      })
      if (snapshot.progress) {
        audioManager.seek(snapshot.progress)
      }
    } else {
      loadCurrentHero()
    }
  }, [audioManager, loadCurrentHero])

  useEffect(() => {
    const handleOpen = (event) => {
      const heroId = event?.detail?.heroId
      if (heroId) {
        openProfile(heroId)
      }
    }
    window.addEventListener('shared-hero:open-profile', handleOpen)
    return () => {
      window.removeEventListener('shared-hero:open-profile', handleOpen)
    }
  }, [openProfile])

  const filteredGames = useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase()
    const base = !trimmed
      ? sampleGames
      : sampleGames.filter((game) => {
          const haystack = `${game.title} ${game.tags.join(' ')}`.toLowerCase()
          return haystack.includes(trimmed)
        })

    const sorted = [...base]
    if (searchSort === 'latest') {
      sorted.sort((a, b) => b.createdAt - a.createdAt)
    }
    if (searchSort === 'likes') {
      sorted.sort((a, b) => b.likes - a.likes)
    }
    if (searchSort === 'plays') {
      sorted.sort((a, b) => b.plays - a.plays)
    }
    return sorted
  }, [searchSort, searchTerm])

  const overlayBody = useMemo(() => {
    if (activeTabKey === 'character') {
      return (
        <div style={styles.tabContent}>
          <div>
            <p style={styles.infoTitle}>{heroName}</p>
            <p style={styles.infoText}>{description}</p>
          </div>
          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={() => currentHero?.id && router.push(`/character/${currentHero.id}`)}
            >
              캐릭터 창으로 이동
            </button>
          </div>
        </div>
      )
    }

    if (activeTabKey === 'abilities') {
      return (
        <div style={styles.tabContent}>
          <p style={styles.infoTitle}>능력 정보</p>
          {abilityPairs.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {abilityPairs.map((pair) => (
                <div key={pair.label} style={styles.listItem}>
                  <p style={styles.listTitle}>{pair.label}</p>
                  <p style={styles.listMeta}>{pair.entries.join(' / ')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.listMeta}>등록된 능력이 없습니다.</p>
          )}
        </div>
      )
    }

    if (activeTabKey === 'stats') {
      return (
        <div style={styles.tabContent}>
          <p style={styles.infoTitle}>통계 요약</p>
          <p style={styles.infoText}>
            전체 승률과 평균 점수는 추후 랭킹 게임 데이터와 함께 제공될 예정입니다. 캐릭터 화면에서 자세한 전투 기록을 확인해
            주세요.
          </p>
          <div style={styles.listItem}>
            <p style={styles.listTitle}>참여 중인 게임</p>
            <p style={styles.listMeta}>
              {Array.isArray(currentHero?.tags) && currentHero.tags.length
                ? currentHero.tags.join(' / ')
                : '등록된 게임 태그가 없습니다.'}
            </p>
          </div>
        </div>
      )
    }

    if (activeTabKey === 'ranking') {
      return (
        <div style={styles.tabContent}>
          <p style={styles.infoTitle}>다른 영웅 살펴보기</p>
          <p style={styles.infoText}>프로필을 열어 친구 추가와 전적을 확인해 보세요.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {otherHeroes.length ? (
              otherHeroes.map((hero) => (
                <div key={hero.id} style={styles.rankingHeroRow}>
                  <div style={styles.rankingHeroMeta}>
                    {hero.image_url ? (
                       
                      <img src={hero.image_url} alt={hero.name} style={styles.rankingAvatar} />
                    ) : (
                      <div style={styles.rankingFallback}>{hero.name.slice(0, 2)}</div>
                    )}
                    <span>{hero.name}</span>
                  </div>
                  <button type="button" style={styles.rankingButton} onClick={() => openProfile(hero.id)}>
                    프로필 보기
                  </button>
                </div>
              ))
            ) : (
              <p style={styles.listMeta}>아직 불러온 영웅이 없습니다.</p>
            )}
          </div>
        </div>
      )
    }

    if (activeTabKey === 'friends') {
      const previewFriends = Array.isArray(friends) ? friends.slice(0, 3) : []
      const pendingText =
        friendSummary.pending > 0 ? `대기 중인 요청 ${friendSummary.pending}건` : '대기 중인 요청 없음'

      return (
        <div style={styles.tabContent}>
          <p style={styles.infoTitle}>친구 현황</p>
          <p style={styles.listMeta}>{`등록된 친구 ${friendSummary.total}명 · ${pendingText}`}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {previewFriends.map((friend) => {
              const heroName =
                friend.friendHeroName || friend.currentHeroName || friend.displayName || friend.username || '친구'
              const status = friend.online ? '온라인' : '오프라인'
              return (
                <div key={`${friend.friendOwnerId || friend.ownerId || heroName}`} style={styles.listItem}>
                  <p style={styles.listTitle}>{heroName}</p>
                  <p style={styles.listMeta}>{status}</p>
                </div>
              )
            })}
            {!previewFriends.length ? <p style={styles.listMeta}>친구가 아직 없습니다.</p> : null}
          </div>
          <div style={styles.buttonRow}>
            <button type="button" style={styles.primaryButton} onClick={() => setFriendOpen(true)}>
              친구창 열기
            </button>
          </div>
        </div>
      )
    }

    if (activeTabKey === 'search') {
      return (
        <div style={styles.tabContent}>
          <input
            style={styles.searchInput}
            placeholder="게임 이름이나 태그를 검색해 보세요"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <div style={styles.sortRow}>
            {searchSortOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                style={styles.sortButton(searchSort === option.key)}
                onClick={() => setSearchSort(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div style={styles.gameList}>
            {filteredGames.map((game) => (
              <div key={game.id} style={styles.listItem}>
                <p style={styles.listTitle}>{game.title}</p>
                <p style={styles.listMeta}>{`${game.players}인 · ${game.tags.join(' / ')}`}</p>
              </div>
            ))}
          </div>
        </div>
      )
    }

    return null
  }, [
    activeTabKey,
    abilityPairs,
    description,
    filteredGames,
    friendSummary.pending,
    friendSummary.total,
    friends,
    heroName,
    openProfile,
    otherHeroes,
    searchSort,
    searchTerm,
    setFriendOpen,
    currentHero?.id,
    currentHero?.tags,
    router,
  ])

  const activeBgmUrl = currentHero?.bgm_url || null

  const handleSeek = useCallback(
    (event) => {
      if (!duration) return
      const rect = event.currentTarget.getBoundingClientRect()
      const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
      const next = ratio * duration
      audioManager.seek(next)
    },
    [audioManager, duration],
  )

  const togglePlayback = useCallback(() => {
    if (!activeBgmUrl) return
    audioManager.toggle()
  }, [audioManager, activeBgmUrl])

  const stopPlayback = useCallback(() => {
    audioManager.stop()
  }, [audioManager])

  const handleFriendRequest = useCallback(async () => {
    if (!profileHero?.id) return
    if (!viewer?.user_id) {
      setFriendStatus('로그인 후 이용할 수 있습니다.')
      return
    }
    setFriendBusy(true)
    try {
      const result = await addFriend({ heroId: profileHero.id })
      if (result?.ok) {
        setFriendStatus('친구 요청을 보냈습니다.')
      } else if (result?.error) {
        setFriendStatus(result.error)
      } else {
        setFriendStatus('친구 요청을 보내지 못했습니다.')
      }
    } catch (error) {
      setFriendStatus(error?.message || '친구 요청을 보내지 못했습니다.')
    } finally {
      setFriendBusy(false)
    }
  }, [addFriend, profileHero, viewer?.user_id])

  if (!currentHero) {
    return null
  }

  return (
    <>
      <div style={styles.container}>
        <div style={dockCollapsed ? styles.collapsedSurface : styles.surface}>
          {dockCollapsed ? (
            <button
              type="button"
              style={styles.expandButton}
              onClick={() => setDockCollapsed(false)}
              aria-label="패널 펼치기"
            >
              ▲
            </button>
          ) : (
            <>
              <div style={styles.collapseHandleRow}>
                <button
                  type="button"
                  style={styles.collapseHandleButton}
                  onClick={() => setDockCollapsed(true)}
                  aria-label="패널 접기"
                >
                  ▼ 패널 접기
                </button>
              </div>

              {bgmEnabled && activeBgmUrl ? (
                <div style={styles.hudSection}>
                  <div style={styles.playerShell}>
                    <div style={styles.playerHeader}>
                      <div style={styles.playerHeaderLeft}>
                        <button
                          type="button"
                          style={styles.collapseButton}
                          onClick={() => setPlayerCollapsed((prev) => !prev)}
                        >
                          {playerCollapsed ? '▲' : '▼'}
                        </button>
                        <span style={styles.playerTitle}>캐릭터 브금</span>
                      </div>
                      {!playerCollapsed ? (
                        <>
                          <div style={styles.progressBar} role="presentation" onClick={handleSeek}>
                            <div style={styles.progressFill(duration ? progress / duration : 0)} />
                          </div>
                          <span style={styles.listMeta}>{`${formatTime(progress)} / ${formatTime(duration)}`}</span>
                        </>
                      ) : null}
                    </div>
                    {!playerCollapsed ? (
                      <div style={styles.playerControls}>
                        <button type="button" style={styles.playerButton} onClick={togglePlayback}>
                          {isPlaying ? '일시정지' : '재생'}
                        </button>
                        <button type="button" style={styles.playerButton} onClick={stopPlayback}>
                          처음으로
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div style={styles.hudSection}>
                <div style={styles.dock}>
                  <div style={styles.dockHeader}>
                    <div style={styles.dockTabs}>
                      {overlayTabs.map((tab, index) => (
                        <button
                          key={tab.key}
                          type="button"
                          style={styles.dockTabButton(index === activeTab)}
                          onClick={() => setActiveTab(index)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <div style={styles.headerActions}>
                      <button type="button" style={styles.headerActionButton} onClick={() => setFriendOpen(true)}>
                        친구창 열기
                      </button>
                      <button
                        type="button"
                        style={styles.headerActionButton}
                        onClick={() => currentHero?.id && router.push(`/character/${currentHero.id}`)}
                      >
                        캐릭터 화면
                      </button>
                    </div>
                  </div>

                  {overlayBody}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {profileVisible ? (
        <HeroProfileModal
          hero={profileHero}
          loading={profileLoading}
          error={profileError}
          onClose={closeProfile}
          onAddFriend={handleFriendRequest}
          friendStatus={friendStatus}
          friendBusy={friendBusy}
          history={profileHistory}
          historyLoading={profileHistoryLoading}
          historyHasMore={profileHistoryHasMore}
          onLoadMore={() => profileHero?.id && loadProfileHistory(profileHero.id)}
        />
      ) : null}

      <FriendOverlay
        open={friendOpen}
        onClose={() => setFriendOpen(false)}
        viewer={viewer}
        friends={friends}
        friendRequests={friendRequests}
        loading={friendLoading}
        error={friendError}
        onAddFriend={addFriend}
        onRemoveFriend={removeFriend}
        onAcceptRequest={acceptFriendRequest}
        onDeclineRequest={declineFriendRequest}
        onCancelRequest={cancelFriendRequest}
      />
    </>
  )
}
