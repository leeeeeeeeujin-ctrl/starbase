'use client'

import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getHeroAudioManager } from '@/lib/audio/heroAudioManager'
import { fetchHeroById } from '@/services/heroes'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION =
  '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const overlayTabs = [
  { key: 'character', label: '캐릭터' },
  { key: 'search', label: '방 검색' },
  { key: 'create', label: '게임 제작' },
  { key: 'register', label: '게임 등록' },
  { key: 'ranking', label: '랭킹' },
  { key: 'settings', label: '설정' },
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
  },
  playerHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  collapseButton: {
    border: '1px solid rgba(148,163,184,0.35)',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    padding: '6px 12px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  playerTitle: {
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  progressBar: {
    flex: 1,
    height: 6,
    background: 'rgba(148, 163, 184, 0.28)',
    borderRadius: 999,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  progressFill: (ratio) => ({
    width: `${Math.min(Math.max(ratio * 100, 0), 100)}%`,
    height: '100%',
    background: 'linear-gradient(90deg, rgba(96,165,250,0.65) 0%, rgba(56,189,248,0.92) 100%)',
  }),
  listMeta: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: 500,
  },
  playerControls: {
    display: 'flex',
    gap: 12,
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
  dock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  dockToggleRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  dockToggleButton: {
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
  dockTabButton: (active) => ({
    padding: '10px 18px',
    borderRadius: 999,
    border: active ? '1px solid rgba(56,189,248,0.85)' : '1px solid rgba(148,163,184,0.35)',
    background: active ? 'rgba(30,64,175,0.72)' : 'rgba(15,23,42,0.6)',
    color: active ? '#bfdbfe' : '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  }),
  dockActions: {
    display: 'flex',
    gap: 8,
  },
  rosterButton: {
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  battleButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'linear-gradient(135deg, rgba(59,130,246,0.92) 0%, rgba(14,165,233,0.88) 100%)',
    color: '#f8fafc',
    fontWeight: 700,
    cursor: 'pointer',
  },
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
  },
  listItem: {
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.55)',
  },
  listTitle: {
    fontWeight: 700,
    margin: 0,
  },
  listMeta: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#94a3b8',
  },
  sliderRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sliderLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#cbd5f5',
  },
  buttonRow: {
    display: 'flex',
    gap: 12,
  },
  ghostButton: {
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.4)',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontWeight: 600,
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

const rankingEntries = [
  { id: 'r-1', name: '별빛의 수호자', score: 12850 },
  { id: 'r-2', name: '은빛의 방패', score: 12140 },
  { id: 'r-3', name: '그림자 추적자', score: 11080 },
]

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  return `${minutes}:${remain.toString().padStart(2, '0')}`
}

