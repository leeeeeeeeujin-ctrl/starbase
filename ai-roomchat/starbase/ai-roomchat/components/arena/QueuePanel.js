import { useCallback, useEffect, useState } from 'react'
import { ensureRpc } from '@/modules/arena/rpcClient'
import { subscribeToQueue } from '@/modules/arena/realtimeChannels'
import { persistTicket, readTicket } from '@/modules/arena/ticketStorage'
import styles from './QueuePanel.module.css'

const PAYLOAD_PLACEHOLDER = `{
  "hero_id": "...",
  "role": "support"
}`

export function QueuePanel() {
  const [ticket, setTicket] = useState(null)
  const [status, setStatus] = useState('idle')
  const [queueId, setQueueId] = useState('rank-default')
  const [payload, setPayload] = useState('')
  const [events, setEvents] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    const stored = readTicket()
    if (stored) {
      setTicket(stored)
      setStatus('joined')
      setQueueId(stored.queue_id || queueId)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToQueue(queueId, (event) => {
      setEvents((prev) => [event, ...prev].slice(0, 12))
    })
    return unsubscribe
  }, [queueId])

  const joinQueue = useCallback(async () => {
    setStatus('joining')
    try {
      const payloadJson = payload ? JSON.parse(payload) : {}
      const data = await ensureRpc('join_rank_queue', {
        queue_id: queueId,
        payload: payloadJson,
      })
      setTicket(data)
      persistTicket(data)
      setStatus('joined')
      setError(null)
    } catch (joinError) {
      console.error('join queue failed', joinError)
      setError(joinError)
      setStatus('error')
    }
  }, [queueId, payload])

  const leaveQueue = useCallback(() => {
    setTicket(null)
    persistTicket(null)
    setStatus('idle')
    setError(null)
  }, [])

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2>매칭 큐</h2>
        <p>Supabase RPC로 대기열에 참가하고 Realtime으로 상태를 감시합니다.</p>
      </header>
      <div className={styles.formRow}>
        <label htmlFor="queueId">큐 ID</label>
        <input
          id="queueId"
          value={queueId}
          onChange={(event) => setQueueId(event.target.value)}
        />
      </div>
      <div className={styles.formRow}>
        <label htmlFor="payload">추가 정보(JSON)</label>
        <textarea
          id="payload"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          placeholder={PAYLOAD_PLACEHOLDER}
        />
      </div>
      <div className={styles.actions}>
        <button onClick={joinQueue} disabled={status === 'joining'}>
          {status === 'joining' ? '참가 중...' : '큐 참가'}
        </button>
        <button onClick={leaveQueue} disabled={!ticket}>나가기</button>
        {ticket ? <span className={styles.ticket}>티켓: {ticket?.id}</span> : null}
      </div>
      {error ? <p className={styles.error}>오류: {error.message || String(error)}</p> : null}
      <div className={styles.eventLog}>
        <h3>최근 이벤트</h3>
        <ul>
          {events.map((event, index) => (
            <li key={index}>
              <code>{event.payload?.new ? JSON.stringify(event.payload.new) : '변경 없음'}</code>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
