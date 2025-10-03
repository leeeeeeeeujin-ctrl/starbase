'use client'

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

import useGameBrowser from '@/components/lobby/hooks/useGameBrowser'

import EditHeroModal from './sections/EditHeroModal'
import { CharacterDashboardProvider, useCharacterDashboardContext } from './context'

const NAV_ITEMS = [
  { id: 'game', label: '게임 찾기' },
  { id: 'character', label: '캐릭터' },
  { id: 'ranking', label: '랭킹' },
]

const PANEL_COUNT = NAV_ITEMS.length
const RELEASE_DELAY = 280

export default function CharacterDashboard({
  dashboard,
  heroId: explicitHeroId,
  heroName,
  onStartBattle,
  onBack,
}) {
  const router = useRouter()
  const { profile, participation, battles, heroName: fallbackName } = dashboard

  const [panelIndex, setPanelIndex] = useState(1)
  const [editOpen, setEditOpen] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [gameSearchEnabled, setGameSearchEnabled] = useState(false)
  const swipeViewportRef = useRef(null)
  const animatingRef = useRef(false)
  const animationTimeoutRef = useRef(null)
  const settleTimeoutRef = useRef(null)
  const settleFrameRef = useRef(null)
  const panelIndexRef = useRef(panelIndex)
  const isProgrammaticRef = useRef(false)
  const pinchStateRef = useRef(null)

  useEffect(() => {
    panelIndexRef.current = panelIndex
  }, [panelIndex])

  const displayName = heroName || fallbackName || profile.hero?.name || '이름 없는 캐릭터'
  const heroImage = profile.edit?.image_url || profile.hero?.image_url || ''
  const backgroundImage =
    profile.background?.preview || profile.hero?.background_url || profile.edit?.background_url || ''
  const audioSource = profile.audio?.source || ''

  const backgroundStyle = backgroundImage
    ? { ...styles.backgroundLayer, backgroundImage: `url(${backgroundImage})` }
    : styles.backgroundFallback

  const contextValue = useMemo(
    () => ({
      hero: profile.hero,
      heroName: displayName,
      heroImage,
      edit: profile.edit,
      onChangeEdit: profile.actions.changeEdit,
      saving: profile.saving,
      onSave: profile.actions.save,
      onDelete: profile.actions.remove,
      backgroundPreview: profile.background.preview,
      backgroundError: profile.background.error,
      onBackgroundUpload: profile.actions.backgroundUpload,
      onClearBackground: profile.actions.backgroundClear,
      backgroundInputRef: profile.background.inputRef,
      bgmLabel: profile.bgm.label,
      bgmDuration: profile.audio.duration,
      onBgmUpload: profile.actions.bgmUpload,
      onClearBgm: profile.actions.bgmClear,
      bgmInputRef: profile.bgm.inputRef,
      bgmError: profile.bgm.error,
      abilityCards: profile.abilityCards,
      onAddAbility: profile.actions.addAbility,
      onReverseAbilities: profile.actions.reverseAbilities,
      onClearAbility: profile.actions.clearAbility,
      audioSource: profile.audio.source,
      statSlides: participation.statSlides,
      selectedGameId: participation.selectedGameId,
      onSelectGame: participation.actions.selectGame,
      selectedEntry: participation.selectedEntry,
      selectedGame: participation.selectedGame,
      selectedScoreboard: participation.scoreboard,
      heroLookup: participation.heroLookup,
      battleSummary: battles.summary,
      battleDetails: battles.details,
      visibleBattles: battles.visibleCount,
      onShowMoreBattles: battles.actions.showMore,
      battleLoading: battles.status.loading,
      battleError: battles.status.error,
      scoreboardRows: participation.scoreboard,
      openEditPanel: () => setEditOpen(true),
      closeEditPanel: () => setEditOpen(false),
      onStartBattle,
    }),
    [
      profile.hero,
      profile.edit,
      profile.actions,
      profile.background.preview,
      profile.background.error,
      profile.background.inputRef,
      profile.bgm.label,
      profile.audio.duration,
      profile.bgm.inputRef,
      profile.bgm.error,
      profile.abilityCards,
      profile.audio.source,
      profile.saving,
      participation.statSlides,
      participation.selectedGameId,
      participation.actions,
      participation.selectedEntry,
      participation.selectedGame,
      participation.scoreboard,
      participation.heroLookup,
      battles.summary,
      battles.details,
      battles.visibleCount,
      battles.actions,
      battles.status,
      onStartBattle,
      displayName,
      heroImage,
    ],
  )

  const gameBrowser = useGameBrowser({ enabled: gameSearchEnabled })
  const snapToPanel = useCallback(
    (targetIndex, behavior = 'smooth') => {
      const node = swipeViewportRef.current
      if (!node) return

      const clampedIndex = Math.max(0, Math.min(PANEL_COUNT - 1, targetIndex))
      const width = node.clientWidth || 1

      animatingRef.current = true
      isProgrammaticRef.current = true
      node.scrollTo({ left: clampedIndex * width, behavior })

      clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = setTimeout(() => {
        animatingRef.current = false
        isProgrammaticRef.current = false
      }, behavior === 'auto' ? 0 : RELEASE_DELAY)

      if (panelIndexRef.current !== clampedIndex) {
        setPanelIndex(clampedIndex)
      }
    },
    [],
  )

  const openOverview = useCallback(() => {
    setOverviewOpen((current) => (current ? current : true))
  }, [])

  const closeOverview = useCallback(() => {
    setOverviewOpen(false)
  }, [])

  useEffect(() => {
    const node = swipeViewportRef.current
    if (!node) return undefined

    const handleScroll = () => {
      const width = node.clientWidth || 1
      if (settleFrameRef.current) {
        cancelAnimationFrame(settleFrameRef.current)
      }

      settleFrameRef.current = requestAnimationFrame(() => {
        const ratio = node.scrollLeft / width
        const nearestIndex = Math.max(0, Math.min(PANEL_COUNT - 1, Math.round(ratio)))

        if (!isProgrammaticRef.current && panelIndexRef.current !== nearestIndex) {
          setPanelIndex(nearestIndex)
        }
      })

      clearTimeout(settleTimeoutRef.current)
      settleTimeoutRef.current = setTimeout(() => {
        if (animatingRef.current || isProgrammaticRef.current) return

        const ratio = node.scrollLeft / width
        const nearestIndex = Math.max(0, Math.min(PANEL_COUNT - 1, Math.round(ratio)))
        if (Math.abs(ratio - nearestIndex) > 0.08) {
          snapToPanel(nearestIndex)
          return
        }

        if (panelIndexRef.current !== nearestIndex) {
          setPanelIndex(nearestIndex)
        }
      }, 140)
    }

    node.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      node.removeEventListener('scroll', handleScroll)
      clearTimeout(settleTimeoutRef.current)
      if (settleFrameRef.current) {
        cancelAnimationFrame(settleFrameRef.current)
        settleFrameRef.current = null
      }
    }
  }, [snapToPanel])

  useEffect(() => {
    return () => {
      clearTimeout(animationTimeoutRef.current)
      clearTimeout(settleTimeoutRef.current)
      if (settleFrameRef.current) {
        cancelAnimationFrame(settleFrameRef.current)
        settleFrameRef.current = null
      }
    }
  }, [])

  const previousPanelRef = useRef(panelIndex)
  useEffect(() => {
    const previous = previousPanelRef.current
    if (previous !== panelIndex) {
      previousPanelRef.current = panelIndex
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    }
  }, [panelIndex])

  useEffect(() => {
    const node = swipeViewportRef.current
    if (!node) return undefined

    const getDistance = (touches) => {
      if (touches.length < 2) return 0
      const [first, second] = touches
      const dx = first.clientX - second.clientX
      const dy = first.clientY - second.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (event) => {
      if (event.touches.length === 2) {
        pinchStateRef.current = {
          startDistance: getDistance(event.touches),
          triggered: false,
        }
      }
    }

    const handleTouchMove = (event) => {
      const state = pinchStateRef.current
      if (!state || event.touches.length !== 2) return

      const distance = getDistance(event.touches)
      if (!distance || !state.startDistance) return

      const ratio = distance / state.startDistance
      if (!state.triggered && ratio < 0.9) {
        state.triggered = true
        openOverview()
      }
    }

    const clearPinch = () => {
      pinchStateRef.current = null
    }

    const handleWheel = (event) => {
      if (!event.ctrlKey) return
      if (event.deltaY <= 0) return
      openOverview()
    }

    node.addEventListener('touchstart', handleTouchStart, { passive: true })
    node.addEventListener('touchmove', handleTouchMove, { passive: true })
    node.addEventListener('touchend', clearPinch)
    node.addEventListener('touchcancel', clearPinch)
    node.addEventListener('wheel', handleWheel, { passive: true })

    return () => {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
      node.removeEventListener('touchend', clearPinch)
      node.removeEventListener('touchcancel', clearPinch)
      node.removeEventListener('wheel', handleWheel)
    }
  }, [openOverview])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeOverview()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeOverview])

  useEffect(() => {
    if (!overviewOpen) return undefined

    const routerEvents = router.events
    if (!routerEvents) return undefined

    const handleRouteStart = () => {
      setOverviewOpen(false)
    }

    routerEvents.on('routeChangeStart', handleRouteStart)

    return () => {
      routerEvents.off('routeChangeStart', handleRouteStart)
    }
  }, [overviewOpen, router])

  useEffect(() => {
    if (!overviewOpen) return
    router.prefetch('/maker').catch(() => {})
    router.prefetch('/rank/new').catch(() => {})
  }, [overviewOpen, router])

  useEffect(() => {
    router.prefetch('/roster').catch(() => {})
  }, [router])

  useLayoutEffect(() => {
    const node = swipeViewportRef.current
    if (!node) return undefined

    const width = node.clientWidth || 1
    const initialIndex = panelIndexRef.current
    node.scrollTo({ left: width * initialIndex, behavior: 'auto' })

    const handleResize = () => {
      const nextWidth = node.clientWidth || 1
      node.scrollLeft = nextWidth * panelIndexRef.current
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (panelIndex === 0 && !gameSearchEnabled) {
      setGameSearchEnabled(true)
    }
  }, [panelIndex, gameSearchEnabled])

  const handleEnterGame = useCallback(
    (game, role) => {
      if (!game) return
      const base = `/rank/${game.id}`
      const target = role ? `${base}?role=${encodeURIComponent(role)}` : base
      router.push(target)
    },
    [router],
  )

  const panels = useMemo(
    () => [
      {
        id: 'game',
        label: '게임 찾기',
        render: () => <GamePanel browser={gameBrowser} onEnterGame={handleEnterGame} />,
      },
      {
        id: 'character',
        label: '캐릭터',
        render: () => <CharacterPanel />,
      },
      {
        id: 'ranking',
        label: '랭킹',
        render: () => <RankingPanel />,
      },
    ],
    [gameBrowser, handleEnterGame],
  )

  const handleNavClick = useCallback((targetId) => {
    const targetIndex = NAV_ITEMS.findIndex((item) => item.id === targetId)
    if (targetIndex >= 0) {
      snapToPanel(targetIndex)
      closeOverview()
    }
  }, [closeOverview, snapToPanel])

  return (
    <CharacterDashboardProvider value={contextValue}>
      <div style={styles.page}>
        <div style={backgroundStyle} aria-hidden />
        <div style={styles.backgroundTint} aria-hidden />

        <div style={styles.content}>
          <div
            ref={swipeViewportRef}
            style={styles.swipeViewport}
          >
            <div style={styles.swipeTrack}>
              {panels.map((panel) => (
                <div key={panel.id} style={styles.swipePanel}>
                  {panel.render()}
                </div>
              ))}
            </div>
          </div>
        </div>

        <nav style={styles.bottomNav}>
          {NAV_ITEMS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              style={{
                ...styles.navButton,
                ...(panelIndex === index ? styles.navButtonActive : null),
              }}
            >
            {item.label}
          </button>
          ))}
        </nav>
      </div>
      {onBack ? (
        <button type="button" onClick={onBack} style={styles.backOverlayButton}>
          ← 뒤로가기
        </button>
      ) : null}
      <EditHeroModal open={editOpen} onClose={() => setEditOpen(false)} />
      <OverviewSheet
        open={overviewOpen}
        onClose={closeOverview}
        navItems={NAV_ITEMS}
        activeIndex={panelIndex}
        onNavigate={handleNavClick}
        heroName={displayName}
        heroImage={heroImage}
        participations={participation.participations || []}
        selectedGameId={participation.selectedGameId}
        onSelectGame={participation.actions.selectGame}
        onOpenGame={handleEnterGame}
      />
      </CharacterDashboardProvider>
  )
}

