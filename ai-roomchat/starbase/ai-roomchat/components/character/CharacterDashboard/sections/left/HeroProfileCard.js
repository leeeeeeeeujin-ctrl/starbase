import React from 'react'

const styles = {
  container: {
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  titleGroup: { display: 'grid', gap: 6 },
  label: { fontSize: 13, color: '#94a3b8' },
  name: { margin: 0, fontSize: 28, lineHeight: 1.3 },
  actionRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  imageFrame: {
    position: 'relative',
    borderRadius: 28,
    overflow: 'hidden',
    border: '1px solid rgba(56, 189, 248, 0.25)',
    background: 'rgba(15, 23, 42, 0.65)',
    minHeight: 360,
  },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
  fallback: {
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
}

const buttonTones = {
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

export default function HeroProfileCard({
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
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <span style={styles.label}>영웅 정보</span>
          <h1 style={styles.name}>{heroName}</h1>
        </div>
        <div style={styles.actionRow}>
          <HeroActionButton tone="outline" onClick={onOpenEdit}>
            프로필 편집
          </HeroActionButton>
          <HeroActionButton tone="primary" onClick={onSave} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </HeroActionButton>
          <HeroActionButton tone="danger" onClick={onDelete}>
            삭제
          </HeroActionButton>
        </div>
      </div>
      <div style={styles.imageFrame}>
        {hero?.image_url ? (
          <img src={hero.image_url} alt={heroName} style={styles.image} />
        ) : (
          <div style={styles.fallback}>이미지 없음</div>
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

function HeroActionButton({ tone, children, style, ...buttonProps }) {
  const toneStyle = buttonTones[tone] || buttonTones.neutral
  return (
    <button
      type="button"
      {...buttonProps}
      style={{
        padding: '8px 16px',
        borderRadius: 999,
        fontWeight: 700,
        border: 'none',
        ...toneStyle,
        ...style,
      }}
    >
      {children}
    </button>
  )
}
