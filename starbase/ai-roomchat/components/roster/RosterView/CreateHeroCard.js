import Link from 'next/link'

import styles from './styles'

export default function CreateHeroCard() {
  return (
    <Link href="/create" style={styles.createCardLink}>
      <div style={styles.createCardCover}>
        <div style={styles.createCardOverlay} />
        <div style={styles.createCardIconWrapper}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" fill="currentColor" />
          </svg>
        </div>
        <div style={styles.createCardTextGroup}>
          <span style={styles.createCardTitle}>영웅 생성</span>
          <span style={styles.createCardSubtitle}>지금 영웅을 소환해보세요</span>
        </div>
      </div>
    </Link>
  )
}
