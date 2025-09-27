import { useMemo, useState } from 'react'

import styles from './styles'

export default function HeroCard({ hero, onSelect }) {
  const [active, setActive] = useState(false)

  const heroName = useMemo(() => {
    if (!hero) return '이름 없는 영웅'
    const name = typeof hero.name === 'string' ? hero.name.trim() : ''
    return name || '이름 없는 영웅'
  }, [hero])

  const createdAtText = useMemo(() => {
    if (!hero?.created_at) return '생성일 정보 없음'
    try {
      const date = new Date(hero.created_at)
      if (Number.isNaN(date.getTime())) return '생성일 정보 없음'
      return `${new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date)} 생성`
    } catch (error) {
      console.error('Failed to format hero created_at', error)
      return '생성일 정보 없음'
    }
  }, [hero?.created_at])

  const handleClick = () => {
    if (typeof onSelect === 'function') {
      onSelect(hero)
    }
  }

  const cardStyle = {
    ...styles.heroButton,
    transform: active ? 'scale(0.98)' : 'scale(1)',
    boxShadow: active
      ? '0 18px 54px -32px rgba(56,189,248,0.55)'
      : styles.heroButton.boxShadow,
  }

  return (
    <button
      type="button"
      style={cardStyle}
      onClick={handleClick}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      onMouseLeave={() => setActive(false)}
      onTouchStart={() => setActive(true)}
      onTouchEnd={() => setActive(false)}
    >
      <div style={styles.heroButtonContent}>
        <div style={styles.heroImageWrap}>
          {hero?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.image_url} alt={heroName} style={styles.heroImage} />
          ) : (
            <div style={styles.heroFallback}>{heroName.slice(0, 2)}</div>
          )}
        </div>
        <div style={styles.heroMetaColumn}>
          <p style={styles.heroName}>{heroName}</p>
          <p style={styles.heroCreatedAt}>{createdAtText}</p>
        </div>
      </div>
    </button>
  )
}
