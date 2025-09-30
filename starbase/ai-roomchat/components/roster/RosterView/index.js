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
        <div style={styles.pageTopMarker}>1</div>
        <header style={styles.header}>
          <div style={styles.topBanner}>
            <div style={styles.bannerRow}>
              <div style={styles.brandMark}>TALE OF HEROES</div>
              <div style={styles.profileAction}>
                <LogoutButton avatarUrl={avatarUrl} displayName={displayName} onAfter={onLogout} />
              </div>
            </div>
            <p style={styles.bannerTagline}>캐릭터 자랑, 실감나는 논쟁까지 환영</p>
          </div>

          <section style={styles.noticeCard}>
            <span style={styles.noticeBadge}>공지</span>
            <h2 style={styles.noticeHeading}>공식 커뮤니티 오픈!</h2>
            <p style={styles.noticeCopy}>
              로비에서 가장 뜨거운 영웅들을 만나보세요. 새로운 모험이 기다리고 있어요.
            </p>
          </section>

          <section style={styles.calloutCard}>
            <h1 style={styles.calloutTitle}>영웅을 생성하고 전설을 시작하세요</h1>
            <p style={styles.calloutSubtitle}>
              아래에서 내 영웅을 선택하면 캐릭터 화면으로 이동합니다.
            </p>
          </section>
        </header>

        <section style={styles.heroSection}>
          <div style={styles.heroHeader}>
            <h2 style={styles.heroTitle}>내 영웅 목록</h2>
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