function SectionCard({ title, children }) {
  return (
    <section style={styles.sectionCard}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <div>{children}</div>
    </section>
  )
}

function CharacterPanel() {
  const {
    heroName,
    heroImage,
    hero,
    edit,
    abilityCards = [],
    statSlides = [],
    selectedGameId,
    openEditPanel,
  } = useCharacterDashboardContext()

  const description = (edit?.description || hero?.description || '').trim()
  const abilityTexts = useMemo(
    () => abilityCards.map((card) => (card.value || '').trim()).filter(Boolean),
    [abilityCards],
  )

  const statSlide = useMemo(() => {
    if (!statSlides.length) return null
    if (selectedGameId) {
      const match = statSlides.find((slide) => slide.key === selectedGameId)
      if (match) return match
    }
    return statSlides[0]
  }, [statSlides, selectedGameId])

  const statLines = useMemo(() => {
    if (!statSlide?.stats?.length) return []
    return statSlide.stats
      .filter((entry) => entry?.label && entry?.value)
      .map((entry) => ({ label: entry.label, value: entry.value }))
  }, [statSlide])

  const overlaySteps = useMemo(() => {
    const steps = ['name']
    if (description) steps.push('description')
    if (abilityTexts.length) steps.push('abilities')
    if (statLines.length) steps.push('stats')
    return steps
  }, [description, abilityTexts.length, statLines.length])

  const [overlayIndex, setOverlayIndex] = useState(0)

  useEffect(() => {
    if (!overlaySteps.length) return
    if (overlayIndex >= overlaySteps.length) {
      setOverlayIndex(0)
    }
  }, [overlayIndex, overlaySteps])

  const currentOverlay = overlaySteps[overlayIndex] || 'name'
  const isOverlayActive = currentOverlay !== 'name'

  const handleHeroTap = useCallback(() => {
    if (!overlaySteps.length) return
    setOverlayIndex((prev) => ((prev + 1) % overlaySteps.length))
  }, [overlaySteps])

  let overlayTitle = ''
  let overlayBody = null
  if (currentOverlay === 'description') {
    overlayTitle = '설명'
    overlayBody = <p style={styles.heroOverlayText}>{description}</p>
  } else if (currentOverlay === 'abilities') {
    overlayTitle = '능력'
    overlayBody = (
      <ul style={styles.heroOverlayList}>
        {abilityTexts.map((text, index) => (
          <li key={index} style={styles.heroOverlayText}>
            {text}
          </li>
        ))}
      </ul>
    )
  } else if (currentOverlay === 'stats') {
    overlayTitle = statSlide?.name ? `${statSlide.name} 기록` : '통계'
    overlayBody = (
      <ul style={styles.heroOverlayList}>
        {statLines.map((entry) => (
          <li key={entry.label} style={styles.heroOverlayStat}>
            <span>{entry.label}</span>
            <strong>{entry.value}</strong>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div style={styles.heroSection}>
      <p style={styles.swipeHint}>좌우로 화면을 밀어 메뉴를 넘어갈 수 있어요.</p>
      <div style={styles.heroPortraitFrame}>
        <div
          role="button"
          tabIndex={0}
          onClick={handleHeroTap}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              handleHeroTap()
            }
          }}
          style={{
            ...styles.heroPortrait,
            ...(isOverlayActive ? styles.heroPortraitActive : null),
          }}
        >
          {heroImage ? (
            <img src={heroImage} alt={`${heroName} 이미지`} style={styles.heroImage} />
          ) : (
            <div style={styles.heroPlaceholder}>이미지 없음</div>
          )}
          {isOverlayActive ? <div style={styles.heroShade} aria-hidden /> : null}
          {isOverlayActive && overlayBody ? (
            <div style={styles.heroOverlay}>
              <p style={styles.heroOverlayTitle}>{overlayTitle}</p>
              {overlayBody}
            </div>
          ) : null}
          {!isOverlayActive ? (
            <div style={styles.heroNameplate}>
              <span style={styles.heroNameText}>{heroName}</span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            openEditPanel()
          }}
          style={styles.heroEditButton}
          aria-label="프로필 편집"
        >
          <span aria-hidden style={styles.heroEditIcon}>
            {Array.from({ length: 9 }).map((_, index) => (
              <span key={index} style={styles.heroEditDot} />
            ))}
          </span>
        </button>
      </div>
      <div style={styles.panelStack}>
        <InstantBattleSection />
        <BattleLogSection />
      </div>
    </div>
  )
}

function GamePanel({ browser, onEnterGame }) {
  return <GameSearchSwipePanel browser={browser} onEnterGame={onEnterGame} />
}

function RankingPanel() {
  return <RankingSection />
}

function InstantBattleSection() {
  const { statSlides = [], selectedGameId, onSelectGame, selectedGame, onStartBattle } =
    useCharacterDashboardContext()

  return (
    <section style={styles.sectionCard}>
      <header style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>전투</h2>
        {statSlides.length ? (
          <div style={styles.gameChipRow}>
            {statSlides.map((slide) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => onSelectGame(slide.key)}
                style={{
                  ...styles.gameChip,
                  ...(selectedGameId === slide.key ? styles.gameChipActive : null),
                }}
              >
                <span style={styles.gameChipName}>{slide.name}</span>
                {slide.role ? <span style={styles.gameChipRole}>{slide.role}</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <p style={styles.bodyText}>참여한 게임이 없습니다.</p>
        )}
      </header>
      {selectedGame ? (
        <div style={styles.battleBody}>
          <strong style={styles.battleGameName}>{selectedGame.name}</strong>
          <p style={styles.battleDescription}>{selectedGame.description || '설명이 없습니다.'}</p>
          <button
            type="button"
            onClick={onStartBattle}
            disabled={!selectedGameId}
            style={{
              ...styles.primaryButton,
              ...(selectedGameId ? null : styles.primaryButtonDisabled),
            }}
          >
            전투 시작
          </button>
        </div>
      ) : statSlides.length ? (
        <p style={styles.bodyText}>전투를 시작할 게임을 위에서 선택해 주세요.</p>
      ) : null}
    </section>
  )
}

function RankingSection() {
  const { selectedScoreboard = [], heroLookup = {}, hero } = useCharacterDashboardContext()

  return (
    <div style={styles.panelContent}>
      <SectionCard title="랭킹">
        {selectedScoreboard.length ? (
          <div style={styles.rankingTableWrapper}>
            <table style={styles.rankingTable}>
              <thead>
                <tr>
                  <th>순위</th>
                  <th>영웅</th>
                  <th>점수</th>
                  <th>전투 수</th>
                </tr>
              </thead>
              <tbody>
                {selectedScoreboard.map((row, index) => {
                  const lookup = (row.hero_id && heroLookup[row.hero_id]) || null
                  const name = lookup?.name || row.role || `참가자 ${index + 1}`
                  const isHero = hero?.id && row.hero_id === hero.id
                  return (
                    <tr
                      key={row.id || `${row.hero_id}-${row.slot_no ?? index}`}
                      style={isHero ? styles.highlightRow : null}
                    >
                      <td>{index + 1}</td>
                      <td>{name}</td>
                      <td>{row.rating ?? row.score ?? '—'}</td>
                      <td>{row.battles ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={styles.bodyText}>선택한 게임의 랭킹 정보가 없습니다.</p>
        )}
      </SectionCard>
    </div>
  )
}

function BattleLogSection() {
  const {
    battleDetails = [],
    visibleBattles,
    onShowMoreBattles,
    battleLoading,
    battleError,
    selectedGame,
    statSlides = [],
  } = useCharacterDashboardContext()

  const hasSelection = Boolean(selectedGame)
  const hasParticipations = statSlides.length > 0

  return (
    <section style={styles.sectionCard}>
      <header style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>베틀로그</h2>
        {selectedGame ? <span style={styles.sectionSubLabel}>{selectedGame.name}</span> : null}
      </header>
      {battleLoading ? (
        <p style={styles.bodyText}>전투 기록을 불러오는 중…</p>
      ) : battleError ? (
        <p style={styles.bodyText}>{battleError}</p>
      ) : !hasSelection && hasParticipations ? (
        <p style={styles.bodyText}>위에서 게임을 선택하면 전투 기록이 표시됩니다.</p>
      ) : !battleDetails.length ? (
        <p style={styles.bodyText}>표시할 전투 기록이 없습니다.</p>
      ) : (
        <div style={styles.battleList}>
          {battleDetails
            .slice(0, visibleBattles || battleDetails.length)
            .map((battle) => (
              <article key={battle.id} style={styles.battleCard}>
                <header style={styles.battleHeader}>
                  <strong>{new Date(battle.created_at || 0).toLocaleString()}</strong>
                  <span>{battle.result ? battle.result.toUpperCase() : '결과 미정'}</span>
                </header>
                <p style={styles.bodyText}>점수 변화: {battle.score_delta ?? 0}</p>
                {battle.logs?.length ? (
                  <details style={styles.logDetails}>
                    <summary>턴 로그 보기</summary>
                    <ul style={styles.logList}>
                      {battle.logs.map((log) => (
                        <li key={`${battle.id}-${log.turn_no}`}>
                          <strong>턴 {log.turn_no}</strong>
                          <div>프롬프트: {log.prompt}</div>
                          <div>응답: {log.ai_response}</div>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </article>
            ))}
          {visibleBattles && visibleBattles < battleDetails.length ? (
            <button type="button" onClick={onShowMoreBattles} style={styles.secondaryButton}>
              더 보기
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}

function GameSearchSwipePanel({ browser, onEnterGame }) {
  const {
    gameQuery,
    setGameQuery,
    gameSort,
    setGameSort,
    gameRows,
    gameLoading,
    selectedGame,
    setSelectedGame,
    detailLoading,
    gameRoles,
    participants,
    roleChoice,
    setRoleChoice,
    roleSlots,
    sortOptions,
  } = browser

  const handleSelectRole = useCallback(
    (role) => {
      if (!role) {
        setRoleChoice('')
        return
      }
      setRoleChoice(role)
    },
    [setRoleChoice],
  )

  const handleSubmit = useCallback(() => {
    if (!selectedGame) return
    onEnterGame(selectedGame, roleChoice)
  }, [onEnterGame, roleChoice, selectedGame])

  return (
    <div style={styles.panelContent}>
      <SectionCard title="게임 찾기">
        <div style={styles.gameSearchLayout}>
          <div style={styles.gameSearchColumn}>
            <div style={styles.gameSearchControls}>
              <input
                type="search"
                placeholder="게임 제목이나 설명을 검색"
                value={gameQuery}
                onChange={(event) => setGameQuery(event.target.value)}
                style={styles.gameSearchInput}
              />
              <select
                value={gameSort}
                onChange={(event) => setGameSort(event.target.value)}
                style={styles.gameSortSelect}
              >
                {sortOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.gameList}>
              {gameLoading ? (
                <p style={styles.loadingText}>게임 목록을 불러오는 중…</p>
              ) : !gameRows.length ? (
                <p style={styles.emptyState}>검색 결과가 없습니다.</p>
              ) : (
                gameRows.map((row) => {
                  const isActive = selectedGame?.id === row.id
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelectedGame(row)}
                      style={{
                        ...styles.gameListItem,
                        ...(isActive ? styles.gameListItemActive : styles.gameListItemInactive),
                      }}
                    >
                      <div>
                        <div style={styles.gameListTitle}>{row.name}</div>
                        <div style={styles.gameListDescription}>
                          {row.description || '설명이 없습니다.'}
                        </div>
                      </div>
                      <div style={styles.gameListMeta}>
                        <span>👍 {row.likes_count ?? 0}</span>
                        <span>🎮 {row.play_count ?? 0}</span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div style={styles.gameDetail}>
            {detailLoading ? (
              <p style={styles.loadingText}>게임 정보를 불러오는 중…</p>
            ) : !selectedGame ? (
              <p style={styles.emptyState}>왼쪽에서 게임을 선택하면 상세 정보가 표시됩니다.</p>
            ) : (
              <div style={styles.gameDetailBody}>
                <header style={styles.gameDetailHeader}>
                  <h3 style={styles.gameDetailTitle}>{selectedGame.name}</h3>
                  <p style={styles.gameDetailDescription}>
                    {selectedGame.description || '설명이 없습니다.'}
                  </p>
                  <div style={styles.gameDetailMeta}>
                    <span>등록 {formatDate(selectedGame.created_at)}</span>
                    <span>플레이 {selectedGame.play_count ?? 0}</span>
                  </div>
                </header>

                <section>
                  <h4 style={styles.sectionSubTitle}>역할 선택</h4>
                  <div style={styles.roleGrid}>
                    {gameRoles.length ? (
                      gameRoles.map((role) => {
                        const slot = roleSlots.get(role.name) || { capacity: 1, occupied: 0 }
                        const capacity = Number.isFinite(Number(slot.capacity))
                          ? Math.max(Number(slot.capacity), 0)
                          : null
                        const occupied = Number.isFinite(Number(slot.occupied))
                          ? Math.max(Number(slot.occupied), 0)
                          : 0
                        const isActive = roleChoice === role.name
                        return (
                          <button
                            key={role.id || role.name}
                            type="button"
                            onClick={() => handleSelectRole(role.name)}
                            style={{
                              ...styles.roleButton,
                              ...(isActive ? styles.roleButtonActive : null),
                            }}
                          >
                            <span>{role.name}</span>
                            <span style={styles.roleSlotMeta}>
                              {capacity != null
                                ? `최소 ${capacity}명 필요 · 현재 ${occupied}명 참여`
                                : `${occupied}명 참여 중`}
                            </span>
                          </button>
                        )
                      })
                    ) : (
                      <p style={styles.emptyState}>등록된 역할이 없습니다.</p>
                    )}
                  </div>
                </section>

                <section>
                  <h4 style={styles.sectionSubTitle}>현재 참가자</h4>
                  <div style={styles.participantList}>
                    {participants.length ? (
                      participants.map((participant) => (
                        <div key={participant.id} style={styles.participantRow}>
                          <span style={styles.participantName}>
                            {participant.hero_name || participant.hero_id || '알 수 없음'}
                          </span>
                          <span style={styles.participantRole}>{participant.role || '역할 미정'}</span>
                        </div>
                      ))
                    ) : (
                      <p style={styles.emptyState}>아직 참가자가 없습니다.</p>
                    )}
                  </div>
                </section>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!selectedGame}
                  style={{
                    ...styles.enterButton,
                    ...(selectedGame ? null : styles.primaryButtonDisabled),
                  }}
                >
                  선택한 역할로 입장하기
                </button>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

function formatDate(value) {
  if (!value) return '날짜 미상'
  try {
    return new Date(value).toLocaleDateString()
  } catch (error) {
    return '날짜 미상'
  }
}

const styles = {
  page: {
    minHeight: '100vh',
    position: 'relative',
    overflowX: 'hidden',
    color: '#e2e8f0',
    fontFamily: 'inherit',
  },
  backgroundLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    transform: 'translateZ(0)',
    zIndex: 0,
    pointerEvents: 'none',
  },
  backgroundFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'radial-gradient(circle at 20% 20%, #1e293b, #020617)',
    zIndex: 0,
    pointerEvents: 'none',
  },
  backgroundTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.4) 0%, rgba(2, 6, 23, 0.85) 100%)',
    zIndex: 0,
    pointerEvents: 'none',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    padding: '24px 16px 112px',
  },
  overlayButtons: {
    position: 'fixed',
    right: 20,
    bottom: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    zIndex: 3,
  },
  overlayButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.65)',
    color: '#f8fafc',
    fontSize: 20,
    cursor: 'pointer',
    position: 'relative',
  },
  overlayBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    background: '#ef4444',
    color: '#fff',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 6px',
    fontWeight: 700,
  },
  panelIntro: {
    marginBottom: 24,
    display: 'grid',
    gap: 6,
    textAlign: 'center',
  },
  introTitle: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: -0.3,
    color: '#f8fafc',
  },
  introSubtitle: {
    margin: 0,
    color: '#cbd5f5',
    fontSize: 14,
    lineHeight: 1.6,
  },
  bgmPlayer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    background: 'rgba(15, 23, 42, 0.7)',
  },
  swipeHint: {
    margin: '0 0 16px',
    fontSize: 14,
    color: '#cbd5f5',
    textAlign: 'center',
  },
  heroSection: {
    maxWidth: 520,
    margin: '0 auto',
    display: 'grid',
    gap: 24,
  },
  heroPortraitFrame: {
    position: 'relative',
  },
  heroPortrait: {
    width: '100%',
    borderRadius: 32,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: 'rgba(15, 23, 42, 0.55)',
    minHeight: 360,
    aspectRatio: '3 / 4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    WebkitTapHighlightColor: 'transparent',
    cursor: 'pointer',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
  },
  heroPortraitActive: {
    boxShadow: '0 18px 42px rgba(15, 23, 42, 0.55)',
    transform: 'scale(0.99)',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontSize: 16,
  },
  heroNameplate: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    padding: '10px 18px',
    borderRadius: 999,
    background: 'rgba(2, 6, 23, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    maxWidth: '80%',
  },
  heroNameText: {
    fontSize: 22,
    fontWeight: 700,
    color: '#f8fafc',
    lineHeight: 1.2,
    display: 'block',
  },
  heroShade: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(2,6,23,0.6) 0%, rgba(2,6,23,0.28) 45%, rgba(2,6,23,0.7) 100%)',
    pointerEvents: 'none',
  },
  heroOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 10,
    padding: '32px 24px 28px',
    pointerEvents: 'none',
    color: '#f8fafc',
    textShadow: '0 3px 16px rgba(2, 6, 23, 0.85)',
  },
  heroOverlayTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: -0.2,
    textAlign: 'center',
    width: '100%',
    maxWidth: 360,
  },
  heroOverlayText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: '#e2e8f0',
    textAlign: 'center',
    maxWidth: 360,
    width: '100%',
    marginInline: 'auto',
  },
  heroOverlayList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'grid',
    gap: 6,
    width: '100%',
    justifyItems: 'center',
  },
  heroOverlayStat: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    fontSize: 14,
    lineHeight: 1.5,
    width: '100%',
    maxWidth: 360,
  },
  heroEditButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 16,
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: 'rgba(2, 6, 23, 0.65)',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  heroEditIcon: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 6px)',
    gap: 4,
  },
  heroEditDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#f8fafc',
    opacity: 0.85,
  },
  heroAudioBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 18,
    padding: '12px 16px',
    border: '1px solid rgba(148, 163, 184, 0.28)',
  },
  heroAudioLabel: {
    fontWeight: 600,
    color: '#cbd5f5',
    fontSize: 13,
  },
  heroAudioPlayer: {
    flex: 1,
    minWidth: 180,
  },
  panelContainer: {
    background: 'rgba(2, 6, 23, 0.65)',
    borderRadius: 32,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    padding: 24,
    display: 'grid',
    gap: 24,
  },
  swipeViewport: {
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    scrollBehavior: 'auto',
  },
  swipeTrack: {
    display: 'flex',
  },
  swipePanel: {
    minWidth: '100%',
    scrollSnapAlign: 'center',
    scrollSnapStop: 'always',
    padding: '4px 0',
  },
  panelStack: {
    display: 'grid',
    gap: 20,
  },
  panelContent: {
    display: 'grid',
    gap: 24,
  },
  sectionCard: {
    borderRadius: 24,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    background: 'rgba(15, 23, 42, 0.82)',
    padding: 20,
    display: 'grid',
    gap: 16,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    color: '#f8fafc',
  },
  sectionSubLabel: {
    fontSize: 13,
    color: '#94a3b8',
    whiteSpace: 'nowrap',
  },
  sectionSubTitle: {
    margin: '0 0 12px',
    fontSize: 16,
    color: '#f8fafc',
  },
  bodyText: {
    margin: 0,
    lineHeight: 1.6,
    color: '#cbd5f5',
  },
  gameChipRow: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    padding: '4px 0',
  },
  gameChip: {
    flex: '0 0 auto',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#e2e8f0',
    padding: '8px 14px',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  gameChipActive: {
    borderColor: '#38bdf8',
    background: 'rgba(56, 189, 248, 0.18)',
  },
  gameChipName: {
    fontWeight: 600,
  },
  gameChipRole: {
    fontSize: 12,
    color: '#94a3b8',
  },
  battleBody: {
    display: 'grid',
    gap: 12,
  },
  battleGameName: {
    fontSize: 16,
    fontWeight: 700,
    color: '#f8fafc',
  },
  battleDescription: {
    margin: 0,
    color: '#cbd5f5',
    lineHeight: 1.6,
  },
  profileMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: 18,
    background: 'rgba(30, 41, 59, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
  },
  abilityList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 12,
  },
  abilityItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderRadius: 14,
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
  },
  abilityLabel: {
    color: '#94a3b8',
  },
  abilityValue: {
    color: '#f8fafc',
  },
  statGrid: {
    display: 'grid',
    gap: 16,
  },
  statCard: {
    textAlign: 'left',
    width: '100%',
    background: 'rgba(15, 23, 42, 0.58)',
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    padding: 18,
    display: 'grid',
    gap: 12,
    cursor: 'pointer',
    color: '#e2e8f0',
  },
  statCardActive: {
    borderColor: '#3b82f6',
    boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.4)',
  },
  statHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statRole: {
    fontSize: 12,
    color: '#94a3b8',
  },
  statList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 8,
  },
  statItem: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#cbd5f5',
  },
  statNote: {
    fontSize: 12,
    color: '#94a3b8',
  },
  bodyStack: {
    display: 'grid',
    gap: 16,
  },
  rankingTableWrapper: {
    overflowX: 'auto',
  },
  rankingTable: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 320,
  },
  highlightRow: {
    background: 'rgba(59, 130, 246, 0.15)',
  },
  battleList: {
    display: 'grid',
    gap: 16,
  },
  battleCard: {
    background: 'rgba(15, 23, 42, 0.58)',
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    padding: 18,
    display: 'grid',
    gap: 12,
  },
  battleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  logDetails: {
    background: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 12,
    padding: 12,
  },
  logList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 10,
  },
  primaryButton: {
    background: '#2563eb',
    color: '#f8fafc',
    border: 'none',
    borderRadius: 999,
    padding: '10px 20px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  secondaryButton: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 999,
    padding: '10px 18px',
    color: '#e2e8f0',
    cursor: 'pointer',
  },
  gameSearchLayout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)',
    gap: 20,
  },
  gameSearchColumn: {
    display: 'grid',
    gap: 14,
  },
  gameSearchControls: {
    display: 'grid',
    gridTemplateColumns: '1fr 140px',
    gap: 12,
  },
  gameSearchInput: {
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#f8fafc',
  },
  gameSortSelect: {
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#f8fafc',
  },
  gameList: {
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 20,
    padding: 12,
    maxHeight: '50vh',
    overflowY: 'auto',
    display: 'grid',
    gap: 10,
    background: 'rgba(2, 6, 23, 0.6)',
  },
  loadingText: {
    margin: 0,
    textAlign: 'center',
    color: '#cbd5f5',
  },
  emptyState: {
    margin: 0,
    textAlign: 'center',
    color: '#94a3b8',
  },
  gameListItem: {
    textAlign: 'left',
    display: 'grid',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 18,
    cursor: 'pointer',
  },
  gameListItemActive: {
    border: '2px solid rgba(96, 165, 250, 0.9)',
    background: 'rgba(37, 99, 235, 0.25)',
  },
  gameListItemInactive: {
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.45)',
  },
  gameListTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#f8fafc',
  },
  gameListDescription: {
    fontSize: 12,
    color: '#cbd5f5',
    lineHeight: 1.4,
  },
  gameListMeta: {
    display: 'flex',
    gap: 12,
    fontSize: 12,
    color: '#cbd5f5',
  },
  gameDetail: {
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 24,
    padding: 18,
    background: 'rgba(2, 6, 23, 0.6)',
    minHeight: 320,
    display: 'grid',
  },
  gameDetailBody: {
    display: 'grid',
    gap: 18,
  },
  gameDetailHeader: {
    display: 'grid',
    gap: 8,
  },
  gameDetailTitle: {
    margin: 0,
    fontSize: 20,
    color: '#f8fafc',
  },
  gameDetailDescription: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: '#cbd5f5',
    whiteSpace: 'pre-line',
  },
  gameDetailMeta: {
    display: 'flex',
    gap: 12,
    fontSize: 12,
    color: '#cbd5f5',
  },
  roleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 12,
  },
  roleButton: {
    borderRadius: 18,
    padding: '12px 14px',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'grid',
    gap: 6,
    color: '#f8fafc',
    cursor: 'pointer',
  },
  roleButtonActive: {
    borderColor: 'rgba(96, 165, 250, 0.9)',
    background: 'rgba(37, 99, 235, 0.3)',
  },
  roleSlotMeta: {
    fontSize: 12,
    color: '#cbd5f5',
  },
  participantList: {
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: 18,
    padding: 12,
    display: 'grid',
    gap: 10,
    background: 'rgba(15, 23, 42, 0.55)',
  },
  participantRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#f8fafc',
  },
  participantName: {
    fontWeight: 600,
  },
  participantRole: {
    color: '#cbd5f5',
  },
  enterButton: {
    marginTop: 4,
    padding: '12px 16px',
    borderRadius: 16,
    background: '#2563eb',
    color: '#fff',
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
  },
  bottomNav: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 12,
    padding: '10px 18px',
    borderRadius: 999,
    background: 'rgba(2, 6, 23, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    zIndex: 2,
  },
  backOverlayButton: {
    position: 'fixed',
    right: 24,
    bottom: 24,
    zIndex: 3,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 999,
    padding: '12px 20px',
    background: 'rgba(2, 6, 23, 0.85)',
    color: '#e2e8f0',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 18px 36px rgba(2, 6, 23, 0.45)',
    cursor: 'pointer',
    transition: 'transform 140ms ease, box-shadow 140ms ease, background 140ms ease',
  },
  navButton: {
    background: 'transparent',
    border: 'none',
    color: '#cbd5f5',
    padding: '6px 14px',
    borderRadius: 999,
    cursor: 'pointer',
    fontWeight: 600,
    WebkitTapHighlightColor: 'transparent',
    outline: 'none',
    touchAction: 'manipulation',
  },
  navButtonActive: {
    background: 'rgba(59, 130, 246, 0.75)',
    color: '#f8fafc',
    boxShadow: '0 6px 24px rgba(59, 130, 246, 0.35)',
  },
  overviewBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 20,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    background: 'rgba(2, 6, 23, 0.55)',
    backdropFilter: 'blur(6px)',
  },
  overviewSheet: {
    width: '100%',
    maxWidth: 520,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    background: 'rgba(10, 17, 36, 0.88)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    boxShadow: '0 -24px 48px rgba(2, 6, 23, 0.55)',
    padding: '18px 20px 28px',
    display: 'grid',
    gap: 20,
  },
  overviewHandle: {
    width: 64,
    height: 4,
    borderRadius: 999,
    background: 'rgba(148, 163, 184, 0.35)',
    justifySelf: 'center',
  },
  overviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
  },
  overviewLinkButton: {
    flex: 1,
    textAlign: 'center',
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(56, 189, 248, 0.35)',
    color: '#e0f2fe',
    background: 'rgba(8, 47, 73, 0.55)',
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  overviewSection: {
    display: 'grid',
    gap: 12,
  },
  overviewSectionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: '#bfdbfe',
    letterSpacing: 0.2,
  },
  overviewGameCarousel: {
    display: 'flex',
    gap: 12,
    overflowX: 'auto',
    paddingBottom: 4,
  },
  overviewGameCard: {
    flex: '0 0 140px',
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.65)',
    color: '#f8fafc',
    display: 'grid',
    gridTemplateRows: '96px auto',
    overflow: 'hidden',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  overviewGameCardActive: {
    borderColor: '#38bdf8',
    boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.4)',
  },
  overviewGameImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    background: 'rgba(15, 23, 42, 0.6)',
  },
  overviewGameFallback: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    color: '#94a3b8',
  },
  overviewGameName: {
    padding: '8px 10px',
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.35,
  },
  overviewEmpty: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  overviewMiniCharacter: {
    borderRadius: 22,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    background: 'rgba(15, 23, 42, 0.72)',
    padding: 16,
    display: 'grid',
    gap: 12,
  },
  overviewMiniBody: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  overviewMiniPortrait: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.28)',
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontSize: 12,
  },
  overviewMiniImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  overviewMiniName: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: '#f8fafc',
  },
  overviewMiniNav: {
    display: 'flex',
    gap: 8,
  },
  overviewMiniNavButton: {
    flex: 1,
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    background: 'rgba(30, 41, 59, 0.7)',
    color: '#e2e8f0',
    fontSize: 12,
    padding: '6px 10px',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  overviewMiniNavActive: {
    borderColor: '#38bdf8',
    background: 'rgba(56, 189, 248, 0.18)',
    color: '#f0f9ff',
  },
  overviewCloseButton: {
    marginTop: 4,
    justifySelf: 'end',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.55)',
    color: '#cbd5f5',
    fontSize: 13,
    padding: '6px 14px',
    cursor: 'pointer',
  },
}

