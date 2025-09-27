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
  const safeName = typeof displayName === 'string' ? displayName.trim() : ''
  const initials = safeName ? safeName.charAt(0) : '플'

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        <header style={styles.header}>
          <div style={styles.brandRow}>
            <div style={styles.brandGroup}>
              <p style={styles.brandEyebrow}>tale of heroes</p>
              <h1 style={styles.brandTitle}>영웅을 생성하고 전설을 시작하세요</h1>
              <p style={styles.brandSubtitle}>아래에서 내 영웅을 선택하면 캐릭터 화면으로 바로 이동합니다.</p>
            </div>

            <div style={styles.profileChip}>
              <div style={styles.profileAvatar}>{initials}</div>
              <div style={styles.profileText}>
                <p style={styles.profileName}>{displayName || '플레이어'}</p>
                <p style={styles.profileStatus}>오늘도 전설을 써 내려가요</p>
              </div>
              <LogoutButton avatarUrl={avatarUrl} displayName={displayName} onAfter={onLogout} />
            </div>
          </div>

          <div style={styles.notice}>
            <span style={styles.noticeLabel}>공식 커뮤니티 안내</span>
            <h2 style={styles.noticeTitle}>영웅들을 위한 로비가 열렸습니다. 지금 바로 인사를 건네보세요!</h2>
            <p style={styles.noticeBody}>
              캐릭터 화면에서 이미지를 탭해 소개와 능력을 확인할 수 있고, 좌우로 넘기면 랭킹과 게임 찾기 화면으로 이어집니다.
            </p>
          </div>
        </header>

        <section style={styles.heroSection}>
          <div style={styles.heroSectionHeader}>
            <h2 style={styles.heroSectionTitle}>내 영웅 목록</h2>
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
