import { useMemo, useState } from 'react'

import styles from './styles'

export default function HeroCard({ hero, onSelect }) {
  const [active, setActive] = useState(false)

  const heroName = useMemo(() => {
    if (!hero) return '이름 없는 영웅'
    const name = typeof hero.name === 'string' ? hero.name.trim() : ''
    return name || '이름 없는 영웅'
  }, [hero])

  const handleClick = () => {
    if (typeof onSelect === 'function') {
      onSelect(hero)
    }
  }

  const cardStyle = {
    ...styles.heroButton,
    transform: active ? 'scale(0.97)' : 'scale(1)',
    boxShadow: active
      ? '0 14px 44px -34px rgba(56,189,248,0.6)'
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
          <div style={styles.heroNameBar}>{heroName}</div>
        </div>
      </div>
    </button>
  )
}
