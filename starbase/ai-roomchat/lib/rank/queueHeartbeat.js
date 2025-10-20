const DEFAULT_HEARTBEAT_INTERVAL_MS = 8000
const DEFAULT_STALE_THRESHOLD_MS = 25000

function parseTimestamp(value) {
  if (!value) return Number.NaN
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : Number.NaN
}

export const QUEUE_HEARTBEAT_INTERVAL_MS = DEFAULT_HEARTBEAT_INTERVAL_MS
export const QUEUE_STALE_THRESHOLD_MS = DEFAULT_STALE_THRESHOLD_MS

export function isQueueHeartbeatStale(
  entry,
  { nowMs = Date.now(), staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS } = {},
) {
  if (!entry) return false
  const threshold = Number(staleThresholdMs)
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return false
  }

  const reference =
    parseTimestamp(entry.updated_at || entry.updatedAt) || parseTimestamp(entry.joined_at || entry.joinedAt)

  if (!Number.isFinite(reference)) {
    return false
  }

  return nowMs - reference > threshold
}

export function partitionQueueByHeartbeat(
  queueEntries = [],
  { nowMs = Date.now(), staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS } = {},
) {
  const freshEntries = []
  const staleEntries = []

  queueEntries.forEach((entry) => {
    if (!entry) return
    if (isQueueHeartbeatStale(entry, { nowMs, staleThresholdMs })) {
      staleEntries.push(entry)
    } else {
      freshEntries.push(entry)
    }
  })

  return { freshEntries, staleEntries }
}
