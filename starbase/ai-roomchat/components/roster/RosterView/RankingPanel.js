const RANKING_ENTRIES = [
  {
    name: '튜이',
    author: '월하미인',
    tag: 'NEW',
    change: 3,
    highlight: '연금술사',
  },
  {
    name: '유이',
    author: '파란별',
    change: 1,
    highlight: '바람 궁수',
  },
  {
    name: '33',
    author: '라운드테이블',
    change: 0,
    highlight: '이능 특수요원',
  },
  {
    name: '세라피나',
    author: '하늬달',
    change: -1,
    highlight: '성역 사제',
  },
  {
    name: '다로',
    author: '백야행',
    change: 2,
    highlight: '검은 기사',
  },
]

import styles from './styles'

function getDeltaStyle(change) {
  if (change > 0) {
    return { ...styles.rankingDelta, ...styles.rankingDeltaUp }
  }
  if (change < 0) {
    return { ...styles.rankingDelta, ...styles.rankingDeltaDown }
  }
  return { ...styles.rankingDelta, ...styles.rankingDeltaFlat }
}

export default function RankingPanel() {
  return (
    <section style={styles.sidebarPanel}>
      <header style={styles.sidebarHeader}>
        <span style={styles.sidebarEyebrow}>커뮤니티 트렌드</span>
        <h2 style={styles.sidebarTitle}>이번 주 인기 영웅</h2>
        <p style={styles.sidebarSubtitle}>
          로비에서 가장 많이 불린 영웅 TOP 5 목록이에요. 다른 플레이어들이 사랑하는 영웅을 살짝 엿보세요.
        </p>
      </header>

      <ol style={styles.rankingList}>
        {RANKING_ENTRIES.map((entry, index) => (
          <li key={entry.name} style={styles.rankingItem}>
            <div style={styles.rankingIndexWrapper}>
              <span style={styles.rankingIndex}>{String(index + 1).padStart(2, '0')}</span>
              {entry.tag ? <span style={styles.rankingTag}>{entry.tag}</span> : null}
            </div>
            <div style={styles.rankingInfo}>
              <span style={styles.rankingName}>{entry.name}</span>
              <span style={styles.rankingMeta}>{entry.highlight} · {entry.author}</span>
            </div>
            <span style={getDeltaStyle(entry.change)}>
              {entry.change > 0 && '+'}
              {entry.change}
            </span>
          </li>
        ))}
      </ol>

      <footer style={styles.rankingFooter}>
        <p style={styles.rankingFooterText}>나의 영웅이 순위에 오르도록 로비에서 이야기 꽃을 피워보세요!</p>
      </footer>
    </section>
  )
}
