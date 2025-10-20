import { useCallback, useEffect, useMemo, useState } from 'react'
import { ensureRpc } from '@/modules/arena/rpcClient'
import { subscribeToQueue } from '@/modules/arena/realtimeChannels'
import { readTicket } from '@/modules/arena/ticketStorage'
import styles from './ReadyVotePanel.module.css'

const READY_WINDOW_MS = 15000

export function ReadyVotePanel() {
  const [ticket, setTicket] = useState(null)
  const [readyState, setReadyState] = useState('idle')
  const [countdownEndsAt, setCountdown] = useState(null)
  const [seatMap, setSeatMap] = useState([])
  const [error, setError] = useState(null)
  const [evictedOwnerIds, setEvictedOwnerIds] = useState([])

  useEffect(() => {
    setTicket(readTicket())
  }, [])

  const countdownSeconds = useMemo(() => {
    if (!countdownEndsAt) return null
    const diff = countdownEndsAt - Date.now()
    return diff > 0 ? Math.ceil(diff / 1000) : 0
  }, [countdownEndsAt])

  useEffect(() => {
    if (!ticket?.queue_id) return undefined
    const unsubscribe = subscribeToQueue(ticket.queue_id, (event) => {
      if (event?.payload?.new?.seat_map) {
        setSeatMap(event.payload.new.seat_map)
      }
    })
    return unsubscribe
  }, [ticket])

  const stageMatch = useCallback(async () => {
    if (!ticket?.id) return
    setReadyState('staging')
    setError(null)
    try {
      const response = await ensureRpc('stage_rank_match', {
        queue_ticket_id: ticket.id,
      })
      if (response?.ready_expires_at) {
        setCountdown(new Date(response.ready_expires_at).getTime())
      } else {
        setCountdown(Date.now() + READY_WINDOW_MS)
      }
      setSeatMap(response?.seats || [])
      setReadyState('countdown')
    } catch (stageError) {
      console.error('stage failed', stageError)
      setError(stageError)
      setReadyState('error')
    }
  }, [ticket])

  const kickUnready = useCallback(async () => {
    if (!seatMap?.length) return
    const unreadySeats = seatMap.filter((seat) => seat.ready === false)
    await Promise.all(
      unreadySeats.map(async (seat) => {
        try {
          await ensureRpc('evict_unready_participant', {
            queue_ticket_id: ticket?.id,
            seat_index: seat.index,
          })
          setEvictedOwnerIds((prev) =>
            seat.owner_id ? [...new Set([...prev, seat.owner_id])] : prev,
          )
        } catch (evictError) {
          console.error('eviction failed', evictError)
        }
      }),
    )
  }, [seatMap, ticket])

  useEffect(() => {
    if (readyState !== 'countdown' || !countdownEndsAt) return undefined
    const timer = setInterval(() => {
      if (Date.now() >= countdownEndsAt) {
        clearInterval(timer)
        kickUnready()
        setReadyState('expired')
      }
    }, 500)
    return () => clearInterval(timer)
  }, [readyState, countdownEndsAt, kickUnready])

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2>준비 투표</h2>
        <p>큐 티켓을 세션으로 승격하고 15초 내 모두 준비하면 자동으로 본게임으로 이동합니다.</p>
      </div>
      <div className={styles.status}>
        <span>상태: {readyState}</span>
        {countdownSeconds !== null ? <span>남은 시간: {countdownSeconds}s</span> : null}
        {evictedOwnerIds.length ? (
          <span>퇴장 처리: {evictedOwnerIds.length}명</span>
        ) : null}
      </div>
      <div className={styles.actions}>
        <button onClick={stageMatch} disabled={!ticket?.id || readyState === 'staging'}>
          {readyState === 'staging' ? '검증 중...' : '준비 창 시작'}
        </button>
        <button onClick={kickUnready} disabled={!seatMap.length} className={styles.danger}>
          미준비 인원 퇴장
        </button>
      </div>
      {error ? <p className={styles.error}>오류: {error.message || String(error)}</p> : null}
      <div className={styles.seats}>
        {seatMap.map((seat) => (
          <article key={seat.index} className={seat.ready ? styles.ready : styles.pending}>
            <header>
              <h4>{seat.hero_name || '미지정'}</h4>
              <span>슬롯 {seat.index + 1}</span>
            </header>
            <p>참가자: {seat.owner_id || '미정'}</p>
            <p>준비: {seat.ready ? '완료' : '대기'}</p>
          </article>
        ))}
      </div>
      {!ticket ? <p className={styles.helper}>큐 티켓이 필요합니다. 먼저 큐 페이지에서 참가하세요.</p> : null}
    </section>
  )
}
