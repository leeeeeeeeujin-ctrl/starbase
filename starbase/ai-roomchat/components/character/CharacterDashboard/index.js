import React, { useMemo, useState } from 'react'

import EditHeroModal from './sections/EditHeroModal'
import { CharacterDashboardProvider, useCharacterDashboardContext } from './context'

export default function CharacterDashboard({
  dashboard,
  heroName,
  onStartBattle,
  onBack,
  onGoLobby,
}) {
  const { profile, participation, battles, heroName: fallbackName } = dashboard

  const [activeSection, setActiveSection] = useState('overview')
  const [editOpen, setEditOpen] = useState(false)

  const displayName = heroName || fallbackName || profile.hero?.name || '이름 없는 캐릭터'
  const heroImage = profile.edit?.image_url || profile.hero?.image_url || ''

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

  const sections = useMemo(
    () => [
      { id: 'overview', label: '개요', render: () => <OverviewSection /> },
      { id: 'stats', label: '통계', render: () => <StatsSection /> },
      { id: 'instant', label: '즉시 전투', render: () => <InstantBattleSection /> },
      { id: 'ranking', label: '랭킹', render: () => <RankingSection /> },
      { id: 'battles', label: '전투 로그', render: () => <BattleLogSection /> },
    ],
    [],
  )

  const active = sections.find((section) => section.id === activeSection) || sections[0]

  return (
    <CharacterDashboardProvider value={contextValue}>
      <div style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>{displayName}</h1>
            <p style={styles.subtitle}>
              {participation.selectedGame?.name
                ? `현재 선택한 게임 · ${participation.selectedGame.name}`
                : '영웅과 관련된 정보와 전투 기록을 한 화면에서 확인하세요.'}
            </p>
          </div>
          <div style={styles.headerActions}>
            {onBack ? (
              <button type="button" onClick={onBack} style={styles.secondaryButton}>
                뒤로 가기
              </button>
            ) : null}
            {onGoLobby ? (
              <button type="button" onClick={onGoLobby} style={styles.secondaryButton}>
                로비 이동
              </button>
            ) : null}
            <button type="button" onClick={() => setEditOpen(true)} style={styles.primaryButton}>
              프로필 편집
            </button>
          </div>
        </header>

        <div style={styles.heroSection}>
          <div style={styles.heroPortrait}>
            {heroImage ? (
              <img src={heroImage} alt={`${displayName} 이미지`} style={styles.heroImage} />
            ) : (
              <div style={styles.heroPlaceholder}>이미지 없음</div>
            )}
          </div>
          <div style={styles.sectionSwitcher}>
            <nav style={styles.nav}>
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  style={{
                    ...styles.navButton,
                    ...(activeSection === section.id ? styles.navButtonActive : null),
                  }}
                >
                  {section.label}
                </button>
              ))}
            </nav>
            <div style={styles.panel}>{active.render()}</div>
          </div>
        </div>
      </div>
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
          <audio controls src={audioSource} style={{ width: '100%' }}>
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
    return <p style={styles.bodyText}>참여한 게임이 없습니다.</p>
  }

  return (
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
          마지막 업데이트: {new Date(selectedEntry.updated_at || selectedEntry.created_at || 0).toLocaleString()}
        </div>
      ) : null}
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

  if (!selectedScoreboard.length) {
    return <p style={styles.bodyText}>선택한 게임의 랭킹 정보가 없습니다.</p>
  }

  return (
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
              <tr key={row.id || `${row.hero_id}-${row.owner_id || index}`} style={isHero ? styles.highlightRow : null}>
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

  if (battleLoading) {
    return <p style={styles.bodyText}>전투 기록을 불러오는 중…</p>
  }

  if (battleError) {
    return <p style={styles.bodyText}>{battleError}</p>
  }

  if (!battleDetails.length) {
    return <p style={styles.bodyText}>표시할 전투 기록이 없습니다.</p>
  }

  const items = battleDetails.slice(0, visibleBattles || battleDetails.length)

  return (
    <div style={styles.battleList}>
      {items.map((battle) => (
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
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0b1120',
    color: '#e2e8f0',
    padding: '32px 16px 48px',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    maxWidth: 1200,
    margin: '0 auto 32px',
  },
  title: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.2,
    color: '#f8fafc',
  },
  subtitle: {
    margin: '8px 0 0',
    color: '#94a3b8',
    maxWidth: 640,
    lineHeight: 1.5,
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
    borderRadius: 24,
    background: 'rgba(15, 23, 42, 0.65)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    padding: 24,
    display: 'flex',
    justifyContent: 'center',
  },
  heroImage: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    objectFit: 'cover',
    border: '1px solid rgba(148, 163, 184, 0.4)',
  },
  heroPlaceholder: {
    width: '100%',
    maxWidth: 320,
    height: 320,
    borderRadius: 16,
    border: '1px dashed rgba(148, 163, 184, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontSize: 18,
  },
  sectionSwitcher: {
    display: 'grid',
    gap: 16,
  },
  nav: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  navButton: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 999,
    padding: '10px 18px',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: 14,
    transition: 'background 0.2s ease, color 0.2s ease',
  },
  navButtonActive: {
    background: '#2563eb',
    borderColor: '#3b82f6',
    color: '#f8fafc',
  },
  panel: {
    background: 'rgba(15, 23, 42, 0.72)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 24,
    padding: 24,
  },
  sectionCard: {
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    padding: 20,
    display: 'grid',
    gap: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    color: '#f8fafc',
  },
  panelContent: {
    display: 'grid',
    gap: 20,
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
    borderRadius: 14,
    background: 'rgba(30, 41, 59, 0.6)',
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
}
