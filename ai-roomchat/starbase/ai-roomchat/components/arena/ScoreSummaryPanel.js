import { useCallback, useEffect, useState } from 'react';
import { ensureRpc } from '@/modules/arena/rpcClient';
import styles from './ScoreSummaryPanel.module.css';

export function ScoreSummaryPanel({ sessionId }) {
  const [settlement, setSettlement] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const fetchSettlement = useCallback(async () => {
    if (!sessionId) return;
    setStatus('loading');
    try {
      const data = await ensureRpc('finalize_rank_session', {
        p_session_id: sessionId,
      });
      setSettlement(data);
      setStatus('loaded');
      setError(null);
    } catch (fetchError) {
      setError(fetchError);
      setStatus('error');
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSettlement();
  }, [fetchSettlement]);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2>정산 & 점수</h2>
        <button onClick={fetchSettlement}>재확인</button>
      </div>
      {status === 'loading' ? <p>불러오는 중...</p> : null}
      {error ? <p className={styles.error}>오류: {error.message || String(error)}</p> : null}
      {settlement ? (
        <div className={styles.grid}>
          {settlement.participants?.map(entry => (
            <article key={entry.owner_id} className={styles.participant}>
              <h4>{entry.hero_name || entry.owner_id}</h4>
              <p>획득 점수: {entry.score_delta ?? 0}</p>
              <p>최종 점수: {entry.final_score ?? 'n/a'}</p>
            </article>
          ))}
        </div>
      ) : (
        <p>아직 정산 결과가 없습니다. 세션 종료 후 다시 확인하세요.</p>
      )}
    </section>
  );
}
