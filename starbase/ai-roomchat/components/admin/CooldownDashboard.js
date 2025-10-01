import { useEffect, useMemo, useState } from 'react'
import styles from './CooldownDashboard.module.css'

const STATUS_LABELS = {
  ok: { label: '정상', tone: styles.statusOk },
  warning: { label: '주의', tone: styles.statusWarning },
  critical: { label: '위험', tone: styles.statusCritical },
}

function formatNumber(value, { style = 'decimal', digits = 0 } = {}) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('ko-KR', {
    style,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return '—'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}초`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  if (!remaining) {
    return `${minutes}분`
  }
  return `${minutes}분 ${remaining}초`
}

function StatusBadge({ status }) {
  const { label, tone } = STATUS_LABELS[status] || STATUS_LABELS.ok
  return <span className={`${styles.statusBadge} ${tone}`}>{label}</span>
}

function IssueList({ issues }) {
  if (!issues?.length) return <p className={styles.emptyMessage}>문제가 감지되지 않았습니다.</p>
  return (
    <ul className={styles.issueList}>
      {issues.map((issue, index) => (
        <li key={`${issue.metric}-${index}`} className={styles.issueItem}>
          <StatusBadge status={issue.severity} />
          <div>
            <p className={styles.issueMessage}>{issue.message}</p>
            {issue.details && (
              <p className={styles.issueDetails}>
                {Object.entries(issue.details).map(([key, value]) => (
                  <span key={key} className={styles.detailChip}>
                    {key}: {typeof value === 'number' ? value : String(value)}
                  </span>
                ))}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function SummaryCard({ title, value, helper, status }) {
  return (
    <article className={styles.summaryCard}>
      <header className={styles.summaryHeader}>
        <h3>{title}</h3>
        <StatusBadge status={status} />
      </header>
      <p className={styles.summaryValue}>{value}</p>
      {helper && <p className={styles.summaryHelper}>{helper}</p>}
    </article>
  )
}

function ProviderTable({ providers }) {
  if (!providers?.length) {
    return <p className={styles.emptyMessage}>현재 추적 중인 제공자가 없습니다.</p>
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>제공자</th>
            <th>상태</th>
            <th>추적 키</th>
            <th>실패 비율</th>
            <th>쿨다운 키 비중</th>
            <th>평균 알림 시간</th>
            <th>평균 회복 시간</th>
            <th>주요 경고</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => {
            const ratio = provider.trackedKeys
              ? provider.currentlyTriggered / provider.trackedKeys
              : 0
            const headline = provider.issues?.[0]?.message || '—'
            return (
              <tr key={provider.provider}>
                <td>{provider.provider}</td>
                <td>
                  <StatusBadge status={provider.status} />
                </td>
                <td>{formatNumber(provider.trackedKeys)}</td>
                <td>{formatNumber(provider.estimatedFailureRate, { digits: 2 })}</td>
                <td>{formatNumber(ratio, { digits: 2 })}</td>
                <td>{formatDuration(provider.avgAlertDurationMs)}</td>
                <td>{formatDuration(provider.avgRotationDurationMs)}</td>
                <td className={styles.issueText}>{headline}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function LatestAttempts({ attempts }) {
  if (!attempts?.length) {
    return <p className={styles.emptyMessage}>최근 시도가 없습니다.</p>
  }

  return (
    <ul className={styles.attemptList}>
      {attempts.map((attempt, index) => (
        <li key={`${attempt.keyHash || 'unknown'}-${index}`} className={styles.attemptItem}>
          <header className={styles.attemptHeader}>
            <h4>{attempt.keyHash || '알 수 없는 키'}</h4>
            <StatusBadge status={attempt.status} />
          </header>
          <p className={styles.attemptMeta}>
            {attempt.provider ? `${attempt.provider} · ` : ''}
            {attempt.attemptedAt ? new Date(attempt.attemptedAt).toLocaleString('ko-KR') : '시각 미기록'}
          </p>
          {typeof attempt.attemptCount === 'number' && (
            <p className={styles.attemptMeta}>재시도 {attempt.attemptCount}회</p>
          )}
          <IssueList issues={attempt.issues} />
        </li>
      ))}
    </ul>
  )
}

export default function CooldownDashboard() {
  const [telemetry, setTelemetry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [limit, setLimit] = useState(15)

  useEffect(() => {
    let cancelled = false
    async function loadTelemetry() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/rank/cooldown-telemetry?latestLimit=${limit}`)
        if (!response.ok) {
          throw new Error('쿨다운 리포트를 불러오지 못했습니다.')
        }
        const payload = await response.json()
        if (!cancelled) {
          setTelemetry(payload)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError.message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadTelemetry()
    return () => {
      cancelled = true
    }
  }, [limit])

  const overallStatus = telemetry?.alerts?.overall || { status: 'ok', issues: [] }
  const providerAlerts = useMemo(() => {
    if (!telemetry?.alerts?.providers) return []
    return telemetry.alerts.providers.map((entry) => {
      const provider = telemetry.providers?.find((item) => item.provider === entry.provider)
      return {
        trackedKeys: provider?.trackedKeys ?? 0,
        currentlyTriggered: provider?.currentlyTriggered ?? 0,
        estimatedFailureRate: provider?.estimatedFailureRate ?? 0,
        avgAlertDurationMs: provider?.avgAlertDurationMs ?? null,
        avgRotationDurationMs: provider?.avgRotationDurationMs ?? null,
        recommendedBackoffMs: provider?.recommendedBackoffMs ?? null,
        recommendedWeight: provider?.recommendedWeight ?? null,
        ...entry,
      }
    })
  }, [telemetry])

  const latestAlerts = useMemo(() => {
    if (!telemetry?.alerts?.attempts) return []
    return telemetry.alerts.attempts.map((entry) => {
      const attempt = telemetry.latestAttempts?.find(
        (item) => item.keyHash === entry.keyHash && item.attemptedAt === entry.attemptedAt,
      )
      return {
        keySample: attempt?.keySample ?? null,
        attemptCount: attempt?.attemptCount ?? null,
        triggered: attempt?.triggered ?? false,
        ...entry,
      }
    })
  }, [telemetry])

  return (
    <section className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h2>API 키 쿨다운 대시보드</h2>
          <p className={styles.caption}>
            자동화 시도 현황과 권장 백오프/가중치, 알람 임계값 기반 위험도를 한눈에 확인하세요.
          </p>
        </div>
        <label className={styles.limitControl}>
          최근 시도 표시 개수
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            {[5, 10, 15, 20, 30, 50].map((option) => (
              <option key={option} value={option}>
                {option}개
              </option>
            ))}
          </select>
        </label>
      </header>

      {loading ? (
        <p className={styles.loading}>리포트를 불러오는 중입니다…</p>
      ) : error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setLimit((value) => value)} className={styles.retry}>
            다시 시도
          </button>
        </div>
      ) : telemetry ? (
        <>
          <section className={styles.summaryGrid}>
            <SummaryCard
              title="추적 중인 키"
              value={formatNumber(telemetry.totals?.trackedKeys)}
              helper={`성공 경험: ${formatNumber(telemetry.totals?.keysWithSuccess)} / 실패 비율 ${formatNumber(
                telemetry.totals?.estimatedFailureRate,
                { digits: 2 },
              )}`}
              status={overallStatus.status}
            />
            <SummaryCard
              title="현재 쿨다운 키"
              value={formatNumber(telemetry.totals?.currentlyTriggered)}
              helper={`권장 백오프 ${formatDuration(telemetry.totals?.recommendedBackoffMs)}`}
              status={overallStatus.status}
            />
            <SummaryCard
              title="권장 가중치"
              value={formatNumber(telemetry.totals?.recommendedWeight, { digits: 2 })}
              helper={`평균 알림 ${formatDuration(telemetry.totals?.avgAlertDurationMs)} · 교체 ${formatDuration(
                telemetry.totals?.avgRotationDurationMs,
              )}`}
              status={overallStatus.status}
            />
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h3>전체 위험 신호</h3>
            </header>
            <IssueList issues={overallStatus.issues} />
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h3>제공자별 현황</h3>
            </header>
            <ProviderTable providers={providerAlerts} />
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h3>최근 자동화 시도</h3>
            </header>
            <LatestAttempts attempts={latestAlerts} />
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h3>알람 임계값</h3>
              <p className={styles.caption}>임계값을 넘는 순간 위험/주의 신호가 생성됩니다.</p>
            </header>
            <dl className={styles.thresholdList}>
              <div>
                <dt>실패 비율</dt>
                <dd>주의 {telemetry.alerts?.thresholds?.failureRate?.warning ?? '—'} · 위험 {telemetry.alerts?.thresholds?.failureRate?.critical ?? '—'}</dd>
              </div>
              <div>
                <dt>쿨다운 비중</dt>
                <dd>주의 {telemetry.alerts?.thresholds?.triggeredRatio?.warning ?? '—'} · 위험 {telemetry.alerts?.thresholds?.triggeredRatio?.critical ?? '—'}</dd>
              </div>
              <div>
                <dt>알림 소요 시간</dt>
                <dd>주의 {formatDuration(telemetry.alerts?.thresholds?.avgAlertDurationMs?.warning)} · 위험 {formatDuration(telemetry.alerts?.thresholds?.avgAlertDurationMs?.critical)}</dd>
              </div>
              <div>
                <dt>자동 교체 소요</dt>
                <dd>주의 {formatDuration(telemetry.alerts?.thresholds?.avgRotationDurationMs?.warning)} · 위험 {formatDuration(telemetry.alerts?.thresholds?.avgRotationDurationMs?.critical)}</dd>
              </div>
              <div>
                <dt>연속 재시도 횟수</dt>
                <dd>주의 {telemetry.alerts?.thresholds?.attemptsWithoutSuccess?.warning ?? '—'}회 · 위험 {telemetry.alerts?.thresholds?.attemptsWithoutSuccess?.critical ?? '—'}회</dd>
              </div>
            </dl>
          </section>
        </>
      ) : (
        <p className={styles.emptyMessage}>리포트 데이터를 찾을 수 없습니다.</p>
      )}
    </section>
  )
}
