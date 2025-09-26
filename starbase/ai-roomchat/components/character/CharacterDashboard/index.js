'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { SORT_OPTIONS } from '@/components/lobby/constants'
import useGameBrowser from '@/components/lobby/hooks/useGameBrowser'

import EditHeroModal from './sections/EditHeroModal'
import { CharacterDashboardProvider, useCharacterDashboardContext } from './context'

const NAV_ITEMS = [
  { id: 'game', label: '게임 찾기' },
  { id: 'character', label: '캐릭터' },
  { id: 'ranking', label: '랭킹' },
]

const PANEL_COUNT = NAV_ITEMS.length

function clampPanelIndex(index) {
  if (index < 0) return 0
  if (index >= PANEL_COUNT) return PANEL_COUNT - 1
  return index
}

export default function CharacterDashboard({
  dashboard,
  heroId: explicitHeroId,
  heroName,
  onStartBattle,
  onBack,
}) {
  const { profile, participation, battles, heroName: fallbackName } = dashboard

  const [panelIndex, setPanelIndex] = useState(1)
  const [editOpen, setEditOpen] = useState(false)
  const [gameSearchEnabled, setGameSearchEnabled] = useState(false)
  const [overviewMode, setOverviewMode] = useState(false)
  const pageRef = useRef(null)
  const swipeViewportRef = useRef(null)
  const scrollFrame = useRef(0)
  const scrollIdleTimeoutRef = useRef(0)
  const activePanelRef = useRef(1)
  const programmaticScrollRef = useRef(false)
  const programmaticReleaseRef = useRef(0)
  const swipeGestureRef = useRef({ startX: 0, lastX: 0, startIndex: 1, active: false })
  const pinchTrackerRef = useRef({ active: false, initialDistance: 0 })

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

  const overviewGameItems = useMemo(() => {
    if (Array.isArray(gameBrowser?.gameRows) && gameBrowser.gameRows.length) {
      return gameBrowser.gameRows.map((row, index) => ({
        key: row.id || row.slug || `game-${index}`,
        name: row.name || '이름 없는 게임',
        description: row.description || '',
        image: row.image_url || '',
        source: row,
      }))
    }

    if (Array.isArray(participation?.statSlides) && participation.statSlides.length) {
      return participation.statSlides.map((slide, index) => ({
        key: slide.key || `stat-${index}`,
        name: slide.name || '이름 없는 게임',
        description: slide.role || '',
        image: slide.image || '',
        source: slide.game || null,
      }))
    }

    return []
  }, [gameBrowser?.gameRows, participation?.statSlides])

  const overviewCarouselItems = useMemo(() => {
    if (!overviewGameItems.length) return []
    const cycles = overviewGameItems.length > 4 ? 2 : 3
    const items = []
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      overviewGameItems.forEach((item, index) => {
        items.push({ ...item, repeatKey: `${item.key}-repeat-${cycle}-${index}` })
      })
    }
    return items
  }, [overviewGameItems])
  const scrollToPanel = useCallback((targetIndex, behavior = 'smooth') => {
    const node = swipeViewportRef.current
    if (!node) return

    const clampedIndex = clampPanelIndex(targetIndex)
    const width = node.clientWidth || 1
    const targetLeft = clampedIndex * width

    if (
      Math.abs(node.scrollLeft - targetLeft) < 1 &&
      activePanelRef.current === clampedIndex
    ) {
      return
    }

    programmaticScrollRef.current = true

    if (typeof window !== 'undefined') {
      window.clearTimeout(programmaticReleaseRef.current)
    }

    node.scrollTo({ left: targetLeft, behavior })
    activePanelRef.current = clampedIndex
    setPanelIndex(clampedIndex)

    if (typeof window !== 'undefined') {
      const delay = behavior === 'smooth' ? 420 : 0
      programmaticReleaseRef.current = window.setTimeout(() => {
        programmaticScrollRef.current = false
      }, delay)
    } else {
      programmaticScrollRef.current = false
    }
  }, [])

  useEffect(() => {
    const node = swipeViewportRef.current
    if (!node) return undefined

    const handleScroll = () => {
      cancelAnimationFrame(scrollFrame.current)
      scrollFrame.current = requestAnimationFrame(() => {
        const width = node.clientWidth || 1
        const ratio = node.scrollLeft / width
        const nextIndex = clampPanelIndex(Math.round(ratio))
        if (nextIndex !== activePanelRef.current) {
          activePanelRef.current = nextIndex
          setPanelIndex(nextIndex)
        }
      })

      if (programmaticScrollRef.current) {
        return
      }

      if (typeof window !== 'undefined') {
        window.clearTimeout(scrollIdleTimeoutRef.current)
        scrollIdleTimeoutRef.current = window.setTimeout(() => {
          const width = node.clientWidth || 1
          const ratio = node.scrollLeft / width
          const targetIndex = clampPanelIndex(Math.round(ratio))
          const targetLeft = targetIndex * width

          if (Math.abs(node.scrollLeft - targetLeft) > 1) {
            scrollToPanel(targetIndex)
          }
        }, 120)
      }
    }

    node.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      cancelAnimationFrame(scrollFrame.current)
      node.removeEventListener('scroll', handleScroll)
      if (typeof window !== 'undefined') {
        window.clearTimeout(scrollIdleTimeoutRef.current)
      }
    }
  }, [scrollToPanel])

  useEffect(() => {
    const node = swipeViewportRef.current
    if (!node) return undefined

    const handleTouchStart = (event) => {
      if (event.touches.length === 1) {
        const point = event.touches[0]
        swipeGestureRef.current = {
          startX: point.clientX,
          lastX: point.clientX,
          startIndex: activePanelRef.current,
          active: true,
        }
      } else {
        swipeGestureRef.current.active = false
      }
    }

    const handleTouchMove = (event) => {
      if (!swipeGestureRef.current.active || event.touches.length !== 1) return
      swipeGestureRef.current.lastX = event.touches[0].clientX
    }

    const handleTouchEnd = () => {
      if (!swipeGestureRef.current.active) return
      const width = node.clientWidth || 1
      const { startX, lastX, startIndex } = swipeGestureRef.current
      const delta = lastX - startX
      const threshold = width * 0.2
      let targetIndex = startIndex
      if (Math.abs(delta) > threshold) {
        targetIndex = clampPanelIndex(startIndex + (delta < 0 ? 1 : -1))
      } else {
        targetIndex = clampPanelIndex(Math.round(node.scrollLeft / width))
      }

      swipeGestureRef.current.active = false
      scrollToPanel(targetIndex)
    }

    node.addEventListener('touchstart', handleTouchStart, { passive: true })
    node.addEventListener('touchmove', handleTouchMove, { passive: true })
    node.addEventListener('touchend', handleTouchEnd)
    node.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
      node.removeEventListener('touchend', handleTouchEnd)
      node.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [scrollToPanel])

  useEffect(() => {
    if ((panelIndex === 0 || overviewMode) && !gameSearchEnabled) {
      setGameSearchEnabled(true)
    }
  }, [panelIndex, overviewMode, gameSearchEnabled])

  useEffect(() => {
    scrollToPanel(panelIndex, 'auto')
  }, [panelIndex, scrollToPanel])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        window.clearTimeout(programmaticReleaseRef.current)
        window.clearTimeout(scrollIdleTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const node = pageRef.current
    if (!node) return undefined

    const distance = (touches) => {
      if (!touches || touches.length < 2) return 0
      const [a, b] = touches
      if (!a || !b) return 0
      const dx = a.clientX - b.clientX
      const dy = a.clientY - b.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (event) => {
      if (event.touches.length === 2) {
        pinchTrackerRef.current = {
          active: true,
          initialDistance: distance(event.touches),
        }
      }
    }

    const handleTouchMove = (event) => {
      if (!pinchTrackerRef.current.active || event.touches.length !== 2) return
      const currentDistance = distance(event.touches)
      const initial = pinchTrackerRef.current.initialDistance || currentDistance
      if (!overviewMode && currentDistance < initial * 0.82) {
        pinchTrackerRef.current.active = false
        setOverviewMode(true)
      } else if (overviewMode && currentDistance > initial * 1.15) {
        pinchTrackerRef.current.active = false
        setOverviewMode(false)
      }
    }

    const handleTouchEnd = (event) => {
      if (event.touches.length < 2) {
        pinchTrackerRef.current = { active: false, initialDistance: 0 }
      }
    }

    node.addEventListener('touchstart', handleTouchStart, { passive: true })
    node.addEventListener('touchmove', handleTouchMove, { passive: true })
    node.addEventListener('touchend', handleTouchEnd, { passive: true })
    node.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
      node.removeEventListener('touchend', handleTouchEnd)
      node.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [overviewMode])

  const panels = useMemo(
    () => [
      {
        id: 'game',
        label: '게임 찾기',
        render: () => <GamePanel browser={gameBrowser} onEnterGame={onStartBattle} />,
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
    [gameBrowser, onStartBattle],
  )

  const handleNavClick = useCallback(
    (targetId) => {
      const targetIndex = NAV_ITEMS.findIndex((item) => item.id === targetId)
      if (targetIndex >= 0) {
        scrollToPanel(targetIndex)
      }
    },
    [scrollToPanel],
  )

  const handleOverviewNav = useCallback(
    (targetId) => {
      handleNavClick(targetId)
      setOverviewMode(false)
    },
    [handleNavClick],
  )

  const handleSelectOverviewGame = useCallback(
    (item) => {
      if (item?.source && typeof gameBrowser?.setSelectedGame === 'function') {
        gameBrowser.setSelectedGame(item.source)
      }
      handleNavClick('game')
      setOverviewMode(false)
    },
    [gameBrowser, handleNavClick],
  )

  const handleCloseOverview = useCallback(() => {
    setOverviewMode(false)
  }, [])

  return (
    <CharacterDashboardProvider value={contextValue}>
      <div ref={pageRef} style={styles.page}>
        <div style={backgroundStyle} aria-hidden />
        <div style={styles.backgroundTint} aria-hidden />

        <div
          style={{
            ...styles.content,
            pointerEvents: overviewMode ? 'none' : 'auto',
            filter: overviewMode ? 'blur(2px)' : 'none',
          }}
          aria-hidden={overviewMode}
        >
          {!overviewMode ? (
            <p style={styles.swipeHint}>좌우로 밀어 캐릭터, 랭킹, 게임 찾기를 오갈 수 있어요.</p>
          ) : null}

          <div
            ref={swipeViewportRef}
            style={{
              ...styles.swipeViewport,
              pointerEvents: overviewMode ? 'none' : 'auto',
            }}
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

        {!overviewMode ? (
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
        ) : null}
      </div>
      {onBack ? (
        <button type="button" onClick={onBack} style={styles.backOverlayButton}>
          ← 뒤로가기
        </button>
      ) : null}
      {overviewMode ? (
        <div style={styles.overviewOverlay} role="dialog" aria-modal="true">
          <div style={styles.overviewTopBar}>
            <div style={styles.overviewTopTabs}>
              <button type="button" style={styles.overviewTopButton}>
                게임 제작
              </button>
              <button type="button" style={styles.overviewTopButton}>
                게임 등록
              </button>
            </div>
            <button type="button" onClick={handleCloseOverview} style={styles.overviewCloseButton}>
              닫기
            </button>
          </div>
          <div style={styles.overviewCarousel}>
            {overviewCarouselItems.length ? (
              <div style={styles.overviewCarouselTrack}>
                {overviewCarouselItems.map((item) => (
                  <button
                    key={item.repeatKey}
                    type="button"
                    onClick={() => handleSelectOverviewGame(item)}
                    style={styles.overviewGameCard}
                  >
                    {item.image ? (
                      <img src={item.image} alt={`${item.name} 이미지`} style={styles.overviewGameImage} />
                    ) : (
                      <div style={styles.overviewGameImageFallback}>이미지 없음</div>
                    )}
                    <div>
                      <p style={styles.overviewGameName}>{item.name}</p>
                      {item.description ? (
                        <p style={styles.overviewGameMeta}>{item.description}</p>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p style={styles.overviewEmpty}>표시할 게임이 없습니다.</p>
            )}
          </div>
          <div style={styles.overviewBottomTabs}>
            {NAV_ITEMS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOverviewNav(item.id)}
                style={{
                  ...styles.overviewBottomButton,
                  ...(panelIndex === index ? styles.overviewBottomButtonActive : null),
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p style={styles.overviewHint}>손가락을 벌리거나 닫기 버튼을 누르면 원래 화면으로 돌아갑니다.</p>
        </div>
      ) : null}
      <EditHeroModal open={editOpen} onClose={() => setEditOpen(false)} />
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
    hero,
    heroName,
    heroImage,
    edit,
    abilityCards = [],
    openEditPanel,
    statSlides = [],
    selectedGameId,
  } = useCharacterDashboardContext()

  const [overlayStep, setOverlayStep] = useState(0)

  const description = edit?.description || hero?.description || '설명이 입력되지 않았습니다.'

  const prioritizedStatSlide = useMemo(() => {
    if (!statSlides.length) return null
    return statSlides.find((slide) => slide.key === selectedGameId) || statSlides[0]
  }, [statSlides, selectedGameId])

  const statsOverlayLines = useMemo(() => {
    if (!prioritizedStatSlide) return ['표시할 통계가 없습니다.']
    const label = prioritizedStatSlide.name
      ? `${prioritizedStatSlide.name}${
          prioritizedStatSlide.role ? ` (${prioritizedStatSlide.role})` : ''
        }`
      : null
    const statLines = (prioritizedStatSlide.stats || [])
      .slice(0, 4)
      .map((stat) => `${stat.label}: ${stat.value ?? '—'}`)

    return [label, ...statLines].filter(Boolean)
  }, [prioritizedStatSlide])

  const overlayData = useMemo(() => {
    if (overlayStep === 0) return null

    if (overlayStep === 1) {
      const lines = description
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      return {
        title: '캐릭터 설명',
        lines: lines.length ? lines : ['설명이 입력되지 않았습니다.'],
      }
    }

    if (overlayStep === 2) {
      const abilityLines = abilityCards
        .slice(0, 4)
        .map((ability, index) => {
          const label = ability.label || `능력 ${index + 1}`
          return `${label}: ${ability.value || '미입력'}`
        })
      return {
        title: '능력 정보',
        lines: abilityLines.length ? abilityLines : ['등록된 능력이 없습니다.'],
      }
    }

    const statLines = statsOverlayLines.length ? statsOverlayLines : ['표시할 통계가 없습니다.']
    return {
      title: '통계 정보',
      lines: statLines,
    }
  }, [overlayStep, description, abilityCards, statsOverlayLines])

  const overlayActive = Boolean(overlayData)
  const overlayFontSize = overlayActive
    ? computeOverlayFontSize(overlayData.lines.join(' '))
    : undefined
  const overlayLines = overlayData?.lines || []
  const overlayTitle = overlayData?.title || ''

  const handleToggleOverlay = useCallback(() => {
    setOverlayStep((prev) => (prev + 1) % 4)
  }, [])

  const handleOpenEdit = useCallback(
    (event) => {
      event.stopPropagation()
      event.preventDefault()
      openEditPanel()
    },
    [openEditPanel],
  )
  return (
    <div style={styles.heroSection}>
      <div style={styles.heroPortraitWrapper}>
        <button type="button" onClick={handleToggleOverlay} style={styles.heroPortraitButton}>
          {heroImage ? (
            <img
              src={heroImage}
              alt={`${heroName} 이미지`}
              style={{
                ...styles.heroImage,
                ...(overlayActive ? styles.heroImageDimmed : null),
              }}
            />
          ) : (
            <div style={styles.heroPlaceholder}>이미지 없음</div>
          )}
          <div
            aria-hidden
            style={{
              ...styles.heroOverlayTint,
              opacity: overlayActive ? 1 : 0,
            }}
          />
          <div
            style={{
              ...styles.heroOverlayContentWrap,
              opacity: overlayActive ? 1 : 0,
              transform: overlayActive ? 'translateY(0)' : 'translateY(18px)',
            }}
          >
            <div
              key={overlayStep}
              style={{
                ...styles.heroOverlayPanel,
                fontSize: overlayFontSize,
                opacity: overlayActive ? 1 : 0,
                transform: overlayActive ? 'translateY(0)' : 'translateY(12px)',
              }}
            >
              <strong style={styles.heroOverlayTitle}>{overlayTitle}</strong>
              <div style={styles.heroOverlayBody}>
                {overlayLines.map((line, index) => (
                  <span key={index} style={styles.heroOverlayLine}>
                    {line}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div
            style={{
              ...styles.heroNameTag,
              opacity: overlayActive ? 0 : 1,
              transform: overlayActive ? 'translateY(12px)' : 'translateY(0)',
            }}
          >
            <span style={styles.heroNameText}>{heroName}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={handleOpenEdit}
          style={styles.heroEditButton}
          aria-label="프로필 편집"
        >
          <span aria-hidden="true" style={styles.heroEditGrid}>
            {Array.from({ length: 9 }).map((_, index) => (
              <span key={index} style={styles.heroEditDot} />
            ))}
          </span>
        </button>
      </div>
      <div style={styles.battleLogWrapper}>
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
                      key={row.id || `${row.hero_id}-${row.owner_id || index}`}
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
  } = useCharacterDashboardContext()

  return (
    <div style={styles.panelContent}>
      <SectionCard title="전투 로그">
        {battleLoading ? (
          <p style={styles.bodyText}>전투 기록을 불러오는 중…</p>
        ) : battleError ? (
          <p style={styles.bodyText}>{battleError}</p>
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
      </SectionCard>
    </div>
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
  } = browser

  const [submitHint, setSubmitHint] = useState('')

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
    if (onEnterGame) {
      onEnterGame(selectedGame, roleChoice)
      return
    }
    setSubmitHint('자동 입장은 비활성화되었습니다. 선택한 게임 정보를 확인하세요.')
  }, [onEnterGame, roleChoice, selectedGame])

  useEffect(() => {
    if (!selectedGame) {
      setSubmitHint('')
    }
  }, [selectedGame])

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
                {SORT_OPTIONS.map((option) => (
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
              <p style={styles.emptyState}>게임을 선택하면 상세 정보가 표시됩니다.</p>
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
                        const full = slot.occupied >= slot.capacity
                        const isActive = roleChoice === role.name
                        return (
                          <button
                            key={role.id || role.name}
                            type="button"
                            onClick={() => (full ? null : handleSelectRole(role.name))}
                            style={{
                              ...styles.roleButton,
                              ...(isActive ? styles.roleButtonActive : null),
                              ...(full ? styles.roleButtonDisabled : null),
                            }}
                            disabled={full}
                          >
                            <span>{role.name}</span>
                            <span style={styles.roleSlotMeta}>
                              {slot.occupied}/{slot.capacity} 참여 중
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
                {submitHint ? <p style={styles.submitHint}>{submitHint}</p> : null}
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

function computeOverlayFontSize(text) {
  const length = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().length : 0
  if (length > 400) return 11
  if (length > 320) return 12
  if (length > 240) return 14
  if (length > 180) return 15
  if (length > 120) return 16
  if (length > 80) return 18
  return 20
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
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    transform: 'translateZ(0)',
    zIndex: 0,
  },
  backgroundFallback: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'radial-gradient(circle at 20% 20%, #1e293b, #020617)',
    zIndex: 0,
  },
  backgroundTint: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.4) 0%, rgba(2, 6, 23, 0.85) 100%)',
    zIndex: 0,
  },
  content: {
    position: 'relative',
    zIndex: 1,
    padding: '32px 16px 120px',
    display: 'grid',
    gap: 32,
  },
  bgmPlayer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    background: 'rgba(15, 23, 42, 0.7)',
  },
  heroSection: {
    maxWidth: 960,
    margin: '0 auto',
    display: 'grid',
    gap: 32,
    justifyItems: 'center',
    width: '100%',
  },
  heroPortraitWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: '3 / 4',
    borderRadius: 32,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.55)',
    maxWidth: 520,
    margin: '0 auto',
  },
  heroPortraitButton: {
    position: 'relative',
    width: '100%',
    height: '100%',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    display: 'block',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'filter 220ms ease, opacity 220ms ease',
    willChange: 'filter',
  },
  heroImageDimmed: {
    filter: 'brightness(0.72)',
  },
  heroPlaceholder: {
    color: '#94a3b8',
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  heroOverlayTint: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(2,6,23,0.35) 0%, rgba(2,6,23,0.8) 100%)',
    transition: 'opacity 200ms ease',
    pointerEvents: 'none',
  },
  heroNameTag: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    padding: '10px 16px',
    borderRadius: 20,
    background: 'rgba(15, 23, 42, 0.78)',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    pointerEvents: 'none',
    opacity: 1,
    transform: 'translateY(0)',
    transition: 'opacity 220ms ease, transform 260ms ease',
  },
  heroNameText: {
    fontSize: 20,
    color: '#f8fafc',
    fontWeight: 600,
    textShadow: '0 2px 8px rgba(2, 6, 23, 0.85)',
  },
  heroOverlayContentWrap: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    pointerEvents: 'none',
    opacity: 0,
    transform: 'translateY(18px)',
    transition: 'opacity 220ms ease, transform 260ms ease',
  },
  heroOverlayPanel: {
    width: '100%',
    background: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 22,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    padding: '18px 20px',
    lineHeight: 1.4,
    display: 'grid',
    gap: 12,
    color: '#f8fafc',
    opacity: 0,
    transform: 'translateY(12px)',
    transition: 'opacity 220ms ease, transform 260ms ease',
  },
  heroOverlayTitle: {
    fontSize: 'inherit',
    fontWeight: 700,
  },
  heroOverlayBody: {
    display: 'grid',
    gap: 6,
    fontSize: 'inherit',
    wordBreak: 'break-word',
    textAlign: 'left',
  },
  heroOverlayLine: {
    fontSize: 'inherit',
  },
  heroEditButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 42,
    height: 42,
    borderRadius: 16,
    border: '1px solid rgba(148, 163, 184, 0.5)',
    background: 'rgba(2, 6, 23, 0.75)',
    color: '#f8fafc',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEditGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 3,
    width: 18,
    height: 18,
  },
  heroEditDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: '#f8fafc',
  },
  battleLogWrapper: {
    width: '100%',
    maxWidth: 960,
  },
  swipeHint: {
    margin: 0,
    textAlign: 'center',
    color: '#cbd5f5',
    fontSize: 13,
  },
  swipeViewport: {
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    scrollSnapStop: 'always',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorX: 'contain',
  },
  swipeTrack: {
    display: 'flex',
  },
  swipePanel: {
    minWidth: '100%',
    scrollSnapAlign: 'start',
    scrollSnapStop: 'always',
    padding: '4px 0',
  },
  panelContent: {
    display: 'grid',
    gap: 24,
  },
  sectionCard: {
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    background: 'rgba(15, 23, 42, 0.82)',
    padding: 24,
    display: 'grid',
    gap: 18,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    color: '#f8fafc',
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
  roleButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
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
  submitHint: {
    margin: '8px 0 0',
    fontSize: 13,
    color: '#94a3b8',
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
    right: 16,
    bottom: 28,
    zIndex: 3,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 999,
    padding: '10px 16px',
    background: 'rgba(2, 6, 23, 0.85)',
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: 14,
    letterSpacing: '-0.01em',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 12px 28px rgba(2, 6, 23, 0.4)',
    cursor: 'pointer',
    transition: 'transform 140ms ease, box-shadow 140ms ease, background 140ms ease',
  },
  overviewOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 5,
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',
    gap: 24,
    padding: '32px 20px 28px',
    background: 'rgba(2, 6, 23, 0.92)',
    backdropFilter: 'blur(16px)',
  },
  overviewTopBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  overviewTopTabs: {
    display: 'flex',
    gap: 12,
  },
  overviewTopButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.7)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
  overviewCloseButton: {
    padding: '8px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'rgba(148, 163, 184, 0.25)',
    color: '#f8fafc',
    fontWeight: 600,
    cursor: 'pointer',
  },
  overviewCarousel: {
    position: 'relative',
    overflow: 'hidden',
  },
  overviewCarouselTrack: {
    display: 'flex',
    gap: 18,
    overflowX: 'auto',
    padding: '12px 8px',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
  },
  overviewGameCard: {
    minWidth: 220,
    maxWidth: 260,
    borderRadius: 24,
    padding: 16,
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    display: 'grid',
    gap: 12,
    scrollSnapAlign: 'center',
    cursor: 'pointer',
    textAlign: 'left',
  },
  overviewGameImage: {
    width: '100%',
    height: 140,
    borderRadius: 18,
    objectFit: 'cover',
    background: 'rgba(15, 23, 42, 0.6)',
  },
  overviewGameImageFallback: {
    width: '100%',
    height: 140,
    borderRadius: 18,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontSize: 13,
  },
  overviewGameName: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#f8fafc',
  },
  overviewGameMeta: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
    lineHeight: 1.5,
  },
  overviewBottomTabs: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
  },
  overviewBottomButton: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.65)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
  overviewBottomButtonActive: {
    background: 'rgba(59, 130, 246, 0.78)',
    color: '#f8fafc',
    boxShadow: '0 6px 24px rgba(59, 130, 246, 0.35)',
  },
  overviewEmpty: {
    margin: 0,
    textAlign: 'center',
    color: '#94a3b8',
  },
  overviewHint: {
    margin: 0,
    textAlign: 'center',
    color: '#64748b',
    fontSize: 13,
  },
  navButton: {
    background: 'transparent',
    border: 'none',
    color: '#cbd5f5',
    padding: '6px 14px',
    borderRadius: 999,
    cursor: 'pointer',
    fontWeight: 600,
  },
  navButtonActive: {
    background: 'rgba(59, 130, 246, 0.75)',
    color: '#f8fafc',
    boxShadow: '0 6px 24px rgba(59, 130, 246, 0.35)',
  },
}
