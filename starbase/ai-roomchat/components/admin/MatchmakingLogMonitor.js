import { useEffect, useState } from 'react'
import styles from './MatchmakingLogMonitor.module.css'

const LIMIT = 80

function formatRelativeTime(iso) {
  if (!iso) return '—'
  const timestamp = Date.parse(iso)
  if (!Number.isFinite(timestamp)) return '—'
  const diffMs = Date.now() - timestamp
  const diffMinutes = Math.floor(diffMs / (60 * 1000))
  if (diffMinutes < 1) return '방금 전'
  if (diffMinutes < 60) return `${diffMinutes}분 전`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}시간 전`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}일 전`
}

function formatTimestamp(iso) {
  if (!iso) return '—'
  try {
    const date = new Date(iso)
    return date.toLocaleString()
  } catch (error) {
    return iso
  }
}

function StageStat({ stage }) {
  return (
    <div className={styles.stageCard}>
      <div className={styles.stageHeader}>
        <span className={styles.stageName}>{stage.stage}</span>
        <span className={styles.stageTotal}>{stage.total}</span>
      </div>
      <dl className={styles.stageBreakdown}>
        <div>
          <dt>매치 성공</dt>
          <dd>{stage.matched}</dd>
        </div>
        <div>
          <dt>대기/건너뜀</dt>
          <dd>{stage.pending}</dd>
        </div>
        <div>
          <dt>오류</dt>
          <dd>{stage.errors}</dd>
        </div>
      </dl>
      <p className={styles.stageFooter}>최근 기록: {formatRelativeTime(stage.lastSeen)}</p>
    </div>
  )
}

function RecentRow({ entry }) {
  return (
    <li className={styles.recentRow}>
      <div className={styles.recentHeader}>
        <span className={styles.recentStage}>{entry.stage || 'unknown'}</span>
        <span className={`${styles.statusBadge} ${styles[`status-${entry.status || 'unknown'}`]}`}>
          {entry.status || 'unknown'}
        </span>
        {entry.dropIn && <span className={styles.dropInBadge}>drop-in</span>}
      </div>
      <div className={styles.recentMeta}>
        <span>{entry.mode || '—'}</span>
        {entry.matchCode && <span>match: {entry.matchCode}</span>}
        {typeof entry.scoreWindow === 'number' && (
          <span>Δ {entry.scoreWindow}</span>
        )}
      </div>
      {entry.reason && <p className={styles.recentReason}>{entry.reason}</p>}
      <p className={styles.recentTimestamp}>{formatTimestamp(entry.createdAt)}</p>
    </li>
  )
}

export default function MatchmakingLogMonitor() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(null)

  const fetchLogs = async (manual = false) => {
    if (manual) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const response = await fetch(`/api/admin/matchmaking-logs?limit=${LIMIT}`)
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail?.detail || '로그를 불러오지 못했습니다.')
      }
      const data = await response.json()
      setPayload(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLogs(false)
  }, [])

  const isUnavailable = payload && payload.available === false

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>매칭 로그 요약</h2>
          <p className={styles.subtitle}>드롭인/비실시간 파이프라인 이벤트를 한눈에 확인하세요.</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => fetchLogs(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </header>

      {loading && !refreshing && <p className={styles.statusLine}>로그를 불러오는 중…</p>}
      {error && <p className={styles.errorLine}>⚠️ {error}</p>}

      {isUnavailable && !error && (
        <div className={styles.missingCallout}>
          <h3>테이블이 아직 생성되지 않았습니다.</h3>
          <p>
            Supabase에 <code>rank_matchmaking_logs</code> 테이블과 RLS 정책을 배포하면 여기에서 매칭 로그를 확인할 수 있습니다.
          </p>
        </div>
      )}

      {payload?.available && !error && (
        <div className={styles.content}>
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <dt>전체 누적</dt>
              <dd>{payload.total}</dd>
            </div>
            <div className={styles.summaryCard}>
              <dt>최근 24시간</dt>
              <dd>{payload.last24h}</dd>
            </div>
          </div>

          {payload.stageBuckets?.length ? (
            <div className={styles.stageGrid}>
              {payload.stageBuckets.map((stage) => (
                <StageStat key={stage.stage} stage={stage} />
              ))}
            </div>
          ) : (
            <p className={styles.statusLine}>표시할 단계별 로그가 아직 없습니다.</p>
          )}

          {payload.recent?.length ? (
            <div className={styles.recentBlock}>
              <h3 className={styles.blockTitle}>최근 이벤트</h3>
              <ul className={styles.recentList}>
                {payload.recent.slice(0, 12).map((entry) => (
                  <RecentRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.statusLine}>최근 이벤트가 없습니다.</p>
          )}
        </div>
      )}
    </section>
  )
}
