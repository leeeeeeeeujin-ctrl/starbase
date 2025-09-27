'use client'

import Link from 'next/link'

const styles = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at top, #0f172a, #020617 62%)',
    color: '#e2e8f0',
    padding: '48px 24px 80px',
  },
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  heroTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  heroName: {
    fontSize: 36,
    margin: 0,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  heroSubtitle: {
    margin: 0,
    fontSize: 15,
    color: '#94a3b8',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    padding: '10px 18px',
    border: '1px solid rgba(148,163,184,0.25)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  content: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)',
    gap: 32,
    alignItems: 'start',
  },
  heroCard: {
    background: 'rgba(15,23,42,0.65)',
    borderRadius: 24,
    border: '1px solid rgba(148,163,184,0.2)',
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(15,23,42,0.45)',
  },
  heroImageWrap: {
    position: 'relative',
    paddingTop: '125%',
    background: 'linear-gradient(135deg, rgba(56,189,248,0.25), rgba(59,130,246,0.1))',
  },
  heroImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  heroImageFallback: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 48,
    fontWeight: 700,
    color: '#0f172a',
    background: 'linear-gradient(135deg, rgba(56,189,248,0.7), rgba(165,180,252,0.7))',
  },
  heroMeta: {
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  heroDescription: {
    margin: 0,
    color: '#cbd5f5',
    fontSize: 15,
    lineHeight: 1.6,
  },
  heroCreatedAt: {
    fontSize: 13,
    color: '#94a3b8',
  },
  abilityGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 16,
  },
  abilityCard: {
    padding: '16px 18px',
    borderRadius: 18,
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(148,163,184,0.25)',
    minHeight: 110,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  abilityLabel: {
    fontSize: 13,
    color: '#38bdf8',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  abilityText: {
    fontSize: 15,
    color: '#e2e8f0',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
  },
  appearanceList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 16,
  },
  appearanceCard: {
    borderRadius: 18,
    background: 'rgba(15,23,42,0.55)',
    border: '1px solid rgba(148,163,184,0.22)',
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 140,
  },
  appearanceCover: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    background: 'linear-gradient(135deg, rgba(56,189,248,0.3), rgba(129,140,248,0.3))',
    aspectRatio: '16 / 9',
  },
  appearanceCoverImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  appearanceName: {
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
  },
  appearanceMeta: {
    fontSize: 13,
    color: '#94a3b8',
  },
  emptyState: {
    padding: '32px 40px',
    borderRadius: 20,
    background: 'rgba(15,23,42,0.5)',
    border: '1px solid rgba(148,163,184,0.2)',
    fontSize: 15,
    color: '#cbd5f5',
    lineHeight: 1.6,
  },
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function renderAbility(label, text) {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) {
    return (
      <div style={styles.abilityCard} key={label}>
        <span style={styles.abilityLabel}>{label}</span>
        <p style={{ ...styles.abilityText, color: '#64748b' }}>기술 정보가 아직 작성되지 않았습니다.</p>
      </div>
    )
  }

  return (
    <div style={styles.abilityCard} key={label}>
      <span style={styles.abilityLabel}>{label}</span>
      <p style={styles.abilityText}>{trimmed}</p>
    </div>
  )
}

export default function CharacterBasicView({ hero, appearances }) {
  const heroName = hero?.name || '이름 없는 영웅'
  const heroInitial = heroName.slice(0, 2)

  const abilityEntries = [
    { label: '기본기', value: hero?.ability1 },
    { label: '특수기', value: hero?.ability2 },
    { label: '궁극기', value: hero?.ability3 },
    { label: '패시브', value: hero?.ability4 },
  ]

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.heroTitleGroup}>
            <p style={styles.heroSubtitle}>나의 영웅</p>
            <h1 style={styles.heroName}>{heroName}</h1>
          </div>
          <Link href="/roster" style={styles.backLink}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            로스터로 돌아가기
          </Link>
        </div>

        <div style={styles.content}>
          <article style={styles.heroCard}>
            <div style={styles.heroImageWrap}>
              {hero?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hero.image_url} alt={heroName} style={styles.heroImage} />
              ) : (
                <div style={styles.heroImageFallback}>{heroInitial}</div>
              )}
            </div>
            <div style={styles.heroMeta}>
              <p style={styles.heroDescription}>
                {hero?.description?.trim() || '영웅의 설명이 아직 작성되지 않았습니다. 설정을 채워 보세요!'}
              </p>
              <span style={styles.heroCreatedAt}>생성일 · {formatDate(hero?.created_at)}</span>
            </div>
          </article>

          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>기술 카드</h2>
            </div>
            <div style={styles.abilityGrid}>
              {abilityEntries.map((entry) => renderAbility(entry.label, entry.value))}
            </div>

            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>최근 참가한 게임</h2>
            </div>

            {appearances.length ? (
              <div style={styles.appearanceList}>
                {appearances.map((item) => (
                  <div key={item.id || `${item.gameId}-${item.slotNo}`} style={styles.appearanceCard}>
                    <div style={styles.appearanceCover}>
                      {item.gameCover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.gameCover} alt={item.gameName} style={styles.appearanceCoverImage} />
                      ) : null}
                    </div>
                    <h3 style={styles.appearanceName}>{item.gameName}</h3>
                    <span style={styles.appearanceMeta}>
                      {item.slotNo !== null ? `참가 슬롯 #${item.slotNo}` : '슬롯 정보 없음'} · {formatDate(item.gameCreatedAt)}
                    </span>
                    {item.gameDescription ? (
                      <p style={{ ...styles.heroDescription, fontSize: 14 }}>{item.gameDescription}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyState}>
                아직 이 영웅이 참가한 게임 기록이 없습니다. <br />
                게임을 만들고 영웅을 참여시켜 전설을 쌓아 보세요.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

