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

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined) return '—'
  return formatNumber(value, { style: 'percent', digits })
}

function formatDeltaPercent(value, digits = 1) {
  if (value === null || value === undefined) return '—'
  if (value === 0) return formatNumber(value, { style: 'percent', digits })
  const prefix = value > 0 ? '+' : '−'
  const absolute = Math.abs(value)
  return `${prefix}${formatNumber(absolute, { style: 'percent', digits })}`
}

function normalize(value, { min = 0, max = 1 } = {}) {
  if (value === null || value === undefined) return null
  if (!Number.isFinite(value)) return null
  if (max === min) return null
  const clamped = Math.min(Math.max(value, min), max)
  return (clamped - min) / (max - min)
}

function buildSegments({ direction, min, max, warning, critical }) {
  const segments = []
  const normalizedWarning = normalize(warning, { min, max })
  const normalizedCritical = normalize(critical, { min, max })

  if (direction === 'low') {
    const criticalStart = 0
    const criticalEnd = normalizedCritical ?? 0
    const warningStart = normalizedCritical ?? 0
    const warningEnd = normalizedWarning ?? 1
    const safeStart = normalizedWarning ?? 0
    const safeEnd = 1

    segments.push({ tone: 'critical', start: criticalStart, end: criticalEnd })
    segments.push({ tone: 'warning', start: warningStart, end: warningEnd })
    segments.push({ tone: 'ok', start: safeStart, end: safeEnd })
  } else {
    const safeStart = 0
    const safeEnd = normalizedWarning ?? 1
    const warningStart = normalizedWarning ?? 1
    const warningEnd = normalizedCritical ?? 1
    const criticalStart = normalizedCritical ?? 1
    const criticalEnd = 1

    segments.push({ tone: 'ok', start: safeStart, end: safeEnd })
    segments.push({ tone: 'warning', start: warningStart, end: warningEnd })
    segments.push({ tone: 'critical', start: criticalStart, end: criticalEnd })
  }

  return segments
    .map((segment) => ({
      ...segment,
      width: Math.max(segment.end - segment.start, 0),
    }))
    .filter((segment) => segment.width > 0)
}

function ThresholdGauge({
  label,
  value,
  thresholds = {},
  direction = 'high',
  min = 0,
  max = 1,
  formatValue = (input) => formatNumber(input),
}) {
  const normalizedValue = normalize(value, { min, max })
  const normalizedWarning = normalize(thresholds.warning, { min, max })
  const normalizedCritical = normalize(thresholds.critical, { min, max })
  const segments = buildSegments({ direction, min, max, ...thresholds })

  const warningLabel =
    thresholds.warning === null || thresholds.warning === undefined
      ? null
      : direction === 'low'
      ? `주의 ≤ ${formatValue(thresholds.warning)}`
      : `주의 ≥ ${formatValue(thresholds.warning)}`
  const criticalLabel =
    thresholds.critical === null || thresholds.critical === undefined
      ? null
      : direction === 'low'
      ? `위험 ≤ ${formatValue(thresholds.critical)}`
      : `위험 ≥ ${formatValue(thresholds.critical)}`

  return (
    <article className={styles.gaugeCard}>
      <header className={styles.gaugeHeader}>
        <h4>{label}</h4>
        <span className={styles.gaugeValue}>{formatValue(value)}</span>
      </header>
      <div className={styles.gaugeBar}>
        {segments.map((segment, index) => (
          <div
            key={`${segment.tone}-${index}`}
            className={`${styles.gaugeSegment} ${styles[`gaugeSegment${segment.tone[0].toUpperCase() + segment.tone.slice(1)}`]}`}
            style={{ width: `${segment.width * 100}%`, left: `${segment.start * 100}%` }}
          />
        ))}
        {normalizedValue !== null && (
          <div className={styles.gaugeMarker} style={{ left: `${normalizedValue * 100}%` }} />
        )}
        {normalizedWarning !== null && (
          <div className={`${styles.gaugeThreshold} ${styles.gaugeThresholdWarning}`} style={{ left: `${normalizedWarning * 100}%` }} />
        )}
        {normalizedCritical !== null && (
          <div className={`${styles.gaugeThreshold} ${styles.gaugeThresholdCritical}`} style={{ left: `${normalizedCritical * 100}%` }} />
        )}
      </div>
      <ul className={styles.gaugeLegend}>
        {warningLabel && <li>{warningLabel}</li>}
        {criticalLabel && <li>{criticalLabel}</li>}
      </ul>
    </article>
  )
}

