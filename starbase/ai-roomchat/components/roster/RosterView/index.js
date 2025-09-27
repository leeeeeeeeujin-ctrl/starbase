'use client'

import LogoutButton from '../../LogoutButton'
import HeroList from './HeroList'
import styles from './styles'

export default function RosterView({
  loading,
  error,
  heroes,
  displayName,
  avatarUrl,
  onSelectHero,
  onCreateHero,
  onRetry,
  onLogout,
}) {
  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        <header style={styles.header}>
          <div style={styles.headerTop}>
            <div>
              <p style={styles.greeting}>{displayName ? `${displayName}님의 로스터` : '나의 로스터'}</p>
              <h1 style={styles.title}>영웅 목록</h1>
            </div>
            <LogoutButton avatarUrl={avatarUrl} displayName={displayName} onAfter={onLogout} />
          </div>
          <div style={styles.notice}>
            <span style={styles.noticeLabel}>이번 주 공지</span>
            <h2 style={styles.noticeTitle}>작은 화면에서도 편하게 볼 수 있도록 정리했어요.</h2>
            <p style={styles.noticeBody}>
              영웅 카드를 눌러 상세 페이지로 이동하면 이미지 중심으로 구성된 정보를 바로 확인할 수 있어요.
            </p>
          </div>
        </header>

        <section style={styles.heroSection}>
          <div style={styles.heroSectionHeader}>
            <h2 style={styles.heroSectionTitle}>캐릭터 목록</h2>
            <span style={styles.heroCount}>{heroes.length}명</span>
          </div>
          <HeroList
            loading={loading}
            error={error}
            heroes={heroes}
            onSelectHero={onSelectHero}
            onCreateHero={onCreateHero}
            onRetry={onRetry}
          />
        </section>
      </div>
    </div>
  )
}
