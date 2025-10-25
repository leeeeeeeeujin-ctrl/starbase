import { useEffect, useState } from 'react';
import styles from './MatchmakingAnalytics.module.css';

const TIME_RANGES = [
  { value: '1h', label: '1시간' },
  { value: '24h', label: '24시간' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
];

function formatNumber(num) {
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('ko-KR').format(Math.round(num));
}

function formatPercent(value, total) {
  if (!total || !Number.isFinite(value)) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function StageDistributionChart({ stageStats, total }) {
  const stages = Object.entries(stageStats).sort((a, b) => b[1].total - a[1].total);
  const maxCount = Math.max(...stages.map(([, s]) => s.total));

  return (
    <div className={styles.chartSection}>
      <h4 className={styles.chartTitle}>Stage 분포</h4>
      <div className={styles.barChart}>
        {stages.map(([stage, stats]) => {
          const heightPercent = (stats.total / maxCount) * 100;
          return (
            <div key={stage} className={styles.barWrapper}>
              <div className={styles.barTrack}>
                <div
                  className={styles.bar}
                  style={{ height: `${heightPercent}%` }}
                  title={`${stage}: ${stats.total}`}
                >
                  <span className={styles.barValue}>{stats.total}</span>
                </div>
              </div>
              <div className={styles.barLabel}>{stage}</div>
              <div className={styles.barMeta}>
                <span className={styles.barMetaMatched}>✓ {stats.matched}</span>
                <span className={styles.barMetaPending}>⏳ {stats.pending}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineChart({ timeline }) {
  if (!timeline || timeline.length === 0) {
    return <p className={styles.emptyMessage}>타임라인 데이터가 없습니다.</p>;
  }

  const maxCount = Math.max(...timeline.map(t => t.count));

  return (
    <div className={styles.chartSection}>
      <h4 className={styles.chartTitle}>시간대별 활동</h4>
      <div className={styles.timelineChart}>
        {timeline.map((bucket, idx) => {
          const heightPercent = (bucket.count / maxCount) * 100;
          const timestamp = new Date(bucket.timestamp);
          const label = timestamp.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <div key={idx} className={styles.timelineBar}>
              <div className={styles.timelineTrack}>
                <div className={styles.timelineFill} style={{ height: `${heightPercent}%` }}>
                  <span className={styles.timelineValue}>{bucket.count}</span>
                </div>
              </div>
              <div className={styles.timelineLabel}>{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, highlight }) {
  return (
    <div className={`${styles.statCard} ${highlight ? styles.statCardHighlight : ''}`}>
      <dt className={styles.statTitle}>{title}</dt>
      <dd className={styles.statValue}>{value}</dd>
      {subtitle && <p className={styles.statSubtitle}>{subtitle}</p>}
    </div>
  );
}

export default function MatchmakingAnalytics() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [range, setRange] = useState('24h');

  const fetchAnalytics = async (manual = false) => {
    if (manual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/admin/matchmaking-analytics?range=${range}`);
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.error || '집계 데이터를 불러오지 못했습니다.');
      }
      const payload = await response.json();
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(false);
  }, [range]);

  const isUnavailable = data && data.available === false;

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>매칭 통계 & 집계</h2>
          <p className={styles.subtitle}>시간대별 활동, Stage 분포, 성공률 등을 시각화합니다.</p>
        </div>
        <div className={styles.actions}>
          <div className={styles.rangeSelector}>
            {TIME_RANGES.map(r => (
              <button
                key={r.value}
                className={`${styles.rangeButton} ${range === r.value ? styles.rangeButtonActive : ''}`}
                onClick={() => setRange(r.value)}
                disabled={loading || refreshing}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => fetchAnalytics(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </header>

      {loading && !refreshing && <p className={styles.statusLine}>집계 중…</p>}
      {error && <p className={styles.errorLine}>⚠️ {error}</p>}

      {isUnavailable && !error && (
        <div className={styles.missingCallout}>
          <h3>테이블이 준비되지 않았습니다.</h3>
          <p>
            <code>rank_matchmaking_logs</code> 테이블을 배포하면 집계 기능을 사용할 수 있습니다.
          </p>
        </div>
      )}

      {data?.available && !error && (
        <div className={styles.content}>
          <dl className={styles.statsGrid}>
            <StatCard title="총 이벤트" value={formatNumber(data.total)} highlight />
            <StatCard
              title="매치 성공"
              value={formatNumber(data.statusStats?.matched || 0)}
              subtitle={formatPercent(data.statusStats?.matched || 0, data.total)}
            />
            <StatCard
              title="대기 중"
              value={formatNumber(data.statusStats?.pending || 0)}
              subtitle={formatPercent(data.statusStats?.pending || 0, data.total)}
            />
            <StatCard
              title="Drop-in"
              value={formatNumber(data.dropInCount || 0)}
              subtitle={formatPercent(data.dropInCount || 0, data.total)}
            />
            <StatCard
              title="Multi-slot"
              value={formatNumber(data.multiSlotCount || 0)}
              subtitle="동시 점령"
            />
            <StatCard
              title="평균 Score 범위"
              value={data.avgScoreWindow ? `±${Math.round(data.avgScoreWindow)}` : 'N/A'}
              subtitle="매칭 윈도우"
            />
          </dl>

          {data.stageStats && (
            <StageDistributionChart stageStats={data.stageStats} total={data.total} />
          )}

          {data.timeline && <TimelineChart timeline={data.timeline} />}

          {data.modeStats && (
            <div className={styles.chartSection}>
              <h4 className={styles.chartTitle}>Mode 분포</h4>
              <div className={styles.modeGrid}>
                {Object.entries(data.modeStats).map(([mode, count]) => (
                  <div key={mode} className={styles.modeCard}>
                    <span className={styles.modeName}>{mode}</span>
                    <span className={styles.modeCount}>{count}</span>
                    <span className={styles.modePercent}>{formatPercent(count, data.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
