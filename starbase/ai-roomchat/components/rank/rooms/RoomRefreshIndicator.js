import { memo } from 'react';

const styles = {
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusBadge: active => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 999,
    border: active ? '1px solid rgba(45, 212, 191, 0.45)' : '1px solid rgba(148, 163, 184, 0.35)',
    background: active ? 'rgba(16, 185, 129, 0.22)' : 'rgba(15, 23, 42, 0.5)',
    color: active ? '#99f6e4' : '#cbd5f5',
    fontWeight: 600,
    fontSize: 12,
  }),
  statusDot: active => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: active ? '#34d399' : '#64748b',
    boxShadow: active ? '0 0 8px rgba(52, 211, 153, 0.6)' : 'none',
  }),
  statusMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
};

/**
 * @param {Object} props
 * @param {boolean} props.hasRealtimeRooms
 * @param {boolean} props.refreshing
 * @param {number | null} [props.autoRefreshCountdown]
 */
export const RoomRefreshIndicator = memo(function RoomRefreshIndicator({
  hasRealtimeRooms,
  refreshing,
  autoRefreshCountdown,
}) {
  const countdownLabel =
    typeof autoRefreshCountdown === 'number'
      ? autoRefreshCountdown <= 0
        ? '곧 자동 새로고침 예정'
        : `다음 자동 새로고침까지 약 ${autoRefreshCountdown}초`
      : '자동 새로고침 대기 중';

  return (
    <div style={styles.statusRow}>
      <span style={styles.statusBadge(hasRealtimeRooms)}>
        <span aria-hidden="true" style={styles.statusDot(hasRealtimeRooms)} />
        {hasRealtimeRooms ? '실시간 방 모니터링 중' : '표준 모드 모니터링'}
      </span>
      <div style={styles.statusMeta}>
        {refreshing ? <span>새로고침 중...</span> : <span>{countdownLabel}</span>}
      </div>
    </div>
  );
});

RoomRefreshIndicator.defaultProps = {
  autoRefreshCountdown: null,
};

export default RoomRefreshIndicator;
