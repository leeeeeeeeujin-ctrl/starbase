import Link from 'next/link'

import styles from './styles'

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  })
}

export default function HeroCard({ hero, onDelete }) {
  const heroName = typeof hero?.name === 'string' && hero.name.trim()
    ? hero.name.trim()
    : '이름 없는 영웅'

  const handleNavigate = () => {
    if (typeof window === 'undefined') return
    if (!hero?.id) return
    try {
      window.localStorage.setItem('selectedHeroId', hero.id)
      if (hero.owner_id) {
        window.localStorage.setItem('selectedHeroOwnerId', hero.owner_id)
      }
    } catch (error) {
      console.error('Failed to persist selected hero before navigation:', error)
    }
  }

  return (
    <Link href={`/character/${hero.id}`} style={styles.heroCardLink} onClick={handleNavigate}>
      <div style={styles.heroCardCover}>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete(hero)
          }}
          onMouseDown={(event) => event.stopPropagation()}
          style={styles.heroDeleteButton}
          aria-label={`${heroName} 삭제`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9Z" fill="currentColor" />
          </svg>
        </button>
        {hero.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.image_url} alt={heroName} style={styles.heroImage} />
        ) : (
          <div style={styles.heroImageFallback}>{heroName.slice(0, 2)}</div>
        )}
        <div style={styles.heroCardFooter}>
          <div style={styles.heroName}>{heroName}</div>
          <span style={styles.heroCreatedAt}>{formatDate(hero.created_at)}</span>
        </div>
      </div>
    </Link>
  )
}
