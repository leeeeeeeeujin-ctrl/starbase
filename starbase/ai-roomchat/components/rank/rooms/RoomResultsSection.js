import Link from 'next/link'
import PropTypes from 'prop-types'

import { isRealtimeEnabled } from '@/lib/rank/realtimeModes'

const styles = {
  card: {
    background: 'rgba(15, 23, 42, 0.78)',
    border: '1px solid rgba(148, 163, 184, 0.28)',
    borderRadius: 22,
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
  diagnosticsCard: {
    background: 'rgba(148, 163, 184, 0.08)',
    border: '1px dashed rgba(148, 163, 184, 0.3)',
    borderRadius: 16,
    padding: '16px 18px',
    display: 'grid',
    gap: 8,
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 1.6,
  },
  diagnosticsIntro: {
    margin: 0,
    fontWeight: 600,
    color: '#cbd5f5',
  },
  diagnosticsList: {
    margin: 0,
    paddingLeft: 18,
    display: 'grid',
    gap: 4,
  },
  diagnosticsItem: {
    margin: 0,
  },
  loading: {
    textAlign: 'center',
    padding: '80px 20px',
    color: '#94a3b8',
    fontSize: 15,
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#94a3b8',
  },
  grid: {
    display: 'grid',
    gap: 16,
  },
  link: {
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
  },
  cardBody: {
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background: 'rgba(15, 23, 42, 0.65)',
    padding: '18px 20px',
    display: 'grid',
    gap: 12,
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRow: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  meta: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  badge: {
    padding: '2px 8px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.2)',
    border: '1px solid rgba(59, 130, 246, 0.45)',
    color: '#bfdbfe',
    fontWeight: 600,
  },
  roles: {
    display: 'grid',
    gap: 6,
    fontSize: 13,
    color: '#cbd5f5',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    fontSize: 12,
    color: '#94a3b8',
  },
  code: {
    fontWeight: 700,
    color: '#f1f5f9',
  },
  ratingBadge: {
    alignSelf: 'flex-start',
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(251, 191, 36, 0.35)',
    background: 'rgba(251, 191, 36, 0.18)',
    color: '#facc15',
    fontWeight: 700,
    fontSize: 12,
  },
}

function resolveStatusLabel(status) {
  const normalized = typeof status === 'string' ? status.trim() : ''
  if (normalized === 'brawl') return '난전'
  if (normalized === 'in_progress' || normalized === 'battle') return '게임중'
  if (normalized === 'open') return '대기'
  return normalized || '상태 미지정'
}

export function RoomResultsSection({
  loading,
  filteredRooms,
  filterDiagnostics,
  filterMessages,
  effectiveHeroId,
  heroRatingForSelection,
  formatRelativeTime,
}) {
  return (
    <section style={styles.card}>
      <h2 style={styles.title}>검색 결과</h2>
      {filterMessages.length ? (
        <div style={styles.diagnosticsCard}>
          <p style={styles.diagnosticsIntro}>
            총 {filterDiagnostics.total}개 중 {filteredRooms.length}개가 현재 조건과 일치합니다.
          </p>
          <ul style={styles.diagnosticsList}>
            {filterMessages.map((message, index) => (
              <li key={index} style={styles.diagnosticsItem}>
                {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <div style={styles.loading}>방 목록을 불러오는 중입니다...</div>
      ) : filteredRooms.length === 0 ? (
        <div style={styles.empty}>조건에 맞는 방을 찾지 못했습니다.</div>
      ) : (
        <div style={styles.grid}>
          {filteredRooms.map((room) => {
            const href = effectiveHeroId
              ? { pathname: `/rooms/${room.id}`, query: { hero: effectiveHeroId } }
              : { pathname: `/rooms/${room.id}` }
            const scoreWindowLabel = room.scoreWindow === null ? '제한 없음' : `±${room.scoreWindow}`
            const hostRatingText = Number.isFinite(room.hostRating) ? `${room.hostRating}점` : '정보 없음'
            const realtimeLabel = isRealtimeEnabled(room.realtimeMode)
              ? room.realtimeMode === 'pulse'
                ? 'Pulse 실시간'
                : '실시간'
              : '비실시간'
            const statusLabel = resolveStatusLabel(room.status)
            const hostLimitLabel =
              room.realtimeMode === 'pulse' && Number.isFinite(room.hostRoleLimit)
                ? `같은 역할 최대 ${room.hostRoleLimit}명`
                : null
            const heroDelta =
              heroRatingForSelection && Number.isFinite(room.hostRating)
                ? Math.abs(heroRatingForSelection - room.hostRating)
                : null

            return (
              <Link key={room.id} href={href} style={styles.link} prefetch>
                <article style={styles.cardBody}>
                  <div style={styles.header}>
                    <div>
                      <h3 style={styles.titleRow}>{room.gameName}</h3>
                      <p style={styles.meta}>
                        <span>
                          코드: <span style={styles.code}>{room.code}</span>
                        </span>
                        <span>모드: {room.mode}</span>
                        <span>실시간: {realtimeLabel}</span>
                        <span>상태: {statusLabel}</span>
                        <span>
                          인원: {room.filledCount}/{room.slotCount}
                        </span>
                        {room.blindMode ? <span style={styles.badge}>블라인드</span> : null}
                      </p>
                      <p style={styles.meta}>
                        <span>방장 점수: {hostRatingText}</span>
                        <span>허용 범위: {scoreWindowLabel}</span>
                        {heroDelta !== null ? <span>내 점수와 차이: ±{heroDelta}</span> : null}
                        {hostLimitLabel ? <span>{hostLimitLabel}</span> : null}
                      </p>
                    </div>
                    {room.rating && Number.isFinite(room.rating.average) ? (
                      <span style={styles.ratingBadge}>평균 {room.rating.average}점</span>
                    ) : null}
                  </div>
                  {room.roles.length ? (
                    <div style={styles.roles}>
                      {room.roles.map((role) => (
                        <div key={role.role}>
                          {role.role}: {role.occupied}/{role.total} (준비 {role.ready})
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div style={styles.footer}>
                    <span>{formatRelativeTime(room.updatedAt)} 업데이트</span>
                    {room.rating?.count ? (
                      <span>
                        점수 범위 {room.rating.min}~{room.rating.max} ({room.rating.count}명)
                      </span>
                    ) : (
                      <span>점수 정보 없음</span>
                    )}
                  </div>
                </article>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

RoomResultsSection.propTypes = {
  loading: PropTypes.bool.isRequired,
  filteredRooms: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]) })).isRequired,
  filterDiagnostics: PropTypes.shape({ total: PropTypes.number }).isRequired,
  filterMessages: PropTypes.arrayOf(PropTypes.string).isRequired,
  effectiveHeroId: PropTypes.string,
  heroRatingForSelection: PropTypes.number,
  formatRelativeTime: PropTypes.func.isRequired,
}

RoomResultsSection.defaultProps = {
  effectiveHeroId: '',
  heroRatingForSelection: null,
}

export default RoomResultsSection
