'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION =
  '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const pageStyles = {
  base: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 18px 260px',
    boxSizing: 'border-box',
    background:
      'linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.82) 45%, rgba(15,23,42,0.92) 100%)',
    color: '#f8fafc',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 18px 260px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.78) 60%, rgba(15,23,42,0.9) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
}

const overlayTabs = [
  { key: 'character', label: '캐릭터' },
  { key: 'search', label: '방 검색' },
  { key: 'ranking', label: '랭킹' },
  { key: 'settings', label: '설정' },
]

const styles = {
  stage: {
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  },
  heroCardShell: {
    width: '100%',
    maxWidth: 520,
    position: 'relative',
  },
  heroCard: {
    position: 'relative',
    width: '100%',
    paddingTop: '160%',
    borderRadius: 36,
    overflow: 'hidden',
    border: '1px solid rgba(96,165,250,0.32)',
    background: 'rgba(15,23,42,0.62)',
    boxShadow: '0 46px 120px -60px rgba(37,99,235,0.4)',
    cursor: 'pointer',
    outline: 'none',
  },
  heroImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'filter 0.3s ease',
  },
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
  heroNameOverlay: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '100%',
    padding: '30px 32px 36px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.65) 68%, rgba(15,23,42,0.82) 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  heroNameBadge: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  tapHint: {
    position: 'absolute',
    top: 18,
    right: 18,
    padding: '10px 16px',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.72)',
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    boxShadow: '0 18px 40px -32px rgba(15,23,42,0.9)',
  },
  overlaySurface: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: '10%',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    pointerEvents: 'none',
  },
  overlayTextBlock: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.7,
    color: '#f8fafc',
    textShadow: '0 2px 12px rgba(15,23,42,0.72)',
    whiteSpace: 'pre-line',
  },
  cornerIcon: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 32,
    height: 32,
    borderRadius: 14,
    background: 'rgba(15,23,42,0.58)',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    gap: 3,
    padding: 6,
    boxShadow: '0 14px 30px -22px rgba(15,23,42,0.8)',
  },
  cornerDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: 'rgba(226,232,240,0.78)',
  },
  dock: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 36,
    padding: '32px 26px 32px',
    boxSizing: 'border-box',
    background: 'rgba(15,23,42,0.82)',
    border: '1px solid rgba(96,165,250,0.28)',
    boxShadow: '0 44px 120px -70px rgba(37,99,235,0.55)',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  dockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  battleButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 18,
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.6,
    background: 'linear-gradient(135deg, #f97316 0%, #facc15 100%)',
    color: '#0f172a',
    cursor: 'pointer',
    boxShadow: '0 18px 42px -24px rgba(250,204,21,0.7)',
  },
  dockTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  dockTabButton: (active) => ({
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: active ? '#0f172a' : '#e2e8f0',
    background: active ? '#38bdf8' : 'rgba(51,65,85,0.62)',
    cursor: 'pointer',
    transition: 'all 0.24s ease',
  }),
  tabContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  infoBlock: {
    background: 'rgba(15,23,42,0.62)',
    borderRadius: 24,
    padding: '20px 22px',
    border: '1px solid rgba(94, 234, 212, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  infoTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#bae6fd',
  },
  infoText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.7,
    color: '#e2e8f0',
    whiteSpace: 'pre-line',
  },
  buttonRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  ghostButton: {
    appearance: 'none',
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.45)',
    color: '#e2e8f0',
    borderRadius: 16,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  playerShell: {
    background: 'rgba(8,47,73,0.68)',
    borderRadius: 22,
    padding: '16px 18px',
    border: '1px solid rgba(56,189,248,0.32)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    pointerEvents: 'auto',
  },
  playerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
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
    width: 32,
    height: 32,
    cursor: 'pointer',
    fontSize: 16,
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
    height: 8,
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
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  playerButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '8px 16px',
    background: 'rgba(15,23,42,0.68)',
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  playerMessage: {
    margin: 0,
    fontSize: 13,
    color: '#e2e8f0',
  },
  hudContainer: {
    position: 'fixed',
    left: '50%',
    bottom: 18,
    transform: 'translateX(-50%)',
    width: 'min(560px, calc(100% - 24px))',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    zIndex: 40,
    pointerEvents: 'none',
  },
  hudSection: {
    pointerEvents: 'auto',
  },
  dockContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  dockToggleRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  dockToggleButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 14,
    padding: '6px 12px',
    background: 'rgba(15,23,42,0.65)',
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 10px 26px -20px rgba(14,116,144,0.75)',
  },
  sliderRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sliderLabel: {
    fontSize: 13,
    color: '#cbd5f5',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rangeInput: {
    width: '100%',
  },
  advancedPanel: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    marginTop: 8,
  },
  eqColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  eqSlider: {
    writingMode: 'bt-lr',
    WebkitAppearance: 'slider-vertical',
    height: 120,
  },
  searchGrid: {
    display: 'grid',
    gap: 16,
  },
  searchActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  searchButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 16,
    padding: '10px 16px',
    background: 'rgba(59,130,246,0.3)',
    color: '#e0f2fe',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  listItem: {
    padding: '12px 16px',
    borderRadius: 16,
    background: 'rgba(30,41,59,0.76)',
    border: '1px solid rgba(71,85,105,0.6)',
  },
  listTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  listMeta: {
    margin: '6px 0 0',
    fontSize: 12,
    color: 'rgba(148,163,184,0.85)',
  },
  rankingList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  settingsForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  textField: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  textareaField: {
    width: '100%',
    minHeight: 120,
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  formActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
}

