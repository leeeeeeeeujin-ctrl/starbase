import { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'

import styles from '@/styles/AsyncStandinDebug.module.css'
import {
  buildDebugSeatExample,
  parseSeatRequestsInput,
  sanitizeSeatRequests,
  toSeatRequestsPayload,
} from '@/lib/rank/asyncStandinUtils'
import { addDebugEvent, clearDebugEvents, subscribeDebugEvents } from '@/lib/debugCollector'

const DEFAULT_HINT = `좌석 정보를 "slotIndex, 역할, 점수, 레이팅" 형태로 줄바꿈해 입력하거나 JSON 배열로 붙여넣으면 됩니다.`

function toJson(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return ''
  }
}

function formatError(error) {
  if (!error) return null
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object') {
    const { error: code, hint, message, details } = error
    return [message, code, hint, details].filter(Boolean).join(' \u2014 ')
  }
  return 'unknown_error'
}

export default function AsyncStandinDebugPage() {
  const [gameId, setGameId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [seatsInput, setSeatsInput] = useState('')
  const [excludeOwnerIds, setExcludeOwnerIds] = useState('')
  const [limit, setLimit] = useState('6')
  const [hint, setHint] = useState(DEFAULT_HINT)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [events, setEvents] = useState([])

  useEffect(() => {
    return subscribeDebugEvents((snapshot) => {
      setEvents(snapshot.slice(-100))
    })
  }, [])

  const parsedSeats = useMemo(() => {
    if (!seatsInput.trim()) return []
    return parseSeatRequestsInput(seatsInput)
  }, [seatsInput])

  const excludeList = useMemo(() => {
    return excludeOwnerIds
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }, [excludeOwnerIds])

  const resolvedSeats = useMemo(() => {
    if (parsedSeats.length) return parsedSeats
    return sanitizeSeatRequests(buildDebugSeatExample())
  }, [parsedSeats])

  const handlePrefillExample = useCallback(() => {
    const example = buildDebugSeatExample()
    setSeatsInput(JSON.stringify(example, null, 2))
    setHint('예시 좌석 구성을 불러왔습니다. 필요에 맞게 수정하세요.')
  }, [])

  const handleClearEvents = useCallback(() => {
    clearDebugEvents()
  }, [])

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      setPending(true)
      setError(null)

      const payload = {
        game_id: gameId.trim() || null,
        room_id: roomId.trim() || null,
        limit: Number(limit) || 6,
        seat_requests: toSeatRequestsPayload(resolvedSeats),
        exclude_owner_ids: excludeList,
      }

      if (!payload.game_id) {
        setPending(false)
        setError('gameId를 입력하세요.')
        return
      }

      if (!payload.seat_requests.length) {
        setPending(false)
        setError('좌석 구성이 비어 있습니다. 예시를 불러오거나 직접 입력하세요.')
        return
      }

      try {
        const response = await fetch('/api/rank/async-standins', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          setError(formatError(data) || 'async_standins_failed')
          setResult(null)
          addDebugEvent({
            level: 'error',
            source: 'async-standin-debug',
            message: 'async stand-in RPC 호출 실패',
            payload: data,
          })
          return
        }

        setResult({
          payload,
          response: data,
          receivedAt: new Date().toISOString(),
        })
        setHint(
          `총 ${data?.queue?.length || 0}명의 후보와 ${
            data?.assignments?.length || 0
          }개의 좌석 할당을 수신했습니다.`
        )
        addDebugEvent({
          level: 'info',
          source: 'async-standin-debug',
          message: 'async stand-in RPC 호출 성공',
          payload: { payload, data },
        })
      } catch (fetchError) {
        setError(fetchError?.message || 'async_standins_request_failed')
      } finally {
        setPending(false)
      }
    },
    [excludeList, gameId, limit, resolvedSeats, roomId]
  )

  return (
    <div className={styles.container}>
      <Head>
        <title>Async Stand-in Debugger</title>
      </Head>

      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Async Stand-in Debugger</h1>
          <p className={styles.subtitle}>
            비실시간 자동 충원 큐를 실시간으로 점검하고 RPC 응답을 확인하는 도구입니다.
          </p>
        </header>

        <section className={styles.panel}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.fieldGroup}>
              <label htmlFor="game-id">Game ID</label>
              <input
                id="game-id"
                type="text"
                value={gameId}
                onChange={(event) => setGameId(event.target.value)}
                placeholder="게임 UUID"
                className={styles.input}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="room-id">Room ID (선택)</label>
              <input
                id="room-id"
                type="text"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                placeholder="방 UUID"
                className={styles.input}
              />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.fieldGroup}>
                <label htmlFor="limit">최대 후보 수</label>
                <input
                  id="limit"
                  type="number"
                  min="1"
                  max="20"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="exclude-owner-ids">제외할 ownerId 목록 (콤마 구분)</label>
                <input
                  id="exclude-owner-ids"
                  type="text"
                  value={excludeOwnerIds}
                  onChange={(event) => setExcludeOwnerIds(event.target.value)}
                  placeholder="ownerId1, ownerId2"
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="seats">좌석 구성</label>
              <textarea
                id="seats"
                value={seatsInput}
                onChange={(event) => setSeatsInput(event.target.value)}
                placeholder="0, 탱커, 1500, 2000\n1, 딜러, 1520, 1980"
                className={styles.textarea}
                rows={8}
              />
              <div className={styles.hintRow}>
                <span className={styles.hint}>{hint}</span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handlePrefillExample}
                >
                  예시 불러오기
                </button>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button type="submit" className={styles.primaryButton} disabled={pending}>
                {pending ? '요청 중…' : 'RPC 호출하기'}
              </button>
            </div>
          </form>
        </section>

        {result && (
          <section className={styles.panel}>
            <h2>응답 상세</h2>
            <div className={styles.resultGrid}>
              <div>
                <h3>요청 페이로드</h3>
                <pre className={styles.codeBlock}>{toJson(result.payload)}</pre>
              </div>
              <div>
                <h3>RPC 응답</h3>
                <pre className={styles.codeBlock}>{toJson(result.response)}</pre>
              </div>
            </div>
            <p className={styles.timestamp}>수신 시각: {result.receivedAt}</p>
          </section>
        )}

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>실시간 디버그 이벤트</h2>
            <button type="button" onClick={handleClearEvents} className={styles.secondaryButton}>
              로그 비우기
            </button>
          </div>
          {events.length === 0 ? (
            <p className={styles.empty}>현재 수집된 디버그 이벤트가 없습니다.</p>
          ) : (
            <ul className={styles.eventList}>
              {events
                .slice()
                .reverse()
                .map((event) => (
                  <li key={event.id} className={styles.eventItem}>
                    <div className={styles.eventHeader}>
                      <span className={styles.eventLevel}>{event.level}</span>
                      <span className={styles.eventSource}>{event.source}</span>
                      <span className={styles.eventTimestamp}>{event.timestamp}</span>
                    </div>
                    {event.message && <p className={styles.eventMessage}>{event.message}</p>}
                    {event.payload && (
                      <pre className={styles.eventPayload}>{toJson(event.payload)}</pre>
                    )}
                    {event.details && (
                      <pre className={styles.eventPayload}>{toJson(event.details)}</pre>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
