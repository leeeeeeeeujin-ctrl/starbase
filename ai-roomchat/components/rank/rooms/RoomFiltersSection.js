const styles = {
  card: {
    background: 'rgba(15, 23, 42, 0.78)',
    border: '1px solid rgba(148, 163, 184, 0.28)',
    borderRadius: 20,
    padding: '20px 22px',
    display: 'grid',
    gap: 18,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  hint: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  modeTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeTab: active => ({
    padding: '8px 16px',
    borderRadius: 12,
    border: active ? '1px solid rgba(96, 165, 250, 0.55)' : '1px solid rgba(148, 163, 184, 0.35)',
    background: active ? 'rgba(37, 99, 235, 0.35)' : 'rgba(15, 23, 42, 0.6)',
    color: active ? '#bfdbfe' : '#cbd5f5',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
  }),
  gameFilters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  gameFilterButton: active => ({
    padding: '8px 14px',
    borderRadius: 10,
    border: active ? '1px solid rgba(45, 212, 191, 0.6)' : '1px solid rgba(148, 163, 184, 0.32)',
    background: active ? 'rgba(16, 185, 129, 0.22)' : 'rgba(15, 23, 42, 0.5)',
    color: active ? '#99f6e4' : '#cbd5f5',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
  scoreRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  scoreButton: active => ({
    padding: '8px 14px',
    borderRadius: 999,
    border: active ? '1px solid rgba(59, 130, 246, 0.6)' : '1px solid rgba(148, 163, 184, 0.3)',
    background: active ? 'rgba(59, 130, 246, 0.2)' : 'rgba(15, 23, 42, 0.45)',
    color: active ? '#bfdbfe' : '#cbd5f5',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
  }),
  refreshButton: disabled => ({
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: disabled ? 'rgba(30, 41, 59, 0.6)' : 'rgba(59, 130, 246, 0.35)',
    color: disabled ? '#94a3b8' : '#e0f2fe',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
  }),
};

/**
 * @param {Object} props
 * @param {string} props.modeTab
 * @param {{ key: string, label: string }[]} props.modeTabs
 * @param {(key: string) => void} props.onModeChange
 * @param {{ id: string | number, name: string }[]} props.gameFilters
 * @param {string} props.selectedGameId
 * @param {(id: string) => void} props.onSelectGame
 * @param {{ key: string, label: string, value: number | null }[]} props.scoreOptions
 * @param {number | null} [props.scoreWindow]
 * @param {(value: number | null) => void} props.onScoreWindowChange
 * @param {boolean} props.refreshing
 * @param {() => void} props.onRefresh
 */
export function RoomFiltersSection({
  modeTab,
  modeTabs,
  onModeChange,
  gameFilters,
  selectedGameId,
  onSelectGame,
  scoreOptions,
  scoreWindow,
  onScoreWindowChange,
  refreshing,
  onRefresh,
}) {
  return (
    <section style={styles.card}>
      <div>
        <p style={styles.title}>모드 선택</p>
        <div style={styles.modeTabs}>
          {modeTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onModeChange(tab.key)}
              style={styles.modeTab(modeTab === tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p style={styles.title}>게임 필터</p>
        <p style={styles.hint}>캐릭터가 참여한 게임을 기준으로 방을 좁힐 수 있습니다.</p>
        <div style={styles.gameFilters}>
          <button
            type="button"
            style={styles.gameFilterButton(selectedGameId === 'all')}
            onClick={() => onSelectGame('all')}
          >
            전체 보기
          </button>
          {gameFilters.map(game => (
            <button
              key={game.id}
              type="button"
              style={styles.gameFilterButton(selectedGameId === game.id)}
              onClick={() => onSelectGame(game.id)}
            >
              {game.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p style={styles.title}>점수 범위</p>
        <p style={styles.hint}>
          원하는 점수 차이를 설정하면 평균 점수가 범위 안에 있는 방만 표시합니다.
        </p>
        <div style={styles.scoreRow}>
          {scoreOptions.map(option => (
            <button
              key={option.key}
              type="button"
              style={styles.scoreButton(scoreWindow === option.value)}
              onClick={() => onScoreWindowChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={onRefresh}
          style={styles.refreshButton(refreshing)}
          disabled={refreshing}
        >
          {refreshing ? '새로고침 중...' : '목록 새로고침'}
        </button>
      </div>
    </section>
  );
}

RoomFiltersSection.defaultProps = {
  scoreWindow: null,
};

export default RoomFiltersSection;
