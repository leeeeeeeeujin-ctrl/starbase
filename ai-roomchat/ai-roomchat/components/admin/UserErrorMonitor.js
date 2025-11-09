import { useCallback, useEffect, useMemo, useState } from 'react';

import styles from '../../styles/AdminPortal.module.css';

const REFRESH_INTERVAL_MS = 60_000;

function formatDate(iso) {
  if (!iso) return '시간 정보 없음';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapSeverityLabel(severity) {
  const normalised = (severity || 'error').toLowerCase();
  if (normalised === 'warn') return '경고';
  if (normalised === 'info') return '정보';
  return '오류';
}

export default function UserErrorMonitor() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ items: [], stats: { total: 0, last24h: 0, bySeverity: {} } });

  const loadErrors = useCallback(async (withSpinner = false) => {
    if (withSpinner) {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/admin/errors');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '오류 리포트를 불러오지 못했습니다.');
      }

      const payload = await response.json();
      setData({
        items: Array.isArray(payload.items) ? payload.items : [],
        stats: payload.stats || { total: 0, last24h: 0, bySeverity: {} },
      });
      setError(null);
    } catch (err) {
      setError(err.message || '오류 리포트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialLoad = async () => {
      await loadErrors(true);
    };

    initialLoad();

    const intervalId = window.setInterval(() => {
      if (!cancelled) {
        loadErrors(false);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loadErrors]);

  const severitySummary = useMemo(() => {
    const entries = Object.entries(data.stats.bySeverity || {});
    if (!entries.length) {
      return '수집된 데이터 없음';
    }
    return entries.map(([key, value]) => `${mapSeverityLabel(key)} ${value}건`).join(' · ');
  }, [data.stats.bySeverity]);

  return (
    <section className={styles.errorMonitorSection}>
      <div className={styles.errorMonitorHeader}>
        <h3 className={styles.errorMonitorTitle}>사용자 오류 리포트</h3>
        <div className={styles.errorMonitorActions}>
          <button
            type="button"
            className={styles.errorMonitorRefresh}
            onClick={() => loadErrors(true)}
            disabled={loading}
          >
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
          <span className={styles.errorMonitorMeta}>최근 1분마다 자동 갱신</span>
        </div>
      </div>
      {error ? (
        <p className={styles.errorMonitorError}>{error}</p>
      ) : (
        <>
          <div className={styles.errorMonitorStats}>
            <span>총 {data.stats.total}건</span>
            <span>최근 24시간 {data.stats.last24h}건</span>
            <span>{severitySummary}</span>
          </div>
          <ul className={styles.errorMonitorList}>
            {data.items.map(item => (
              <li key={item.id} className={styles.errorMonitorItem}>
                <div className={styles.errorMonitorItemHeader}>
                  <span
                    className={styles.errorMonitorSeverity}
                    data-severity={(item.severity || 'error').toLowerCase()}
                  >
                    {mapSeverityLabel(item.severity)}
                  </span>
                  <time className={styles.errorMonitorTimestamp}>
                    {formatDate(item.created_at)}
                  </time>
                </div>
                <p className={styles.errorMonitorMessage}>{item.message}</p>
                {item.path ? <p className={styles.errorMonitorPath}>{item.path}</p> : null}
                {item.stack ? (
                  <details className={styles.errorMonitorDetails}>
                    <summary>스택 추적</summary>
                    <pre>{item.stack}</pre>
                  </details>
                ) : null}
              </li>
            ))}
            {!data.items.length && !loading ? (
              <li className={styles.errorMonitorEmpty}>아직 수집된 오류가 없습니다.</li>
            ) : null}
          </ul>
        </>
      )}
    </section>
  );
}
