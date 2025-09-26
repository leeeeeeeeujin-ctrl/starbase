'use client'

import LogoutButton from '../../LogoutButton'
import HeroList from './HeroList'
import DeleteHeroModal from './DeleteHeroModal'
import styles from './styles'

const COMMUNITY_URL = 'https://gall.dcinside.com/mini/board/lists/?id=gionkirr'

export default function RosterView({
  loading,
  error,
  heroes,
  displayName,
  avatarUrl,
  deleteTarget,
  deleting,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onLogoutComplete,
  onResetError,
  onOpenChat,
  onOpenFriends,
  chatUnreadCount,
}) {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.headerTopRow}>
            <div style={styles.titleGroup}>
              <div style={styles.badge}>Tale of Heroes</div>
              <h1 style={styles.title}>나의 영웅 도감</h1>
              <p style={styles.subtitle}>영웅들을 관리하고 로비에서 곧바로 자랑해 보세요.</p>
            </div>
            <LogoutButton avatarUrl={avatarUrl} displayName={displayName} onAfter={onLogoutComplete} />
          </div>

          <a href={COMMUNITY_URL} target="_blank" rel="noreferrer" style={styles.communityCard}>
            <span style={styles.communityLabel}>공식 커뮤니티 오픈!</span>
            <p style={styles.communityDescription}>
              캐릭터 자랑, 설정 공유, 팬아트까지 모두 환영합니다. 지금 바로 커뮤니티에서 첫 인사를 남겨보세요.
            </p>
          </a>

          <div style={styles.heroCallout}>
            <div style={styles.heroCalloutOverlay} />
            <div style={styles.heroCalloutContent}>
              <span style={styles.heroCalloutEyebrow}>영웅을 생성하고</span>
              <h2 style={styles.heroCalloutTitle}>전설을 시작하세요</h2>
              <p style={styles.heroCalloutSubtitle}>
                새로운 영웅을 만들고 스토리를 기록하면 플레이어들이 당신의 세계를 함께 즐기게 됩니다.
              </p>
            </div>
          </div>
        </header>

        <section style={styles.heroSection}>
          <div style={styles.heroSectionHeader}>
            <h2 style={styles.heroSectionTitle}>내 영웅 목록</h2>
            <span style={styles.heroSectionCount}>{heroes.length}명</span>
          </div>
          <div style={styles.heroListContainer}>
            <HeroList
              loading={loading}
              error={error}
              heroes={heroes}
              onRequestDelete={onRequestDelete}
              onResetError={onResetError}
            />
          </div>
        </section>
      </div>

      <DeleteHeroModal
        hero={deleteTarget}
        open={Boolean(deleteTarget)}
        deleting={deleting}
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />

      <div style={styles.overlayButtons}>
        <button type="button" onClick={onOpenChat} style={styles.overlayButton}>
          💬
          {chatUnreadCount ? <span style={styles.overlayBadge}>{chatUnreadCount}</span> : null}
        </button>
        <button type="button" onClick={onOpenFriends} style={styles.overlayButton}>
          👥
        </button>
      </div>
    </div>
  )
}
