import React from 'react'

export default function LeftColumn({
  hero,
  heroName,
  onOpenEdit,
  saving,
  onSave,
  onDelete,
  audioSource,
  bgmDuration,
  statPages,
  statPageIndex,
  onChangeStatPage,
  hasParticipations,
  visibleStatSlides,
  selectedGameId,
  onSelectGame,
  selectedEntry,
}) {
  return (
    <aside style={styles.column}>
      <HeroProfileSection
        hero={hero}
        heroName={heroName}
        onOpenEdit={onOpenEdit}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
        audioSource={audioSource}
        bgmDuration={bgmDuration}
      />
      <StatPageSelector
        statPages={statPages}
        statPageIndex={statPageIndex}
        onChangeStatPage={onChangeStatPage}
      />
      <GameStatCards
        hasParticipations={hasParticipations}
        visibleStatSlides={visibleStatSlides}
        selectedGameId={selectedGameId}
        onSelectGame={onSelectGame}
        selectedEntry={selectedEntry}
      />
    </aside>
  )
}

function HeroProfileSection({
  hero,
  heroName,
  onOpenEdit,
  saving,
  onSave,
  onDelete,
  audioSource,
  bgmDuration,
}) {
  return (
    <div style={styles.heroContainer}>
      <div style={styles.heroHeader}>
        <div style={styles.heroTitleGroup}>
          <span style={styles.heroSectionLabel}>영웅 정보</span>
          <h1 style={styles.heroName}>{heroName}</h1>
        </div>
        <div style={styles.heroActions}>
          <ActionButton tone="outline" onClick={onOpenEdit}>
            프로필 편집
          </ActionButton>
          <ActionButton tone="primary" onClick={onSave} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </ActionButton>
          <ActionButton tone="danger" onClick={onDelete}>
            삭제
          </ActionButton>
        </div>
      </div>
      <div style={styles.heroImageFrame}>
        {hero?.image_url ? (
          <img
            src={hero.image_url}
            alt={heroName}
            style={styles.heroImage}
          />
        ) : (
          <div style={styles.heroImageFallback}>이미지 없음</div>
        )}
      </div>
      {audioSource ? (
        <div style={styles.audioCard}>
          <div style={styles.audioLabel}>배경 음악</div>
          <audio controls src={audioSource} style={styles.audioControl} />
          {bgmDuration != null ? (
            <span style={styles.audioDuration}>재생 시간: {bgmDuration}초</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function StatPageSelector({ statPages, statPageIndex, onChangeStatPage }) {
  if (statPages.length <= 1) return null
  return (
    <div style={styles.statPager}>
      {statPages.map((_, index) => {
        const active = index === statPageIndex
        return (
          <button
            key={index}
            type="button"
            onClick={() => onChangeStatPage(index)}
            style={{
              ...styles.statPagerDot,
              background: active ? '#38bdf8' : 'rgba(15, 23, 42, 0.65)',
              border: active
                ? 'none'
                : '1px solid rgba(148, 163, 184, 0.4)',
              color: active ? '#020617' : '#e2e8f0',
            }}
          >
            {index + 1}
          </button>
        )
      })}
    </div>
  )
}

function GameStatCards({
  hasParticipations,
  visibleStatSlides,
  selectedGameId,
  onSelectGame,
  selectedEntry,
}) {
  return (
    <div style={styles.statCardContainer}>
      <div style={styles.statCardHeader}>
        <h2 style={styles.statCardTitle}>게임별 지표</h2>
        {hasParticipations && selectedEntry ? (
          <span style={styles.statCardSubtitle}>
            {selectedEntry.game?.name || '—'}
          </span>
        ) : null}
      </div>
      {hasParticipations ? (
        <div style={styles.statCardScroll}>
          {visibleStatSlides.map((slide) => {
            const active = slide.key === selectedGameId
            return (
              <button
                key={slide.key}
                type="button"
                onClick={() => onSelectGame(slide.key)}
                style={{
                  ...styles.statCard,
                  border: active
                    ? '1px solid rgba(56, 189, 248, 0.65)'
                    : '1px solid rgba(148, 163, 184, 0.3)',
                  background: active
                    ? 'linear-gradient(180deg, rgba(14, 165, 233, 0.35) 0%, rgba(15, 23, 42, 0.95) 100%)'
                    : 'rgba(15, 23, 42, 0.6)',
                }}
              >
                <div style={styles.statCardHeading}>
                  <strong style={styles.statCardName}>{slide.name}</strong>
                  <span style={styles.statCardMeta}>
                    {slide.role ? `${slide.role} 역할` : '참여 게임'}
                  </span>
                </div>
                <div style={styles.statCardBody}>
                  {slide.stats.map((stat) => (
                    <div key={stat.key} style={styles.statRow}>
                      <span style={styles.statLabel}>{stat.label}</span>
                      <strong style={styles.statValue}>{stat.value}</strong>
                    </div>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div style={styles.emptyState}>아직 참가한 게임이 없습니다.</div>
      )}
    </div>
  )
}

function ActionButton({ tone, children, ...buttonProps }) {
  const palette = actionToneStyles[tone] || actionToneStyles.neutral
  return (
    <button type="button" {...buttonProps} style={{ ...styles.heroAction, ...palette, ...buttonProps.style }}>
      {children}
    </button>
  )
}

const styles = {
  column: { display: 'grid', gap: 24 },
  heroContainer: {
    position: 'relative',
    borderRadius: 32,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.82)',
    boxShadow: '0 35px 120px -60px rgba(15, 118, 110, 0.65)',
    padding: 28,
    display: 'grid',
    gap: 18,
  },
  heroHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroTitleGroup: { display: 'grid', gap: 6 },
  heroSectionLabel: { fontSize: 13, color: '#94a3b8' },
  heroName: { margin: 0, fontSize: 28, lineHeight: 1.3 },
  heroActions: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  heroAction: {
    padding: '8px 16px',
    borderRadius: 999,
    fontWeight: 700,
    border: 'none',
  },
  heroImageFrame: {
    position: 'relative',
    borderRadius: 28,
    overflow: 'hidden',
    border: '1px solid rgba(56, 189, 248, 0.25)',
    background: 'rgba(15, 23, 42, 0.65)',
    minHeight: 360,
  },
  heroImage: { width: '100%', height: '100%', objectFit: 'cover' },
  heroImageFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#38bdf8',
    fontWeight: 700,
  },
  audioCard: {
    borderRadius: 22,
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.75)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    display: 'grid',
    gap: 6,
  },
  audioLabel: { fontSize: 13, color: '#94a3b8' },
  audioControl: { width: '100%' },
  audioDuration: { fontSize: 12, color: '#bae6fd' },
  statPager: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  statPagerDot: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    fontWeight: 700,
    fontSize: 13,
  },
  statCardContainer: {
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.75)',
    padding: 18,
    display: 'grid',
    gap: 16,
  },
  statCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statCardTitle: { margin: 0, fontSize: 18 },
  statCardSubtitle: { fontSize: 12, color: '#94a3b8' },
  statCardScroll: {
    display: 'flex',
    gap: 16,
    overflowX: 'auto',
    paddingBottom: 6,
  },
  statCard: {
    minWidth: 240,
    borderRadius: 24,
    padding: 18,
    color: '#f8fafc',
    textAlign: 'left',
    display: 'grid',
    gap: 12,
  },
  statCardHeading: { display: 'grid', gap: 4 },
  statCardName: { fontSize: 16 },
  statCardMeta: { fontSize: 12, color: '#94a3b8' },
  statCardBody: { display: 'grid', gap: 10 },
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 },
  statLabel: { color: '#94a3b8' },
  statValue: { fontSize: 16 },
  emptyState: {
    padding: 20,
    textAlign: 'center',
    color: '#94a3b8',
    borderRadius: 18,
    border: '1px dashed rgba(148, 163, 184, 0.35)',
  },
}

const actionToneStyles = {
  primary: { background: '#3b82f6', color: '#e0f2fe', minWidth: 96 },
  outline: {
    background: 'rgba(56, 189, 248, 0.18)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.6)',
  },
  danger: {
    background: 'rgba(248, 113, 113, 0.15)',
    color: '#fecaca',
    border: '1px solid rgba(248, 113, 113, 0.45)',
  },
  neutral: {
    background: 'rgba(15, 23, 42, 0.65)',
    color: '#e2e8f0',
    border: '1px solid rgba(148, 163, 184, 0.35)',
  },
}

//
