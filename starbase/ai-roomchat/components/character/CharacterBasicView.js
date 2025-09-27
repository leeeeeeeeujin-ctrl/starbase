'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const styles = {
  page: {
    minHeight: '100vh',
    width: '100%',
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    color: '#e2e8f0',
    background: 'radial-gradient(circle at top, rgba(30,64,175,0.4) 0%, rgba(2,6,23,0.98) 65%)',
    padding: '32px 16px 96px',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  pageWithBackground: (imageUrl) => ({
    minHeight: '100vh',
    width: '100%',
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    color: '#e2e8f0',
    padding: '32px 16px 96px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.95) 50%, rgba(2,6,23,0.98) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }),
  content: {
    width: '100%',
    maxWidth: 960,
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
    position: 'relative',
    zIndex: 1,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  backLink: {
    alignSelf: 'flex-start',
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.6)',
    color: '#cbd5f5',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    boxShadow: '0 20px 60px -50px rgba(15,23,42,0.9)',
  },
  heroHeading: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  heroName: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  heroMeta: {
    margin: 0,
    fontSize: 14,
    color: '#94a3b8',
  },
  heroArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    borderRadius: 32,
    border: '1px solid rgba(148,163,184,0.3)',
    background: 'rgba(15,23,42,0.55)',
    padding: '24px 18px',
    boxShadow: '0 32px 80px -60px rgba(14,165,233,0.35)',
  },
  heroImageFrame: {
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    border: '1px solid rgba(96,165,250,0.35)',
    background: 'rgba(30,58,138,0.4)',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    maxHeight: 480,
    objectFit: 'cover',
    display: 'block',
  },
  imageHint: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(2,6,23,0.75)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#bae6fd',
  },
  slider: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  sliderHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sliderButton: {
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.7)',
    color: '#cbd5f5',
    borderRadius: 999,
    padding: '10px 16px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  sliderTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    flex: '1 1 auto',
    textAlign: 'center',
  },
  sliderBody: {
    borderRadius: 22,
    border: '1px solid rgba(71,85,105,0.5)',
    background: 'rgba(2,6,23,0.78)',
    padding: '22px 20px',
    minHeight: 160,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    lineHeight: 1.6,
  },
  paragraph: {
    margin: 0,
    fontSize: 15,
    color: '#e2e8f0',
  },
  abilityList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  abilityItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.55)',
    padding: '12px 14px',
  },
  abilityLabel: {
    margin: 0,
    fontSize: 12,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#38bdf8',
    fontWeight: 700,
  },
  abilityText: {
    margin: 0,
    fontSize: 14,
    color: '#e2e8f0',
    lineHeight: 1.6,
  },
  appearanceList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  appearanceItem: {
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.6)',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  appearanceTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
  },
  appearanceMeta: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  sliderDots: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  dotButton: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.6)',
    padding: 0,
    cursor: 'pointer',
  },
  dotButtonActive: {
    background: '#38bdf8',
    borderColor: 'rgba(56,189,248,0.8)',
    width: 14,
    height: 14,
  },
  audioBox: {
    marginTop: 4,
    padding: '14px 16px',
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,0.3)',
    background: 'rgba(2,6,23,0.75)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  audioLabel: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
    fontWeight: 600,
  },
}