export default function SharedHeroOverlay() {
  const router = useRouter()
  const audioManager = useMemo(() => getHeroAudioManager(), [])
  const [audioState, setAudioState] = useState(() => audioManager.getState())
  const { enabled: bgmEnabled, isPlaying, progress, duration, volume: bgmVolume } = audioState
  const [currentHero, setCurrentHero] = useState(null)
  const [activeTab, setActiveTab] = useState(0)
  const [dockCollapsed, setDockCollapsed] = useState(true)
  const [playerCollapsed, setPlayerCollapsed] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchSort, setSearchSort] = useState('latest')

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

  const activeBgmUrl = currentHero?.bgm_url || null

  const lastHeroIdRef = useRef(null)

  useEffect(() => audioManager.subscribe(setAudioState), [audioManager])

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

  const loadHero = useCallback(async () => {
    if (typeof window === 'undefined') return
    const storedId = window.localStorage.getItem('selectedHeroId')
    if (!storedId) {
      setCurrentHero(null)
      return
    }
    try {
      const heroRow = await fetchHeroById(storedId)
      if (heroRow) {
        setCurrentHero(heroRow)
        const heroTrackKey = `${heroRow.id}:${heroRow.bgm_url || ''}`
        if (lastHeroIdRef.current !== heroTrackKey) {
          lastHeroIdRef.current = heroTrackKey
          audioManager.loadHeroTrack({
            heroId: heroRow.id,
            heroName: heroRow.name,
            trackUrl: heroRow.bgm_url || null,
            duration: heroRow.bgm_duration_seconds || 0,
            autoPlay: Boolean(heroRow.bgm_url),
            loop: true,
          })
          audioManager.setEnabled(Boolean(heroRow.bgm_url))
        }
      } else {
        setCurrentHero(null)
        audioManager.setEnabled(false)
      }
    } catch (error) {
      console.error('공유 오버레이용 캐릭터 불러오기 실패:', error)
      setCurrentHero(null)
      audioManager.setEnabled(false)
    }
  }, [audioManager])

  useEffect(() => {
    loadHero()
  }, [loadHero])

  useEffect(() => {
    const handleRefresh = () => {
      loadHero()
    }
    window.addEventListener('hero-overlay:refresh', handleRefresh)
    return () => {
      window.removeEventListener('hero-overlay:refresh', handleRefresh)
    }
  }, [loadHero])

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

  const activeTabKey = overlayTabs[activeTab]?.key ?? 'character'

  const overlayBody = useMemo(() => {
    if (activeTabKey === 'character') {
      return (
        <div style={styles.tabContent}>
          <div>
            <p style={styles.infoTitle}>{heroName}</p>
            <p style={styles.infoText}>{description}</p>
          </div>
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

    if (activeTabKey === 'create') {
      return (
        <div style={styles.tabContent}>
          <div>
            <p style={styles.infoTitle}>게임 제작 허브</p>
            <p style={styles.infoText}>
              제작 흐름을 빠르게 살펴보고 바로 제작 페이지로 이동하세요.
            </p>
          </div>
          <div style={styles.buttonRow}>
            <button type="button" style={styles.ghostButton} onClick={() => router.push('/create')}>
              제작 화면 열기
            </button>
            <button type="button" style={styles.ghostButton} onClick={() => router.push('/rank/new')}>
              등록 화면 이동
            </button>
          </div>
        </div>
      )
    }

    if (activeTabKey === 'register') {
      return (
        <div style={styles.tabContent}>
          <p style={styles.infoTitle}>등록 체크리스트</p>
          <div style={styles.gameList}>
            <div style={styles.listItem}>
              <p style={styles.listTitle}>필수 자료</p>
              <p style={styles.listMeta}>썸네일, 게임 소개, 역할 구성, 패치 노트</p>
            </div>
            <div style={styles.listItem}>
              <p style={styles.listTitle}>등록 절차</p>
              <p style={styles.listMeta}>검수 요청 후 승인 알림을 기다려 주세요.</p>
            </div>
          </div>
        </div>
      )
    }

    if (activeTabKey === 'ranking') {
      return (
        <div style={styles.tabContent}>
          <p style={styles.infoTitle}>시즌 랭킹</p>
          <div style={styles.gameList}>
            {rankingEntries.map((entry, index) => (
              <div key={entry.id} style={styles.listItem}>
                <p style={styles.listTitle}>{`${index + 1}위 · ${entry.name}`}</p>
                <p style={styles.listMeta}>{`점수 ${entry.score.toLocaleString()}점`}</p>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTabKey === 'settings') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.ghostButton}
              onClick={() => audioManager.setEnabled(!bgmEnabled)}
            >
              {bgmEnabled ? '브금 끄기' : '브금 켜기'}
            </button>
          </div>
          <div style={styles.sliderRow}>
            <label style={styles.sliderLabel}>
              볼륨
              <span>{`${Math.round(bgmVolume * 100)}%`}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(bgmVolume * 100)}
              onChange={(event) => audioManager.setVolume(Number(event.target.value) / 100)}
            />
          </div>
        </div>
      )
    }

    return null
  }, [
    activeTabKey,
    abilityPairs,
    audioManager,
    bgmEnabled,
    bgmVolume,
    description,
    filteredGames,
    heroName,
    router,
    searchSort,
    searchTerm,
  ])

  if (!currentHero) {
    return null
  }

  return (
    <div style={styles.container}>
      <div style={styles.surface}>
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
          <div style={styles.dockToggleRow}>
            <button type="button" style={styles.dockToggleButton} onClick={() => setDockCollapsed((prev) => !prev)}>
              {dockCollapsed ? '▲ 패널 펼치기' : '▼ 패널 접기'}
            </button>
          </div>

          {!dockCollapsed ? (
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
                <div style={styles.dockActions}>
                  <button type="button" style={styles.rosterButton} onClick={() => router.push('/roster')}>
                    로스터로
                  </button>
                  {activeTabKey === 'character' ? (
                    <button type="button" style={styles.battleButton}>
                      전투 시작
                    </button>
                  ) : null}
                </div>
              </div>

              {overlayBody}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