function OverviewSheet({
  open,
  onClose,
  navItems,
  activeIndex,
  onNavigate,
  heroName,
  heroImage,
  participations,
  selectedGameId,
  onSelectGame,
  onOpenGame,
}) {
  if (!open) return null

  const navigateToGame = onOpenGame || (() => {})
  const selectGame = onSelectGame || (() => {})

  return (
    <div style={styles.overviewBackdrop} role="dialog" aria-modal="true">
      <div style={styles.overviewSheet}>
        <div style={styles.overviewHandle} aria-hidden />

        <div style={styles.overviewHeader}>
          <Link href="/maker" style={styles.overviewLinkButton} onClick={onClose}>
            게임 제작
          </Link>
          <Link href="/rank/new" style={styles.overviewLinkButton} onClick={onClose}>
            게임 등록
          </Link>
        </div>

        <section style={styles.overviewSection}>
          <h3 style={styles.overviewSectionTitle}>참여한 게임</h3>
          {participations?.length ? (
            <div style={styles.overviewGameCarousel}>
              {participations.map((entry) => {
                const isActive = selectedGameId === entry.game_id
                const game = entry.game || {}
                const label = game.name || '이름 없는 게임'
                const image = game.image_url || game.cover_path
                return (
                  <button
                    key={`${entry.game_id}:${entry.slot_no ?? 'slot'}`}
                    type="button"
                    onClick={() => {
                      selectGame(entry.game_id)
                      navigateToGame(game, entry.role)
                      onClose()
                    }}
                    style={{
                      ...styles.overviewGameCard,
                      ...(isActive ? styles.overviewGameCardActive : null),
                    }}
                  >
                    {image ? (
                      <img src={image} alt={label} style={styles.overviewGameImage} />
                    ) : (
                      <div style={styles.overviewGameFallback}>이미지 없음</div>
                    )}
                    <div style={styles.overviewGameName}>{label}</div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p style={styles.overviewEmpty}>참여한 게임이 아직 없습니다.</p>
          )}
        </section>

        <section style={styles.overviewMiniCharacter}>
          <div style={styles.overviewMiniBody}>
            <div style={styles.overviewMiniPortrait}>
              {heroImage ? (
                <img src={heroImage} alt="캐릭터" style={styles.overviewMiniImage} />
              ) : (
                '이미지 없음'
              )}
            </div>
            <div>
              <p style={styles.overviewMiniName}>{heroName}</p>
              <p style={styles.overviewEmpty}>원하는 탭을 선택해 이동하세요.</p>
            </div>
          </div>
          <div style={styles.overviewMiniNav}>
            {navItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                style={{
                  ...styles.overviewMiniNavButton,
                  ...(index === activeIndex ? styles.overviewMiniNavActive : null),
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <button type="button" onClick={onClose} style={styles.overviewCloseButton}>
          닫기
        </button>
      </div>
    </div>
  )
}
