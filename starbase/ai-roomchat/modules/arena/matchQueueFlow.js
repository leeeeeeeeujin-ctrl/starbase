import { subscribeToQueue } from '@/modules/arena/realtimeChannels'

// 참고: reference_data/liquid-main의 matchmaking queue watcher 구현 패턴을 기반으로
// 현재 프로젝트 구조에 맞게 최소한의 리액트 훅 프렌들리 API로 재구성했습니다.

function extractRow(change) {
  if (!change) return null
  if (change.new) return change.new
  if (change.record) return change.record
  if (change.old) return change.old
  return null
}

export function createQueueRealtimeWatcher({ queueId, ticketId, onTicket }) {
  let unsubscribe = null
  const expectedId = ticketId != null ? String(ticketId) : null

  const handler = (event) => {
    const row = extractRow(event?.payload)
    if (!row) return

    const rowId = row.id != null ? String(row.id) : row.ticket_id != null ? String(row.ticket_id) : null
    if (expectedId && rowId && rowId !== expectedId) {
      return
    }

    onTicket?.(row)
  }

  return {
    start() {
      if (!queueId) return
      unsubscribe = subscribeToQueue(queueId, handler)
    },
    stop() {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    },
  }
}

export default createQueueRealtimeWatcher
