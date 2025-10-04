import { mergeTimelineEvents } from '../../../lib/rank/timelineEvents'
import { buildTimelineLogEntry } from './timelineLogBuilder'

export function initializeRealtimeEvents(snapshot) {
  return mergeTimelineEvents([], Array.isArray(snapshot?.events) ? snapshot.events : [])
}

export function appendSnapshotEvents(previous, snapshot) {
  const events = Array.isArray(snapshot?.events) ? snapshot.events : []
  return mergeTimelineEvents(previous, events)
}

export function buildLogEntriesFromEvents(
  events,
  { ownerDisplayMap, defaultTurn, defaultMode },
) {
  if (!Array.isArray(events) || events.length === 0) {
    return []
  }
  return events
    .map((event) =>
      buildTimelineLogEntry(event, {
        ownerDisplayMap,
        defaultTurn,
        defaultMode,
      }),
    )
    .filter(Boolean)
}
