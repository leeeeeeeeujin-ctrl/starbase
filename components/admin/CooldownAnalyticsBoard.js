import { useEffect, useMemo, useState } from 'react'
import styles from './CooldownAnalyticsBoard.module.css'

const RANGE_OPTIONS = [
  { value: '30d', label: '최근 30일' },
  { value: '60d', label: '최근 60일' },
  { value: '90d', label: '최근 90일' },
  { value: '180d', label: '최근 180일' },
  { value: '365d', label: '최근 1년' },
]

const GROUPING_OPTIONS = [
  { value: 'week', label: '주간 집계' },
  { value: 'month', label: '월간 집계' },
  { value: 'day', label: '일간 집계' },
]

function formatNumber(value, { style = 'decimal', digits = 0 } = {}) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('ko-KR', {
    style,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

function formatPercent(value) {
  if (value === null || value === undefined) return '—'
  return formatNumber(value * 100, { digits: 1, style: 'decimal' }) + '%'
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

function TrendTable({ items }) {
  if (!items?.length) {
    return <p className={styles.emptyMessage}>선택한 구간에 해당하는 기록이 없습니다.</p>
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>기간</th>
            <th>사건 수</th>
            <th>고유 키</th>
            <th>경보 발생</th>
            <th>성공 알림</th>
            <th>실패율</th>
            <th>평균 알림 시간</th>
            <th>평균 회복 시간</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.bucketStart}>
              <td>{item.label}</td>
              <td>{formatNumber(item.records)}</td>
              <td>{formatNumber(item.uniqueKeys)}</td>
              <td>{formatNumber(item.triggered)}</td>
              <td>{formatNumber(item.notified)}</td>
              <td>{formatPercent(item.failureRate)}</td>
              <td>{formatDuration(item.avgAlertDurationMs)}</td>
              <td>{formatDuration(item.avgRotationDurationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BreakdownTable({ title, items, emptyLabel }) {
  if (!items?.length) {
    return <p className={styles.emptyMessage}>{emptyLabel}</p>
  }

  return (
    <div>
      <h3 className={styles.tableTitle}>{title}</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>구분</th>
              <th>사건 수</th>
              <th>고유 키</th>
              <th>경보 발생</th>
              <th>성공 알림</th>
              <th>실패율</th>
              <th>평균 알림 시간</th>
              <th>평균 회복 시간</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.provider || item.reason}>
                <td>{item.provider || item.reason}</td>
                <td>{formatNumber(item.records)}</td>
                <td>{formatNumber(item.uniqueKeys)}</td>
                <td>{formatNumber(item.triggered)}</td>
                <td>{formatNumber(item.notified)}</td>
                <td>{formatPercent(item.failureRate)}</td>
                <td>{formatDuration(item.avgAlertDurationMs)}</td>
                <td>{formatDuration(item.avgRotationDurationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RecentList({ items }) {
  if (!items?.length) {
    return <p className={styles.emptyMessage}>최근 기록이 없습니다.</p>
  }

  return (
    <ul className={styles.recentList}>
      {items.map((item, index) => (
        <li key={`${item.keyHash || 'unknown'}-${index}`} className={styles.recentItem}>
          <header className={styles.recentHeader}>
            <h4>{item.provider || 'unknown'}</h4>
            <p>{item.recordedAt ? new Date(item.recordedAt).toLocaleString('ko-KR') : '시각 미기록'}</p>
          </header>
          <dl className={styles.recentMeta}>
            <div>
              <dt>키 해시</dt>
              <dd>{item.keyHash || '—'}</dd>
            </div>
            <div>
              <dt>사유</dt>
              <dd>{item.reason || '—'}</dd>
            </div>
            <div>
              <dt>경보</dt>
              <dd>{item.triggered ? '예' : '아니오'}</dd>
            </div>
            <div>
              <dt>재시도 수</dt>
              <dd>{formatNumber(item.attemptCount)}</dd>
            </div>
            <div>
              <dt>실패 횟수</dt>
              <dd>{formatNumber(item.failureCount)}</dd>
            </div>
            <div>
              <dt>알림 소요</dt>
              <dd>{formatDuration(item.alertDurationMs)}</dd>
            </div>
            <div>
              <dt>교체 소요</dt>
              <dd>{formatDuration(item.rotationDurationMs)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )
}

export default function CooldownAnalyticsBoard() {
  const [range, setRange] = useState('90d')
  const [grouping, setGrouping] = useState('week')
  const [provider, setProvider] = useState('all')
  const [reason, setReason] = useState('all')
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const missingTable = analytics?.meta?.missingTable

  useEffect(() => {
    const controller = new AbortController()
    async function loadAnalytics() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (range) params.set('range', range)
        if (grouping) params.set('grouping', grouping)
        if (provider && provider !== 'all') params.set('provider', provider)
        if (reason && reason !== 'all') params.set('reason', reason)

        const response = await fetch(`/api/rank/cooldown-analytics?${params.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: '분석 보드를 불러오지 못했습니다.' }))
          throw new Error(payload.error || '분석 보드를 불러오지 못했습니다.')
        }

        const payload = await response.json()
        setAnalytics(payload)
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') return
        setError(fetchError.message || '분석 보드를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    loadAnalytics()

    return () => controller.abort()
  }, [range, grouping, provider, reason, refreshToken])

  const providerOptions = useMemo(() => {
    const base = analytics?.filters?.providers || []
    return ['all', ...base]
  }, [analytics])

  const reasonOptions = useMemo(() => {
    const base = analytics?.filters?.reasons || []
    return ['all', ...base]
  }, [analytics])

  const summaryCards = useMemo(() => {
    if (!analytics?.summary) {
      return []
    }

    return [
      {
        title: '총 기록',
        value: formatNumber(analytics.summary.records),
        helper: '선택한 기간 내 저장된 전체 쿨다운 이벤트 수',
      },
      {
        title: '고유 키',
        value: formatNumber(analytics.summary.uniqueKeys),
        helper: '기간 내 영향을 받은 키 수',
      },
      {
        title: '경보 발생',
        value: formatNumber(analytics.summary.triggered),
        helper: '자동화가 경보를 시도한 횟수',
      },
      {
        title: '성공 알림',
        value: formatNumber(analytics.summary.notified),
        helper: 'Slack/Webhook 등으로 전달된 성공 횟수',
      },
      {
        title: '추정 실패율',
        value: formatPercent(analytics.summary.failureRate),
        helper: '재시도 대비 실패 비중',
      },
      {
        title: '평균 알림 소요',
        value: formatDuration(analytics.summary.avgAlertDurationMs),
        helper: '경보가 전달되기까지 걸린 평균 시간',
      },
      {
        title: '평균 회복 소요',
        value: formatDuration(analytics.summary.avgRotationDurationMs),
        helper: '자동 키 교체까지 걸린 평균 시간',
      },
    ]
  }, [analytics])

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>쿨다운 장기 분석 보드</h2>
          <p className={styles.subtitle}>기간·제공자·사유별 필터를 적용해 주간·월간 추세를 살펴보세요.</p>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={() => setRefreshToken((value) => value + 1)}
          disabled={loading}
        >
          {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </header>

      <div className={styles.filterRow}>
        <label className={styles.filterControl}>
          <span>기간</span>
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterControl}>
          <span>집계</span>
          <select value={grouping} onChange={(event) => setGrouping(event.target.value)}>
            {GROUPING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterControl}>
          <span>제공자</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            {providerOptions.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? '전체' : value}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterControl}>
          <span>사유</span>
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {reasonOptions.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? '전체' : value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {missingTable && (
        <p className={styles.notice}>
          <code>rank_api_key_cooldowns</code> 테이블이 아직 배포 환경에 생성되지 않아 빈 결과를 표시합니다. Supabase
          마이그레이션을 적용해 테이블을 만든 뒤 새로고침해 주세요.
        </p>
      )}

      <div className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <article key={card.title} className={styles.summaryCard}>
            <h3>{card.title}</h3>
            <p className={styles.summaryValue}>{card.value}</p>
            <p className={styles.summaryHelper}>{card.helper}</p>
          </article>
        ))}
      </div>

      <section className={styles.trendSection}>
        <h3 className={styles.tableTitle}>기간별 추세</h3>
        {loading ? <p className={styles.muted}>불러오는 중…</p> : <TrendTable items={analytics?.trend} />}
      </section>

      <div className={styles.breakdownGrid}>
        <div>
          <BreakdownTable
            title="제공자별 추세"
            items={analytics?.providerBreakdown}
            emptyLabel="선택한 조건에 해당하는 제공자 기록이 없습니다."
          />
        </div>
        <div>
          <BreakdownTable
            title="사유별 추세"
            items={analytics?.reasonBreakdown}
            emptyLabel="선택한 조건에 해당하는 사유 기록이 없습니다."
          />
        </div>
      </div>

      <section>
        <h3 className={styles.tableTitle}>최근 관측된 이벤트</h3>
        {loading ? <p className={styles.muted}>불러오는 중…</p> : <RecentList items={analytics?.recent} />}
      </section>
    </section>
  )
}

