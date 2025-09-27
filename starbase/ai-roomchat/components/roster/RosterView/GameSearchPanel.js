const TAGS = [
  { label: '🔥 실시간 인기', active: true },
  { label: '🎲 파티', active: false },
  { label: '🧩 스토리텔링', active: false },
  { label: '⚔️ 경쟁전', active: false },
]

const FEATURED_GAMES = [
  {
    title: '운명의 바람 2차 클로즈 베타',
    subtitle: 'GM 라피엘 · 5인 협력',
    players: '4 / 6',
    description: '신규 영웅 밸런스를 점검하는 내부 테스트입니다. 전략적인 역할 분담이 필요해요.',
    genre: '전략 협동전',
    schedule: '오늘 21:00 시작',
  },
  {
    title: '은하수의 심연: 파일럿 모집',
    subtitle: '크루 블랙라벨 · 지속형 캠페인',
    players: '2 / 4',
    description: '은하계 깊은 곳에서 벌어지는 장기 탐사 스토리. 설정을 공유하며 함께 우주를 개척해요.',
    genre: 'SF 롤플레잉',
    schedule: '금요일 20:30',
  },
  {
    title: '카니발 나이트 프리매치',
    subtitle: 'GM 하루 · 캐주얼 매치',
    players: '7 / 8',
    description: '30분 한 판으로 즐기는 번개 매치. 초보자도 부담 없이 참가할 수 있어요.',
    genre: '캐주얼',
    schedule: '상시 매칭',
  },
]

import styles from './styles'

export default function GameSearchPanel() {
  return (
    <section style={styles.sidebarPanel}>
      <header style={styles.sidebarHeader}>
        <span style={styles.sidebarEyebrow}>세션 찾기</span>
        <h2 style={styles.sidebarTitle}>참가할 게임을 골라보세요</h2>
        <p style={styles.sidebarSubtitle}>
          지금 바로 참여할 수 있는 방을 탐색하거나 필터를 조합해 원하는 세션을 찾아보세요.
        </p>
      </header>

      <div style={styles.searchInputRow}>
        <div style={styles.searchInputFake}>
          <span style={styles.searchInputPlaceholder}>영웅 이름, 세계관, 태그 검색...</span>
        </div>
        <button type="button" style={styles.searchButton}>
          검색
        </button>
      </div>

      <div style={styles.filterTagRow}>
        {TAGS.map((tag) => (
          <span
            key={tag.label}
            style={tag.active ? { ...styles.filterTag, ...styles.filterTagActive } : styles.filterTag}
          >
            {tag.label}
          </span>
        ))}
      </div>

      <div style={styles.gameList}>
        {FEATURED_GAMES.map((game) => (
          <article key={game.title} style={styles.gameCard}>
            <div style={styles.gameCardHeader}>
              <div>
                <h3 style={styles.gameTitle}>{game.title}</h3>
                <p style={styles.gameSubtitle}>{game.subtitle}</p>
              </div>
              <span style={styles.gamePlayerCount}>{game.players}</span>
            </div>
            <p style={styles.gameCardDescription}>{game.description}</p>
            <div style={styles.gameMetaRow}>
              <span style={styles.gameMetaTag}>{game.genre}</span>
              <span style={styles.gameMetaTag}>{game.schedule}</span>
            </div>
          </article>
        ))}
      </div>

      <footer style={styles.gameFooter}>
        <span style={styles.gameFooterHint}>나만의 세션을 열고 싶다면?</span>
        <button type="button" style={styles.gameFooterButton}>
          새 게임 만들기
        </button>
      </footer>
    </section>
  )
}
