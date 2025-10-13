import { useCallback, useEffect, useState } from 'react'
import { ensureRpc } from '@/modules/arena/rpcClient'
import { subscribeToSession } from '@/modules/arena/realtimeChannels'
import styles from './SessionTurnsPanel.module.css'

export function SessionTurnsPanel({ sessionId, limit = 120 }) {
  const [turns, setTurns] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchTurns = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const data = await ensureRpc('fetch_rank_session_turns', {
        p_session_id: sessionId,
        p_limit: limit,
      })
      setTurns(Array.isArray(data) ? data : [])
      setError(null)
    } catch (fetchError) {
      setError(fetchError)
    } finally {
      setLoading(false)
    }
  }, [sessionId, limit])

  useEffect(() => {
    fetchTurns()
  }, [fetchTurns])

  useEffect(() => {
    if (!sessionId) return undefined
    const unsubscribe = subscribeToSession(sessionId, (event) => {
      if (event.type === 'turn') {
        fetchTurns()
      }
    })
    return unsubscribe
  }, [sessionId, fetchTurns])

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2>세션 턴 로그</h2>
        <div className={styles.headerActions}>
          {loading ? <span className={styles.badge}>동기화 중...</span> : null}
          <button onClick={fetchTurns}>새로고침</button>
        </div>
      </div>
      {error ? <p className={styles.error}>오류: {error.message || String(error)}</p> : null}
      <ol className={styles.turns}>
        {turns.map((turn) => (
          <li key={turn.id} className={turn.public ? styles.public : styles.private}>
            <div className={styles.meta}>
              <span>#{turn.idx ?? '?'} · {turn.role}</span>
              <time>{turn.created_at ? new Date(turn.created_at).toLocaleTimeString() : ''}</time>
            </div>
            <p>{turn.content || '(내용 없음)'}</p>
            {turn.public === false ? <small>비공개 슬롯</small> : null}
          </li>
        ))}
      </ol>
      {!turns.length && !loading ? <p className={styles.helper}>아직 턴 로그가 없습니다.</p> : null}
    </section>
  )
}
