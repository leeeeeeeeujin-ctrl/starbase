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
}) {
  return (
    <div style={styles.page}>
      <div style={styles.layout}>
        <aside style={styles.sidebarLeft}>
          <div style={styles.sidebarCard}>
            <p style={styles.sidebarCardHeader}>이번 주 공지</p>
            <h3 style={styles.sidebarCardTitle}>새로운 영웅 콜렉션 업데이트</h3>
            <p style={styles.sidebarCardText}>
              프로필 배경과 브금 업로드가 지원됩니다. 좋아하는 장면을 배경으로 꾸미고, 영웅의 테마곡을 등록해 보세요.
            </p>
            <a href={COMMUNITY_URL} target="_blank" rel="noreferrer" style={styles.sidebarLink}>
              커뮤니티 살펴보기
            </a>
          </div>

          <div style={styles.sidebarCard}>
            <p style={styles.sidebarCardHeader}>커뮤니티 트렌드</p>
            <h3 style={styles.sidebarCardTitle}>로비 인기 영웅</h3>
            <ol style={styles.rankingList}>
              {[
                { rank: '01', name: '튜이 · 월하미인', delta: '+3' },
                { rank: '02', name: '유이 · 파란별', delta: '+1' },
                { rank: '03', name: '33 · 라운드테이블', delta: '—' },
                { rank: '04', name: '세라피나 · 하늬달', delta: '-1' },
                { rank: '05', name: '다로 · 백야행', delta: '+2' },
              ].map((item) => (
                <li key={item.rank} style={styles.rankingItem}>
                  <span style={styles.rankingBadge}>{item.rank}</span>
                  <span>{item.name}</span>
                  <span style={styles.rankingDelta}>{item.delta}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <main style={styles.mainColumn}>
          <header style={styles.header}>
            <div style={styles.headerTopRow}>
              <div style={styles.titleGroup}>
                <div style={styles.badge}>Tale of Heroes</div>
                <h1 style={styles.title}>나의 영웅 도감</h1>
                <p style={styles.subtitle}>영웅들을 관리하고 로비에서 곧바로 자랑해 보세요.</p>
              </div>
              <LogoutButton avatarUrl={avatarUrl} displayName={displayName} onAfter={onLogoutComplete} />
            </div>

            <div style={styles.heroCallout}>
              <h2 style={styles.heroCalloutTitle}>영웅을 선택해 이야기를 이어가요</h2>
              <p style={styles.heroCalloutSubtitle}>
                캐릭터를 누르면 상세 페이지로 이동합니다. 배경과 브금, 능력 카드를 꾸며 플레이어들에게 공유해 보세요.
              </p>
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
        </main>

        <aside style={styles.sidebarRight}>
          <div style={styles.searchCard}>
            <h3 style={styles.searchTitle}>게임 검색 준비 중</h3>
            <div style={styles.searchField}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M15.5 14h-.79l-.28-.27a6 6 0 1 0-.71.71l.27.28v.79l5 5L20.49 19l-5-5Zm-6 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"
                  fill="currentColor"
                />
              </svg>
              준비 중인 기능이에요. 곧 장르, 난이도별 게임 탐색을 도와드릴게요.
            </div>
            <div style={styles.searchTags}>
              {['랭킹전', '협동', '스토리', '신규'].map((tag) => (
                <span key={tag} style={styles.searchTag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div style={styles.sidebarCard}>
            <p style={styles.sidebarCardHeader}>빠른 팁</p>
            <h3 style={styles.sidebarCardTitle}>캐릭터를 꾸며보세요</h3>
            <p style={styles.sidebarCardText}>
              상세 페이지에서 배경 이미지를 넣고, 능력 설명을 채우고, 브금을 업로드하면 플레이어가 방문했을 때 완성된 프로필을 보여줄 수 있어요.
            </p>
          </div>
        </aside>
      </div>

      <DeleteHeroModal
        hero={deleteTarget}
        open={Boolean(deleteTarget)}
        deleting={deleting}
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    </div>
  )
}
