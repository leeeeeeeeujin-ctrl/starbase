'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { SORT_OPTIONS } from '@/components/lobby/constants'
import useGameBrowser from '@/components/lobby/hooks/useGameBrowser'
import ChatOverlay from '@/components/social/ChatOverlay'
import FriendOverlay from '@/components/social/FriendOverlay'
import { useHeroSocial } from '@/hooks/social/useHeroSocial'

import EditHeroModal from './sections/EditHeroModal'
import { CharacterDashboardProvider, useCharacterDashboardContext } from './context'

const NAV_ITEMS = [
  { id: 'game', label: '게임 찾기' },
  { id: 'character', label: '캐릭터' },
  { id: 'ranking', label: '랭킹' },
]

const PANEL_COUNT = NAV_ITEMS.length

const PANEL_DESCRIPTIONS = {
  game: '참여할 게임을 살펴보고 즉시 입장할 수 있어요.',
  character: '영웅과 관련된 정보와 전투 기록을 한 화면에서 확인하세요.',
  ranking: '참여 중인 게임의 순위를 확인해 보세요.',
}

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
  const [scrollProgress, setScrollProgress] = useState(1)
  const [editOpen, setEditOpen] = useState(false)
  const [gameSearchEnabled, setGameSearchEnabled] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [chatUnread, setChatUnread] = useState(0)
  const [blockedHeroes, setBlockedHeroes] = useState([])
  const swipeViewportRef = useRef(null)
  const scrollFrame = useRef(0)
  const chatOverlayRef = useRef(null)

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
  useEffect(() => {
    const node = swipeViewportRef.current
    if (!node) return undefined

    const handleScroll = () => {
      cancelAnimationFrame(scrollFrame.current)
      scrollFrame.current = requestAnimationFrame(() => {
        const width = node.clientWidth || 1
        const ratio = node.scrollLeft / width
        setScrollProgress(ratio)
        const baseIndex = Math.floor(ratio)
        const offset = ratio - baseIndex
        const maxIndex = PANEL_COUNT - 1
        const clampedBase = Math.max(0, Math.min(maxIndex, baseIndex))

        setPanelIndex((prev) => {
          let target = prev
          if (offset >= 0.66) {
            target = Math.min(maxIndex, clampedBase + 1)
          } else if (offset <= 0.34) {
            target = clampedBase
          }
          if (target > prev + 1) target = prev + 1
          if (target < prev - 1) target = prev - 1
          return target
        })
      })
    }

    node.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      cancelAnimationFrame(scrollFrame.current)
      node.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    const node = swipeViewportRef.current
    if (!node) return

    const width = node.clientWidth || 1
    if (Math.round(node.scrollLeft / width) === panelIndex) {
      return
    }

    node.scrollTo({ left: panelIndex * width, behavior: 'smooth' })
  }, [panelIndex])

  useEffect(() => {
    setScrollProgress(panelIndex)
  }, [panelIndex])

  useEffect(() => {
    if (panelIndex === 0 && !gameSearchEnabled) {
      setGameSearchEnabled(true)
    }
  }, [panelIndex, gameSearchEnabled])

  useEffect(() => {
    const node = swipeViewportRef.current
    if (!node) return
    const width = node.clientWidth || 1
    node.scrollLeft = width * panelIndex
    setScrollProgress(panelIndex)
  }, [])

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
      setPanelIndex(targetIndex)
      setScrollProgress(targetIndex)
    }
  }, [])

  const characterDescription = participation.selectedGame?.name
    ? `현재 선택한 게임 · ${participation.selectedGame.name}`
    : PANEL_DESCRIPTIONS.character
  const activePanel = panels[panelIndex] || panels[1]
  const social = useHeroSocial({
    heroId: profile.hero?.id || explicitHeroId || null,
    heroName: displayName,
    viewerHero: profile.hero
      ? {
          heroId: profile.hero.id,
          heroName: profile.hero.name || displayName,
          avatarUrl: profile.hero.image_url || null,
          ownerId: profile.hero.owner_id || null,
        }
      : null,
    page: activePanel?.id ? `character:${activePanel.id}` : 'character',
  })
  const viewerHeroHint = useMemo(() => {
    if (profile.hero?.id) {
      return {
        heroId: profile.hero.id,
        heroName: profile.hero.name || displayName,
        avatarUrl: profile.hero.image_url || null,
        ownerId: profile.hero.owner_id || null,
      }
    }
    if (social.viewer) {
      return {
        heroId: social.viewer.hero_id,
        heroName: social.viewer.name,
        avatarUrl: social.viewer.avatar_url,
        ownerId: social.viewer.owner_id,
        userId: social.viewer.user_id,
      }
    }
    return null
  }, [displayName, profile.hero, social.viewer])
  const showHeroHeader = activePanel?.id === 'character'
  const headerSlides = useMemo(
    () =>
      panels.map((panel) => ({
        id: panel.id,
        title: panel.id === 'character' ? displayName : panel.label,
        description:
          panel.id === 'character'
            ? characterDescription
            : PANEL_DESCRIPTIONS[panel.id] || '',
        showBgm: panel.id === 'character',
      })),
    [characterDescription, displayName, panels],
  )
  const friendByOwner = social.friendByOwner ?? new Map()
  const friendByHero = social.friendByHero ?? new Map()
  const blockedHeroSet = useMemo(() => new Set(blockedHeroes || []), [blockedHeroes])

  const updateBlockedHeroes = useCallback((next) => {
    setBlockedHeroes((prev) => {
      const computed = typeof next === 'function' ? next(prev) : next
      const normalized = Array.from(new Set((computed || []).filter(Boolean)))
      if (prev.length === normalized.length && prev.every((id, index) => id === normalized[index])) {
        return prev
      }
      return normalized
    })
  }, [])

  const handleToggleBlockedHero = useCallback(
    (heroId) => {
      if (!heroId) return
      updateBlockedHeroes((prev) => {
        if (prev.includes(heroId)) {
          return prev.filter((id) => id !== heroId)
        }
        return [...prev, heroId]
      })
    },
    [updateBlockedHeroes],
  )

  const extraWhisperTargets = useMemo(() => {
    if (!social.friends?.length) return []
    const seen = new Set()
    const entries = []
    for (const friend of social.friends) {
      if (friend.currentHeroId && !seen.has(friend.currentHeroId)) {
        entries.push({
          heroId: friend.currentHeroId,
          username: friend.currentHeroName || `${friend.friendHeroName || '친구'} (현재)`,
        })
        seen.add(friend.currentHeroId)
      }
      if (friend.friendHeroId && !seen.has(friend.friendHeroId)) {
        entries.push({
          heroId: friend.friendHeroId,
          username: friend.friendHeroName || '친구',
        })
        seen.add(friend.friendHeroId)
      }
    }
    return entries
  }, [social.friends])

  const isFriendHero = useCallback(
    (hero) => {
      if (!hero) return false
      if (hero.ownerId && friendByOwner.get(hero.ownerId)) return true
      if (hero.heroId && friendByHero.get(hero.heroId)) return true
      return false
    },
    [friendByHero, friendByOwner],
  )

  const handleAddFriendFromChat = useCallback(
    async (hero) => {
      const targetId = hero?.heroId
      if (!targetId) return { ok: false, error: '캐릭터 ID를 확인할 수 없습니다.' }
      if (blockedHeroSet.has(targetId)) {
        return { ok: false, error: '차단한 캐릭터입니다.' }
      }
      return social.addFriend({ heroId: targetId })
    },
    [blockedHeroSet, social],
  )

  const handleRemoveFriendFromChat = useCallback(
    async (hero) => {
      const friend =
        (hero?.ownerId && friendByOwner.get(hero.ownerId)) ||
        (hero?.heroId && friendByHero.get(hero.heroId))
      if (!friend) {
        return { ok: false, error: '친구 목록에서 찾을 수 없습니다.' }
      }
      return social.removeFriend(friend)
    },
    [friendByHero, friendByOwner, social],
  )

  const handleFriendOverlayAdd = useCallback(
    async ({ heroId: targetHeroId }) => social.addFriend({ heroId: targetHeroId }),
    [social],
  )

  const handleOpenWhisper = useCallback(
    (targetHeroId) => {
      if (!targetHeroId) return
      setChatOpen(true)
      chatOverlayRef.current?.openThread(targetHeroId)
    },
    [],
  )

  const handleCloseChat = useCallback(() => {
    setChatOpen(false)
    chatOverlayRef.current?.resetThread?.()
  }, [])

  return (
    <CharacterDashboardProvider value={contextValue}>
      <div style={styles.page}>
        <div style={backgroundStyle} aria-hidden />
        <div style={styles.backgroundTint} aria-hidden />

        <div style={styles.content}>
          <header style={styles.header}>
            <div style={styles.headerCarousel}>
              <div
                style={{
                  ...styles.headerTrack,
                  width: `${headerSlides.length * 100}%`,
                  transform: `translateX(-${(scrollProgress * 100) / headerSlides.length}%)`,
                }}
              >
                {headerSlides.map((slide) => (
                  <div
                    key={slide.id}
                    style={{
                      ...styles.headerSlide,
                      width: `${100 / headerSlides.length}%`,
                    }}
                  >
                    <h1 style={styles.title}>{slide.title}</h1>
                    {slide.description ? <p style={styles.subtitle}>{slide.description}</p> : null}
                    {slide.showBgm && audioSource ? (
                      <div style={styles.bgmWrapper}>
                        <span style={styles.bgmLabel}>{profile.bgm?.label || '배경 음악'}</span>
                        <audio
                          key={audioSource}
                          controls
                          loop
                          src={audioSource}
                          style={styles.bgmPlayer}
                        >
                          {profile.bgm?.label || '배경 음악'}
                        </audio>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div style={styles.headerActions}>
              {onBack ? (
                <button type="button" onClick={onBack} style={styles.secondaryButton}>
                  뒤로 가기
                </button>
              ) : null}
              {showHeroHeader ? (
                <button type="button" onClick={() => setEditOpen(true)} style={styles.primaryButton}>
                  프로필 편집
                </button>
              ) : null}
            </div>
          </header>

          <p style={styles.swipeHint}>좌우로 밀어 캐릭터, 랭킹, 게임 찾기를 오갈 수 있어요.</p>

          <div ref={swipeViewportRef} style={styles.swipeViewport}>
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
        <div style={styles.overlayButtons}>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            style={styles.overlayButton}
            title="공용 채팅"
          >
            💬
            {chatUnread ? <span style={styles.overlayBadge}>{chatUnread}</span> : null}
          </button>
          <button
            type="button"
            onClick={() => setFriendsOpen(true)}
            style={styles.overlayButton}
            title="친구 관리"
          >
            👥
          </button>
        </div>
      </div>
      <EditHeroModal open={editOpen} onClose={() => setEditOpen(false)} />
      <ChatOverlay
        ref={chatOverlayRef}
        open={chatOpen}
        onClose={handleCloseChat}
        heroId={profile.hero?.id}
        viewerHero={viewerHeroHint}
        extraWhisperTargets={extraWhisperTargets}
        blockedHeroes={blockedHeroes}
        onUnreadChange={setChatUnread}
        onBlockedHeroesChange={updateBlockedHeroes}
        onRequestAddFriend={handleAddFriendFromChat}
        onRequestRemoveFriend={handleRemoveFriendFromChat}
        isFriend={isFriendHero}
      />
      <FriendOverlay
        open={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        viewer={social.viewer}
        friends={social.friends}
        friendRequests={social.friendRequests}
        loading={social.loading}
        error={social.error}
        onAddFriend={handleFriendOverlayAdd}
        onRemoveFriend={social.removeFriend}
        onAcceptRequest={social.acceptFriendRequest}
        onDeclineRequest={social.declineFriendRequest}
        onCancelRequest={social.cancelFriendRequest}
        onOpenWhisper={handleOpenWhisper}
        blockedHeroes={blockedHeroes}
        onToggleBlockedHero={handleToggleBlockedHero}
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
  const { heroName, heroImage } = useCharacterDashboardContext()

  return (
    <div style={styles.heroSection}>
      <div style={styles.heroPortrait}>
        {heroImage ? (
          <img src={heroImage} alt={`${heroName} 이미지`} style={styles.heroImage} />
        ) : (
          <div style={styles.heroPlaceholder}>이미지 없음</div>
        )}
      </div>
      <div style={styles.panelContainer}>
        <div style={styles.panelStack}>
          <OverviewSection />
          <StatsSection />
          <InstantBattleSection />
          <BattleLogSection />
        </div>
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

function OverviewSection() {
  const {
    hero,
    heroName,
    edit,
    abilityCards,
    audioSource,
    bgmDuration,
    openEditPanel,
  } = useCharacterDashboardContext()

  const description = edit?.description || hero?.description || '설명이 입력되지 않았습니다.'

  return (
    <div style={styles.panelContent}>
      <SectionCard title="프로필 요약">
        <p style={styles.bodyText}>{description}</p>
        <div style={styles.profileMeta}>
          <span>이름</span>
          <strong>{heroName}</strong>
        </div>
        {audioSource ? (
          <audio controls src={audioSource} style={styles.bgmPlayer}>
            {bgmDuration ? `배경 음악 (길이: ${Math.round(bgmDuration)}초)` : '배경 음악'}
          </audio>
        ) : null}
        <button type="button" onClick={openEditPanel} style={styles.primaryButton}>
          세부 정보 수정
        </button>
      </SectionCard>
      <SectionCard title="능력">
        <ul style={styles.abilityList}>
          {abilityCards.map((ability) => (
            <li key={ability.key} style={styles.abilityItem}>
              <span style={styles.abilityLabel}>{ability.label}</span>
              <strong style={styles.abilityValue}>{ability.value || '미입력'}</strong>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}

function StatsSection() {
  const { statSlides = [], selectedGameId, onSelectGame, selectedEntry } =
    useCharacterDashboardContext()

  if (!statSlides.length) {
    return (
      <div style={styles.panelContent}>
        <SectionCard title="참여 게임 통계">
          <p style={styles.bodyText}>참여한 게임이 없습니다.</p>
        </SectionCard>
      </div>
    )
  }

  return (
    <div style={styles.panelContent}>
      <SectionCard title="참여 게임 통계">
        <div style={styles.statGrid}>
          {statSlides.map((slide) => (
            <button
              key={slide.key}
              type="button"
              onClick={() => onSelectGame(slide.key)}
              style={{
                ...styles.statCard,
                ...(selectedGameId === slide.key ? styles.statCardActive : null),
              }}
            >
              <div style={styles.statHeader}>
                <strong>{slide.name}</strong>
                {slide.role ? <span style={styles.statRole}>{slide.role}</span> : null}
              </div>
              <ul style={styles.statList}>
                {slide.stats.map((stat) => (
                  <li key={stat.key} style={styles.statItem}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </li>
                ))}
              </ul>
            </button>
          ))}
          {selectedEntry ? (
            <div style={styles.statNote}>
              마지막 업데이트:{' '}
              {new Date(selectedEntry.updated_at || selectedEntry.created_at || 0).toLocaleString()}
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  )
}

function InstantBattleSection() {
  const { selectedGame, selectedGameId, onStartBattle } = useCharacterDashboardContext()

  return (
    <div style={styles.panelContent}>
      <SectionCard title="즉시 전투">
        {selectedGame ? (
          <div style={styles.bodyStack}>
            <div>
              <strong>{selectedGame.name}</strong>
              <p style={styles.bodyText}>{selectedGame.description || '설명이 없습니다.'}</p>
            </div>
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
        ) : (
          <p style={styles.bodyText}>전투를 시작하려면 먼저 참여 게임을 선택하세요.</p>
        )}
      </SectionCard>
    </div>
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
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 24,
    maxWidth: 1200,
    margin: '0 auto',
    paddingTop: 32,
  },
  headerCarousel: {
    flex: 1,
    maxWidth: 720,
    overflow: 'hidden',
    position: 'relative',
  },
  headerTrack: {
    display: 'flex',
    transition: 'transform 220ms ease',
  },
  headerSlide: {
    boxSizing: 'border-box',
    paddingRight: 24,
    display: 'grid',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 36,
    lineHeight: 1.1,
    color: '#f8fafc',
  },
  subtitle: {
    margin: 0,
    color: '#cbd5f5',
    lineHeight: 1.5,
  },
  bgmWrapper: {
    display: 'grid',
    gap: 8,
  },
  bgmLabel: {
    fontSize: 13,
    color: '#cbd5f5',
  },
  bgmPlayer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    background: 'rgba(15, 23, 42, 0.7)',
  },
  headerActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  heroSection: {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'grid',
    gap: 24,
  },
  heroPortrait: {
    width: '100%',
    borderRadius: 32,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.55)',
    minHeight: 320,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  heroPlaceholder: {
    color: '#94a3b8',
    fontSize: 18,
  },
  panelContainer: {
    background: 'rgba(2, 6, 23, 0.65)',
    borderRadius: 32,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    padding: 24,
    display: 'grid',
    gap: 24,
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
    WebkitOverflowScrolling: 'touch',
  },
  swipeTrack: {
    display: 'flex',
  },
  swipePanel: {
    minWidth: '100%',
    scrollSnapAlign: 'center',
    padding: '4px 0',
  },
  panelStack: {
    display: 'grid',
    gap: 24,
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