function TokenList({ title, items, maxMatches }) {
  if (!items?.length) {
    return (
      <article className={styles.languageCard}>
        <h4>{title}</h4>
        <p className={styles.emptyMessage}>충분한 데이터가 없습니다.</p>
      </article>
    )
  }

  return (
    <article className={styles.languageCard}>
      <h4>{title}</h4>
      <ul className={styles.wordList}>
        {items.map((item) => {
          const usage = maxMatches ? Math.min(item.matches / maxMatches, 1) : 0
          const deltaClass =
            item.delta === null || item.delta === undefined
              ? styles.deltaNeutral
              : item.delta >= 0
              ? styles.deltaPositive
              : styles.deltaNegative
          return (
            <li key={item.token} className={styles.wordItem}>
              <div className={styles.wordLabel}>
                <span className={styles.wordToken}>{item.token}</span>
                <span className={styles.wordBadge}>{formatNumber(item.matches)}회</span>
              </div>
              <div className={styles.wordBar}>
                <div className={styles.wordBarBackground} />
                <div className={styles.wordBarFill} style={{ width: `${usage * 100}%` }} />
              </div>
              <div className={styles.wordMeta}>
                <span>승률 {formatPercent(item.winRate)}</span>
                <span className={`${styles.deltaBadge} ${deltaClass}`}>
                  {formatDeltaPercent(item.delta)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

function SentenceTierList({ tiers, highlights }) {
  const tierOrder = ['S', 'A', 'B', 'C', 'D']
  return (
    <article className={`${styles.languageCard} ${styles.languageCardFull}`}>
      <h4>문장 티어 리스트</h4>
      <div className={styles.tierGrid}>
        {tierOrder.map((tier) => {
          const items = tiers?.[tier] || []
          return (
            <div key={tier} className={styles.tierColumn}>
              <div className={styles.tierLabel}>Tier {tier}</div>
              {items.length ? (
                <ul className={styles.tierList}>
                  {items.map((item, index) => (
                    <li key={`${tier}-${index}`} className={styles.tierItem}>
                      <p className={styles.tierSentence}>{item.sample}</p>
                      <p className={styles.tierMeta}>
                        {formatNumber(item.matches)}회 · 승률 {formatPercent(item.winRate)} · Δ{formatDeltaPercent(item.delta)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.emptyMessage}>표시할 문장이 없습니다.</p>
              )}
            </div>
          )
        })}
      </div>
      <div className={styles.sentenceHighlights}>
        <div>
          <h5>승률 상승 문장</h5>
          {highlights?.positive?.length ? (
            <ul className={styles.sentenceList}>
              {highlights.positive.map((item, index) => (
                <li key={`pos-${index}`} className={styles.sentenceItem}>
                  <p className={styles.tierSentence}>{item.sample}</p>
                  <p className={styles.tierMeta}>
                    {formatNumber(item.matches)}회 · 승률 {formatPercent(item.winRate)} · Δ{formatDeltaPercent(item.delta)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyMessage}>승률 상승 문장 데이터가 부족합니다.</p>
          )}
        </div>
        <div>
          <h5>승률 하락 문장</h5>
          {highlights?.negative?.length ? (
            <ul className={styles.sentenceList}>
              {highlights.negative.map((item, index) => (
                <li key={`neg-${index}`} className={styles.sentenceItem}>
                  <p className={styles.tierSentence}>{item.sample}</p>
                  <p className={styles.tierMeta}>
                    {formatNumber(item.matches)}회 · 승률 {formatPercent(item.winRate)} · Δ{formatDeltaPercent(item.delta)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyMessage}>승률 하락 문장 데이터가 부족합니다.</p>
          )}
        </div>
      </div>
    </article>
  )
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
            <th>최근 런북 첨부율</th>
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

            const hasDocLinkRate =
              provider.lastDocLinkAttachmentRate !== null &&
              provider.lastDocLinkAttachmentRate !== undefined
            let docLinkCell = '—'
            if (hasDocLinkRate) {
              const rateText = formatNumber(provider.lastDocLinkAttachmentRate, {
                style: 'percent',
                digits: 0,
              })
              const suffix =
                typeof provider.docLinkAttachmentCount === 'number'
                  ? ` · 누적 ${formatNumber(provider.docLinkAttachmentCount)}회`
                  : ''
              docLinkCell = `${rateText}${suffix}`
            }

            return (
              <tr key={provider.provider}>
                <td>{provider.provider}</td>
                <td>
                  <StatusBadge status={provider.status} />
                </td>
                <td>{formatNumber(provider.trackedKeys)}</td>
                <td>{formatNumber(provider.estimatedFailureRate, { digits: 2 })}</td>
                <td>{formatNumber(ratio, { digits: 2 })}</td>
                <td>{docLinkCell}</td>
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
          {typeof attempt.docLinkAttached === 'boolean' && (
            <p className={styles.attemptMeta}>
              런북 링크 {attempt.docLinkAttached ? '첨부됨' : '미첨부'}
              {typeof attempt.docLinkAttachmentCount === 'number' && attempt.docLinkAttachmentCount > 0
                ? ` · 누적 ${formatNumber(attempt.docLinkAttachmentCount)}회`
                : ''}
            </p>
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
  const [languageInsights, setLanguageInsights] = useState(null)
  const [languageLoading, setLanguageLoading] = useState(true)
  const [languageError, setLanguageError] = useState(null)
  const [languageRefreshToken, setLanguageRefreshToken] = useState(0)

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
        docLinkAttachmentCount: provider?.docLinkAttachmentCount ?? null,
        docLinkAttachmentRate: provider?.docLinkAttachmentRate ?? null,
        lastDocLinkAttachmentRate: provider?.lastDocLinkAttachmentRate ?? null,
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
        docLinkAttached: attempt?.docLinkAttached ?? null,
        docLinkAttachmentCount: attempt?.docLinkAttachmentCount ?? null,
        docLinkAttachmentRate: attempt?.docLinkAttachmentRate ?? null,
        ...entry,
      }
    })
  }, [telemetry])

  useEffect(() => {
    const controller = new AbortController()
    async function loadInsights() {
      setLanguageLoading(true)
      setLanguageError(null)
      try {
        const response = await fetch(`/api/rank/admin-language-insights?limit=300`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: '언어 인사이트를 불러오지 못했습니다.' }))
          throw new Error(payload.error || '언어 인사이트를 불러오지 못했습니다.')
        }
        const payload = await response.json()
        setLanguageInsights(payload)
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') return
        setLanguageError(fetchError.message || '언어 인사이트를 불러오지 못했습니다.')
      } finally {
        setLanguageLoading(false)
      }
    }

    loadInsights()

    return () => controller.abort()
  }, [languageRefreshToken])

  const thresholdGauges = useMemo(() => {
    if (!telemetry) return []
    const thresholds = telemetry.alerts?.thresholds || {}
    const totals = telemetry.totals || {}
    const trackedKeys = totals.trackedKeys || 0
    const triggeredRatio = trackedKeys ? totals.currentlyTriggered / trackedKeys : null

    const avgAlertCritical = thresholds.avgAlertDurationMs?.critical || 60000
    const avgRotationCritical = thresholds.avgRotationDurationMs?.critical || 180000

    return [
      {
        key: 'failureRate',
        label: '실패 비율',
        value: totals.estimatedFailureRate ?? null,
        thresholds: thresholds.failureRate,
        formatValue: (value) => formatPercent(value, 1),
        direction: 'high',
        max: 1,
      },
      {
        key: 'triggeredRatio',
        label: '쿨다운 키 비중',
        value: triggeredRatio,
        thresholds: thresholds.triggeredRatio,
        formatValue: (value) => formatPercent(value, 1),
        direction: 'high',
        max: 1,
      },
      {
        key: 'docLinkAttachmentRate',
        label: '런북 링크 첨부율',
        value: totals.docLinkAttachmentRate ?? null,
        thresholds: thresholds.docLinkAttachmentRate,
        formatValue: (value) => formatPercent(value, 0),
        direction: 'low',
        max: 1,
      },
      {
        key: 'lastDocLinkAttachmentRate',
        label: '최근 첨부율 (마지막 시도)',
        value: totals.lastDocLinkAttachmentRate ?? null,
        thresholds: thresholds.lastDocLinkAttachmentRate,
        formatValue: (value) => formatPercent(value, 0),
        direction: 'low',
        max: 1,
      },
      {
        key: 'avgAlertDurationMs',
        label: '평균 알림 소요',
        value: totals.avgAlertDurationMs ?? null,
        thresholds: thresholds.avgAlertDurationMs,
        formatValue: (value) => formatDuration(value),
        direction: 'high',
        max: avgAlertCritical * 1.5,
      },
      {
        key: 'avgRotationDurationMs',
        label: '평균 교체 소요',
        value: totals.avgRotationDurationMs ?? null,
        thresholds: thresholds.avgRotationDurationMs,
        formatValue: (value) => formatDuration(value),
        direction: 'high',
        max: avgRotationCritical * 1.5,
      },
    ]
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
            <SummaryCard
              title="런북 링크 첨부율"
              value={formatNumber(telemetry.totals?.lastDocLinkAttachmentRate, {
                style: 'percent',
                digits: 0,
              })}
              helper={`누적 첨부 ${formatNumber(telemetry.totals?.docLinkAttachmentCount)}회 · 시도 대비 ${formatNumber(
                telemetry.totals?.docLinkAttachmentRate,
                { style: 'percent', digits: 1 },
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
            <div className={styles.thresholdGrid}>
              {thresholdGauges.map((gauge) => (
                <ThresholdGauge
                  key={gauge.key}
                  label={gauge.label}
                  value={gauge.value}
                  thresholds={gauge.thresholds}
                  direction={gauge.direction}
                  min={0}
                  max={gauge.max}
                  formatValue={gauge.formatValue}
                />
              ))}
            </div>
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
              <div>
                <dt>런북 링크 첨부율</dt>
                <dd>
                  전체 주의 ≤ {formatPercent(telemetry.alerts?.thresholds?.docLinkAttachmentRate?.warning ?? null, 0)} · 위험 ≤{' '}
                  {formatPercent(telemetry.alerts?.thresholds?.docLinkAttachmentRate?.critical ?? null, 0)} / 최근 주의 ≤{' '}
                  {formatPercent(telemetry.alerts?.thresholds?.lastDocLinkAttachmentRate?.warning ?? null, 0)} · 위험 ≤{' '}
                  {formatPercent(telemetry.alerts?.thresholds?.lastDocLinkAttachmentRate?.critical ?? null, 0)}
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h3>언어 성능 인사이트</h3>
              <button
                type="button"
                className={styles.refreshButton}
                onClick={() => setLanguageRefreshToken((value) => value + 1)}
                disabled={languageLoading}
              >
                {languageLoading ? '불러오는 중…' : '새로고침'}
              </button>
            </header>
            <p className={styles.caption}>
              최근 랭크 전투 로그를 분석해 단어별 사용량, 승률 상관관계, OP 문장을 티어로 정리했습니다.
            </p>
            {languageError ? (
              <p className={styles.errorMessage}>{languageError}</p>
            ) : languageLoading ? (
              <p className={styles.loading}>언어 인사이트를 불러오는 중입니다…</p>
            ) : languageInsights ? (
              <>
                <div className={styles.languageStats}>
                  <span>샘플 {formatNumber(languageInsights.sampleSize)}건</span>
                  <span>
                    기준 승률{' '}
                    {languageInsights.baseline?.winRate !== null && languageInsights.baseline?.winRate !== undefined
                      ? formatPercent(languageInsights.baseline.winRate)
                      : '—'}
                  </span>
                </div>
                {languageInsights.meta?.missingTable && (
                  <p className={styles.languageNotice}>
                    참고: 스테이징/로컬 환경에서 `rank_battle_logs` 테이블이 아직 생성되지 않아 샘플 없이 빈 카드가 표시됩니다. DDL을
                    적용한 뒤 새로고침해 주세요.
                  </p>
                )}
                <div className={styles.languageGrid}>
                  <TokenList
                    title="사용량 상위 단어"
                    items={languageInsights.tokens?.topByFrequency}
                    maxMatches={languageInsights.tokens?.maxMatches}
                  />
                  <TokenList
                    title="승률 상승 단어"
                    items={languageInsights.tokens?.topPositive}
                    maxMatches={languageInsights.tokens?.maxMatches}
                  />
                  <TokenList
                    title="승률 하락 단어"
                    items={languageInsights.tokens?.topNegative}
                    maxMatches={languageInsights.tokens?.maxMatches}
                  />
                  <SentenceTierList
                    tiers={languageInsights.sentences?.tiers}
                    highlights={{
                      positive: languageInsights.sentences?.topPositive,
                      negative: languageInsights.sentences?.topNegative,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className={styles.emptyMessage}>언어 인사이트 데이터를 찾을 수 없습니다.</p>
            )}
          </section>
        </>
      ) : (
        <p className={styles.emptyMessage}>리포트 데이터를 찾을 수 없습니다.</p>
      )}
    </section>
  )
}