export default function CharacterBasicView({ hero }) {
  const heroName = useMemo(() => {
    if (!hero) return DEFAULT_HERO_NAME
    const trimmed = typeof hero.name === 'string' ? hero.name.trim() : ''
    return trimmed || DEFAULT_HERO_NAME
  }, [hero])

  const description = useMemo(() => {
    if (!hero) return DEFAULT_DESCRIPTION
    const text = typeof hero.description === 'string' ? hero.description.trim() : ''
    return text || DEFAULT_DESCRIPTION
  }, [hero])

  const abilityPairs = useMemo(() => {
    if (!hero) {
      return []
    }

    const normalize = (value) => (typeof value === 'string' ? value.trim() : '')
    const firstPair = [normalize(hero.ability1), normalize(hero.ability2)].filter(Boolean)
    const secondPair = [normalize(hero.ability3), normalize(hero.ability4)].filter(Boolean)

    return [
      { label: '능력 1 & 2', entries: firstPair },
      { label: '능력 3 & 4', entries: secondPair },
    ].filter((pair) => pair.entries.length > 0)
  }, [hero])

  const [viewMode, setViewMode] = useState(0)
  const [activeTab, setActiveTab] = useState(0)
  const [bgmEnabled, setBgmEnabled] = useState(Boolean(hero?.bgm_url))
  const [isPlaying, setIsPlaying] = useState(false)
  const [repeatEnabled, setRepeatEnabled] = useState(true)
  const [playerCollapsed, setPlayerCollapsed] = useState(false)
  const [dockCollapsed, setDockCollapsed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [selectedBgmName, setSelectedBgmName] = useState('')
  const [customBgmUrl, setCustomBgmUrl] = useState(null)
  const [bassBoost, setBassBoost] = useState(0)
  const [trebleBoost, setTrebleBoost] = useState(0)
  const [clarityBoost, setClarityBoost] = useState(0)
  const [advancedMixing, setAdvancedMixing] = useState(false)
  const [eqBands, setEqBands] = useState([0, 0, 0, 0, 0])
  const [reverbDetail, setReverbDetail] = useState({ roomSize: 35, damping: 40 })
  const [compressorDetail, setCompressorDetail] = useState({ threshold: -24, release: 250 })
  const [isEditing, setIsEditing] = useState(false)
  const [draftHero, setDraftHero] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fileInputRef = useRef(null)
  const audioRef = useRef(null)
  const repeatEnabledRef = useRef(repeatEnabled)
  const previousCustomUrl = useRef(null)

  useEffect(() => {
    setViewMode(0)
    setActiveTab(0)
    setBgmEnabled(Boolean(hero?.bgm_url))
    setIsPlaying(false)
    setRepeatEnabled(true)
    setPlayerCollapsed(false)
    setProgress(0)
    setDuration(0)
    setSelectedBgmName('')
    setCustomBgmUrl(null)
    setBassBoost(0)
    setTrebleBoost(0)
    setClarityBoost(0)
    setAdvancedMixing(false)
    setEqBands([0, 0, 0, 0, 0])
    setReverbDetail({ roomSize: 35, damping: 40 })
    setCompressorDetail({ threshold: -24, release: 250 })
    setIsEditing(false)
    setDraftHero(
      hero
        ? {
            name: hero.name || '',
            description: hero.description || '',
            ability1: hero.ability1 || '',
            ability2: hero.ability2 || '',
            ability3: hero.ability3 || '',
            ability4: hero.ability4 || '',
            background: hero.background_url || '',
            bgm: hero.bgm_url || '',
          }
        : null,
    )
    setSearchTerm('')
  }, [hero?.id])

  useEffect(() => {
    repeatEnabledRef.current = repeatEnabled
    if (audioRef.current) {
      audioRef.current.loop = repeatEnabled
    }
  }, [repeatEnabled])

  useEffect(() => {
    if (previousCustomUrl.current && previousCustomUrl.current !== customBgmUrl) {
      URL.revokeObjectURL(previousCustomUrl.current)
    }
    previousCustomUrl.current = customBgmUrl
    return () => {
      if (previousCustomUrl.current) {
        URL.revokeObjectURL(previousCustomUrl.current)
      }
    }
  }, [customBgmUrl])

  const activeBgmUrl = customBgmUrl || hero?.bgm_url || null

  useEffect(() => {
    if (!activeBgmUrl || !bgmEnabled) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
      setIsPlaying(false)
      setProgress(0)
      setDuration(0)
      return
    }

    const audio = new Audio(activeBgmUrl)
    audio.loop = repeatEnabledRef.current
    audioRef.current = audio

    const handleLoaded = () => {
      const metaDuration = Number.isFinite(audio.duration) ? audio.duration : 0
      setDuration(metaDuration)
    }

    const handleTime = () => {
      setProgress(audio.currentTime)
    }

    const handleEnded = () => {
      setProgress(audio.duration || 0)
      if (!repeatEnabledRef.current) {
        setIsPlaying(false)
      }
    }

    audio.addEventListener('loadedmetadata', handleLoaded)
    audio.addEventListener('timeupdate', handleTime)
    audio.addEventListener('ended', handleEnded)

    const startPlayback = async () => {
      try {
        await audio.play()
        setIsPlaying(true)
      } catch (error) {
        setIsPlaying(false)
      }
    }

    startPlayback()

    return () => {
      audio.pause()
      audio.currentTime = 0
      audio.removeEventListener('loadedmetadata', handleLoaded)
      audio.removeEventListener('timeupdate', handleTime)
      audio.removeEventListener('ended', handleEnded)
      if (audioRef.current === audio) {
        audioRef.current = null
      }
    }
  }, [activeBgmUrl, bgmEnabled])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.play().catch(() => {
        setIsPlaying(false)
      })
    } else {
      audio.pause()
    }
  }, [isPlaying])

  const backgroundStyle = hero?.background_url
    ? pageStyles.withBackground(hero.background_url)
    : pageStyles.base

  const overlayModes = useMemo(() => {
    const modes = ['name', 'description']
    if (!abilityPairs.length) {
      modes.push('ability-empty')
    } else {
      abilityPairs.forEach((_, index) => {
        modes.push(`ability-${index}`)
      })
    }
    return modes
  }, [abilityPairs])

  const currentOverlayMode = overlayModes[viewMode] || 'name'

  const imageStyle = {
    ...styles.heroImage,
    filter: currentOverlayMode === 'name' ? 'none' : 'brightness(0.72)',
  }

  const handleTap = () => {
    if (!overlayModes.length) return
    setViewMode((prev) => (prev + 1) % overlayModes.length)
  }

  const formatTime = (value) => {
    if (!value || Number.isNaN(value)) return '0:00'
    const minutes = Math.floor(value / 60)
    const seconds = Math.floor(value % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handleSeek = (event) => {
    if (!duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    const clamped = Math.min(Math.max(ratio, 0), 1)
    const audio = audioRef.current
    if (audio) {
      const nextTime = clamped * duration
      audio.currentTime = nextTime
      setProgress(nextTime)
    }
  }

  const togglePlayback = () => {
    if (!activeBgmUrl) return
    setIsPlaying((prev) => !prev)
  }

  const stopPlayback = () => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setProgress(0)
    setIsPlaying(false)
  }

  const handleBgmToggle = () => {
    setBgmEnabled((prev) => !prev)
  }

  const handleRepeatToggle = () => {
    setRepeatEnabled((prev) => !prev)
  }

  const handleBgmFileButton = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleBgmFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const nextUrl = URL.createObjectURL(file)
    setCustomBgmUrl(nextUrl)
    setSelectedBgmName(file.name)
    setBgmEnabled(true)
    setProgress(0)
    setDuration(0)
    setIsPlaying(true)
    // reset input so same file can be chosen again
    // eslint-disable-next-line no-param-reassign
    event.target.value = ''
  }

  const handleDraftChange = (field, value) => {
    setDraftHero((prev) =>
      prev
        ? {
            ...prev,
            [field]: value,
          }
        : prev,
    )
  }

  const resetDraftToHero = () => {
    setDraftHero(
      hero
        ? {
            name: hero.name || '',
            description: hero.description || '',
            ability1: hero.ability1 || '',
            ability2: hero.ability2 || '',
            ability3: hero.ability3 || '',
            ability4: hero.ability4 || '',
            background: hero.background_url || '',
            bgm: hero.bgm_url || '',
          }
        : null,
    )
  }

  const handleSaveDraft = () => {
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    resetDraftToHero()
    setIsEditing(false)
  }

  const sampleGames = useMemo(
    () => [
      { id: 'g-1', title: '시간의 미궁', tags: ['추리', '협동'], players: 6, likes: 128 },
      { id: 'g-2', title: '하늘섬 레이드', tags: ['레이드', '전략'], players: 8, likes: 256 },
      { id: 'g-3', title: '은하 결투장', tags: ['PvP', '실시간'], players: 10, likes: 92 },
      { id: 'g-4', title: '꿈의 정원', tags: ['힐링', '건설'], players: 4, likes: 64 },
    ],
    [],
  )

  const filteredGames = useMemo(() => {
    if (!searchTerm.trim()) return sampleGames
    const term = searchTerm.trim().toLowerCase()
    return sampleGames.filter((game) => {
      const target = `${game.title} ${game.tags.join(' ')}`.toLowerCase()
      return target.includes(term)
    })
  }, [sampleGames, searchTerm])

  const rankingEntries = useMemo(
    () => [
      { id: 'r-1', name: '아크메이지', score: 9820 },
      { id: 'r-2', name: '용맹한 기사', score: 9350 },
      { id: 'r-3', name: '그림자 추적자', score: 8890 },
      { id: 'r-4', name: '별빛 수호자', score: 8520 },
    ],
    [],
  )

  const activeTabKey = overlayTabs[activeTab]?.key ?? 'character'
  const progressRatio = duration ? progress / duration : 0
  const eqLabels = ['32Hz', '125Hz', '500Hz', '2kHz', '8kHz']

  const overlayBody = (() => {
    if (activeTabKey === 'search') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>방 검색</p>
            <input
              style={styles.searchInput}
              placeholder="찾고 싶은 게임 이름이나 태그를 입력해 보세요."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <div style={styles.searchActions}>
              <button type="button" style={styles.searchButton}>
                게임 제작
              </button>
              <button type="button" style={styles.searchButton}>
                게임 등록
              </button>
            </div>
          </div>
          <div style={styles.searchGrid}>
            {filteredGames.map((game) => (
              <div key={game.id} style={styles.listItem}>
                <p style={styles.listTitle}>{game.title}</p>
                <p style={styles.listMeta}>{`${game.players}인 · 좋아요 ${game.likes}개`}</p>
                <p style={styles.listMeta}>{game.tags.join(' / ')}</p>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTabKey === 'ranking') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>시즌 랭킹</p>
            <div style={styles.rankingList}>
              {rankingEntries.map((entry, index) => (
                <div key={entry.id} style={styles.listItem}>
                  <p style={styles.listTitle}>{`${index + 1}위 · ${entry.name}`}</p>
                  <p style={styles.listMeta}>{`점수 ${entry.score.toLocaleString()}점`}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (activeTabKey === 'settings') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>브금 제어</p>
            <div style={styles.buttonRow}>
              <button type="button" style={styles.ghostButton} onClick={handleBgmToggle}>
                {bgmEnabled ? '브금 끄기' : '브금 켜기'}
              </button>
              <button type="button" style={styles.ghostButton} onClick={handleRepeatToggle}>
                {repeatEnabled ? '반복 해제' : '반복 재생'}
              </button>
              <button type="button" style={styles.ghostButton} onClick={handleBgmFileButton}>
                브금 교체·저장
              </button>
            </div>
            {selectedBgmName ? (
              <p style={styles.listMeta}>{`선택한 파일: ${selectedBgmName}`}</p>
            ) : null}
            <div style={styles.sliderRow}>
              <label style={styles.sliderLabel}>
                저음 버퍼
                <span>{bassBoost}</span>
              </label>
              <input
                type="range"
                min={-12}
                max={12}
                value={bassBoost}
                onChange={(event) => setBassBoost(Number(event.target.value))}
                style={styles.rangeInput}
              />
            </div>
            <div style={styles.sliderRow}>
              <label style={styles.sliderLabel}>
                고음 버퍼
                <span>{trebleBoost}</span>
              </label>
              <input
                type="range"
                min={-12}
                max={12}
                value={trebleBoost}
                onChange={(event) => setTrebleBoost(Number(event.target.value))}
                style={styles.rangeInput}
              />
            </div>
            <div style={styles.sliderRow}>
              <label style={styles.sliderLabel}>
                선명도 증가
                <span>{clarityBoost}</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={clarityBoost}
                onChange={(event) => setClarityBoost(Number(event.target.value))}
                style={styles.rangeInput}
              />
            </div>
            <button
              type="button"
              style={{ ...styles.ghostButton, marginTop: 12 }}
              onClick={() => setAdvancedMixing((prev) => !prev)}
            >
              {advancedMixing ? '세부 믹싱 닫기' : '세부 믹싱 열기'}
            </button>

            {advancedMixing ? (
              <div style={styles.advancedPanel}>
                <div style={styles.eqColumn}>
                  <p style={styles.listMeta}>이퀄라이저</p>
                  <div style={{ display: 'flex', gap: 14 }}>
                    {eqBands.map((band, index) => (
                      <label key={eqLabels[index]} style={styles.eqColumn}>
                        <input
                          type="range"
                          min={-12}
                          max={12}
                          value={band}
                          onChange={(event) => {
                            const next = [...eqBands]
                            next[index] = Number(event.target.value)
                            setEqBands(next)
                          }}
                          style={styles.eqSlider}
                        />
                        <span style={styles.listMeta}>{eqLabels[index]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={styles.eqColumn}>
                  <p style={styles.listMeta}>리버브 옵션</p>
                  <label style={styles.sliderLabel}>
                    잔향 길이
                    <span>{reverbDetail.roomSize}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={reverbDetail.roomSize}
                    onChange={(event) =>
                      setReverbDetail((prev) => ({ ...prev, roomSize: Number(event.target.value) }))
                    }
                    style={styles.rangeInput}
                  />
                  <label style={styles.sliderLabel}>
                    감쇠
                    <span>{reverbDetail.damping}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={reverbDetail.damping}
                    onChange={(event) =>
                      setReverbDetail((prev) => ({ ...prev, damping: Number(event.target.value) }))
                    }
                    style={styles.rangeInput}
                  />
                </div>
                <div style={styles.eqColumn}>
                  <p style={styles.listMeta}>컴프레서 옵션</p>
                  <label style={styles.sliderLabel}>
                    임계값 (dB)
                    <span>{compressorDetail.threshold}</span>
                  </label>
                  <input
                    type="range"
                    min={-60}
                    max={0}
                    value={compressorDetail.threshold}
                    onChange={(event) =>
                      setCompressorDetail((prev) => ({ ...prev, threshold: Number(event.target.value) }))
                    }
                    style={styles.rangeInput}
                  />
                  <label style={styles.sliderLabel}>
                    릴리즈 (ms)
                    <span>{compressorDetail.release}</span>
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={1000}
                    value={compressorDetail.release}
                    onChange={(event) =>
                      setCompressorDetail((prev) => ({ ...prev, release: Number(event.target.value) }))
                    }
                    style={styles.rangeInput}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>캐릭터 편집</p>
            <div style={styles.buttonRow}>
              <button type="button" style={styles.ghostButton} onClick={() => setIsEditing(true)}>
                편집 시작
              </button>
              <button type="button" style={styles.ghostButton}>
                캐릭터 삭제
              </button>
            </div>
            {isEditing && draftHero ? (
              <form
                style={styles.settingsForm}
                onSubmit={(event) => {
                  event.preventDefault()
                  handleSaveDraft()
                }}
              >
                <div style={styles.formRow}>
                  <label style={styles.sliderLabel}>
                    이름
                  </label>
                  <input
                    style={styles.textField}
                    value={draftHero.name}
                    onChange={(event) => handleDraftChange('name', event.target.value)}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.sliderLabel}>설명</label>
                  <textarea
                    style={styles.textareaField}
                    value={draftHero.description}
                    onChange={(event) => handleDraftChange('description', event.target.value)}
                  />
                </div>
                {['ability1', 'ability2', 'ability3', 'ability4'].map((field, index) => (
                  <div key={field} style={styles.formRow}>
                    <label style={styles.sliderLabel}>{`능력 ${index + 1}`}</label>
                    <textarea
                      style={styles.textareaField}
                      value={draftHero[field]}
                      onChange={(event) => handleDraftChange(field, event.target.value)}
                    />
                  </div>
                ))}
                <div style={styles.formRow}>
                  <label style={styles.sliderLabel}>배경 이미지 URL</label>
                  <input
                    style={styles.textField}
                    value={draftHero.background}
                    onChange={(event) => handleDraftChange('background', event.target.value)}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.sliderLabel}>브금 URL</label>
                  <input
                    style={styles.textField}
                    value={draftHero.bgm}
                    onChange={(event) => handleDraftChange('bgm', event.target.value)}
                  />
                </div>
                <div style={styles.formActions}>
                  <button type="submit" style={styles.searchButton}>
                    저장
                  </button>
                  <button type="button" style={styles.searchButton} onClick={handleCancelEdit}>
                    취소
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )
    }

    return (
      <div style={styles.tabContent}>
        <div style={styles.infoBlock}>
          <p style={styles.infoTitle}>{heroName}</p>
          <p style={styles.infoText}>{description}</p>
          {abilityPairs.map((pair) => (
            <div key={pair.label}>
              <p style={{ ...styles.infoTitle, marginTop: 12 }}>{pair.label}</p>
              <p style={styles.infoText}>{pair.entries.join('\n')}</p>
            </div>
          ))}
          {!abilityPairs.length ? (
            <p style={styles.listMeta}>등록된 능력이 없습니다.</p>
          ) : null}
        </div>
      </div>
    )
  })()

  const heroSlide = (
    <div style={styles.heroCardShell}>
      <div
        role="button"
        tabIndex={0}
        style={styles.heroCard}
        onClick={handleTap}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleTap()
          }
        }}
      >
        <div style={styles.cornerIcon} aria-hidden="true">
          {Array.from({ length: 9 }).map((_, index) => (
            <span key={`dot-${index}`} style={styles.cornerDot} />
          ))}
        </div>

        {hero?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.image_url} alt={heroName} style={imageStyle} />
        ) : (
          <div style={styles.heroFallback}>{heroName.slice(0, 2)}</div>
        )}

        {currentOverlayMode === 'name' ? (
          <div style={styles.heroNameOverlay}>
            <p style={styles.heroNameBadge}>{heroName}</p>
          </div>
        ) : null}

        {currentOverlayMode === 'description' ? (
          <div style={styles.overlaySurface}>
            <p style={styles.overlayTextBlock}>{description}</p>
          </div>
        ) : null}

        {currentOverlayMode.startsWith('ability-') ? (
          <div style={styles.overlaySurface}>
            {(() => {
              const index = Number.parseInt(currentOverlayMode.split('-')[1] || '0', 10)
              const pair = abilityPairs[index]
              if (!pair) {
                return <p style={styles.overlayTextBlock}>등록된 능력이 없습니다.</p>
              }
              return (
                <p key={pair.label} style={styles.overlayTextBlock}>
                  {`${pair.label}:\n${pair.entries.join('\n')}`}
                </p>
              )
            })()}
          </div>
        ) : null}

        {currentOverlayMode === 'ability-empty' ? (
          <div style={styles.overlaySurface}>
            <p style={styles.overlayTextBlock}>등록된 능력이 없습니다.</p>
          </div>
        ) : null}

        <div style={styles.tapHint} aria-hidden="true">
          탭해서 정보 보기
        </div>
      </div>
    </div>
  )

  const bgmBar = (
    <div style={{ ...styles.hudSection }}>
      <div style={styles.playerShell}>
        <div style={styles.playerHeader}>
          <div style={styles.playerHeaderLeft}>
            <button
              type="button"
              style={styles.collapseButton}
              onClick={() => setPlayerCollapsed((prev) => !prev)}
              aria-label={playerCollapsed ? '재생바 펼치기' : '재생바 접기'}
            >
              {playerCollapsed ? '▲' : '▼'}
            </button>
            <span style={styles.playerTitle}>캐릭터 브금</span>
          </div>
          {!playerCollapsed && bgmEnabled && activeBgmUrl ? (
            <>
              <div
                style={styles.progressBar}
                role="presentation"
                onClick={handleSeek}
              >
                <div style={styles.progressFill(progressRatio)} />
              </div>
              <span style={styles.listMeta}>
                {formatTime(progress)} / {formatTime(duration)}
              </span>
            </>
          ) : null}
        </div>

        {!playerCollapsed ? (
          bgmEnabled && activeBgmUrl ? (
            <div style={styles.playerControls}>
              <button type="button" style={styles.playerButton} onClick={togglePlayback}>
                {isPlaying ? '일시정지' : '재생'}
              </button>
              <button type="button" style={styles.playerButton} onClick={stopPlayback}>
                처음으로
              </button>
              <button type="button" style={styles.playerButton} onClick={handleRepeatToggle}>
                {repeatEnabled ? '반복 켜짐' : '반복 끔'}
              </button>
              <button type="button" style={styles.playerButton} onClick={handleBgmFileButton}>
                브금 교체·저장
              </button>
            </div>
          ) : (
            <p style={styles.playerMessage}>브금이 비활성화되었습니다. 설정 탭에서 켜 보세요.</p>
          )
        ) : null}
      </div>
    </div>
  )

  return (
    <div style={backgroundStyle}>
      <div style={styles.stage}>{heroSlide}</div>

      <div style={styles.hudContainer}>
        {bgmBar}
        <div style={{ ...styles.hudSection }}>
          <div style={styles.dockContainer}>
            <div style={styles.dockToggleRow}>
              <button
                type="button"
                style={styles.dockToggleButton}
                onClick={() => setDockCollapsed((prev) => !prev)}
                aria-label={dockCollapsed ? '오버레이 펼치기' : '오버레이 접기'}
              >
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
                  {activeTabKey === 'character' ? (
                    <button type="button" style={styles.battleButton}>
                      전투 시작
                    </button>
                  ) : null}
                </div>

                {overlayBody}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <input
        type="file"
        accept="audio/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleBgmFileChange}
      />
    </div>
  )
}