export default function CharacterBasicView({ hero, appearances }) {
  const heroName = useMemo(() => {
    if (!hero) return '이름 없는 영웅'
    const name = typeof hero.name === 'string' ? hero.name.trim() : ''
    return name || '이름 없는 영웅'
  }, [hero])

  const sections = useMemo(() => {
    const description = typeof hero?.description === 'string' ? hero.description.trim() : ''
    const overview = (
      <p style={styles.paragraph}>
        {description || '소개가 아직 준비되지 않았습니다. 캐릭터 이미지를 탭하면 다른 정보를 볼 수 있어요.'}
      </p>
    )

    const abilityTexts = [hero?.ability1, hero?.ability2, hero?.ability3, hero?.ability4]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)

    const abilities = abilityTexts.length ? (
      <ul style={styles.abilityList}>
        {abilityTexts.map((text, index) => (
          <li key={`ability-${index}`} style={styles.abilityItem}>
            <span style={styles.abilityLabel}>능력 {index + 1}</span>
            <p style={styles.abilityText}>{text}</p>
          </li>
        ))}
      </ul>
    ) : (
      <p style={styles.paragraph}>등록된 능력이 없습니다. 능력 정보를 추가해 캐릭터를 더 돋보이게 해보세요.</p>
    )

    const recentAppearances = Array.isArray(appearances) ? appearances : []
    const appearancesNode = recentAppearances.length ? (
      <ul style={styles.appearanceList}>
        {recentAppearances.map((entry) => (
          <li key={entry.id || `${entry.gameId}-${entry.slotNo || 'slot'}`} style={styles.appearanceItem}>
            <p style={styles.appearanceTitle}>{entry.gameName || '비공개 게임'}</p>
            <p style={styles.appearanceMeta}>
              {entry.slotNo ? `${entry.slotNo}번 슬롯` : '슬롯 미지정'} · {entry.gameCreatedAt ? formatDate(entry.gameCreatedAt) : '최근 기록'}
            </p>
          </li>
        ))}
      </ul>
    ) : (
      <p style={styles.paragraph}>최근 등장 기록이 없습니다. 새로운 세션에 참여하면 이곳에 기록이 쌓여요.</p>
    )

    return [
      { id: 'overview', title: '소개', body: overview },
      { id: 'abilities', title: '능력', body: abilities },
      { id: 'recent', title: '최근 등장', body: appearancesNode },
    ]
  }, [appearances, hero])

  const [index, setIndex] = useState(0)
  const sectionCount = sections.length || 1

  useEffect(() => {
    if (index >= sectionCount) {
      setIndex(0)
    }
  }, [index, sectionCount])

  const goTo = useCallback(
    (target) => {
      const safeTarget = ((target % sectionCount) + sectionCount) % sectionCount
      setIndex(safeTarget)
    },
    [sectionCount],
  )

  const goNext = useCallback(() => {
    setIndex((prev) => ((prev + 1) % sectionCount + sectionCount) % sectionCount)
  }, [sectionCount])

  const goPrev = useCallback(() => {
    setIndex((prev) => ((prev - 1 + sectionCount) % sectionCount + sectionCount) % sectionCount)
  }, [sectionCount])

  const handleImageTap = useCallback(() => {
    if (sectionCount > 1) {
      goNext()
    }
  }, [goNext, sectionCount])

  const createdAtText = formatDate(hero?.created_at)
  const bgmUrl = hero?.bgm_url || ''

  const pageStyle = hero?.background_url
    ? styles.pageWithBackground(hero.background_url)
    : styles.page

  return (
    <div style={pageStyle}>
      <div style={styles.content}>
        <header style={styles.header}>
          <Link href="/roster" style={styles.backLink}>
            ← 로스터로 돌아가기
          </Link>
          <div style={styles.heroHeading}>
            <h1 style={styles.heroName}>{heroName}</h1>
            <p style={styles.heroMeta}>
              {createdAtText ? `${createdAtText}에 생성됨` : '생성일 정보가 없습니다.'}
            </p>
          </div>
        </header>

        <section style={styles.heroArea}>
          <div
            style={styles.heroImageFrame}
            role="button"
            tabIndex={0}
            onClick={handleImageTap}
            onKeyUp={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                handleImageTap()
              }
            }}
          >
            {hero?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero.image_url} alt={heroName} style={styles.heroImage} />
            ) : (
              <div style={{
                ...styles.heroImage,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 48,
                fontWeight: 800,
                background: 'rgba(30,64,175,0.35)',
              }}>
                {heroName.slice(0, 2)}
              </div>
            )}
            <div style={styles.imageHint}>이미지를 탭하면 다음 정보</div>
          </div>

          <div style={styles.slider}>
            <div style={styles.sliderHeader}>
              <button type="button" onClick={goPrev} style={styles.sliderButton}>
                이전
              </button>
              <h2 style={styles.sliderTitle}>{sections[index]?.title}</h2>
              <button type="button" onClick={goNext} style={styles.sliderButton}>
                다음
              </button>
            </div>
            <div style={styles.sliderBody}>{sections[index]?.body}</div>
            <div style={styles.sliderDots}>
              {sections.map((section, dotIndex) => {
                const active = dotIndex === index
                return (
                  <button
                    type="button"
                    key={section.id}
                    onClick={() => goTo(dotIndex)}
                    style={{
                      ...styles.dotButton,
                      ...(active ? styles.dotButtonActive : {}),
                    }}
                    aria-label={`${section.title} 보기`}
                  />
                )
              })}
            </div>

            {bgmUrl ? (
              <div style={styles.audioBox}>
                <p style={styles.audioLabel}>브금</p>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio src={bgmUrl} controls preload="none" loop />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
