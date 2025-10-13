'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import styles from './SessionChatPanel.module.css'
import { supabase } from '@/lib/supabase'
import { withTable } from '@/lib/supabaseTables'

const TURN_LIMIT = 120
const POLL_INTERVAL_MS = 7000

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeSlotList(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (Array.isArray(candidate)) {
      const list = candidate
        .map((value) => toNumber(value))
        .filter((value) => value !== null && value >= 0)
      if (list.length) {
        return Array.from(new Set(list))
      }
    }
    const numeric = toNumber(candidate)
    if (numeric !== null && numeric >= 0) {
      return [numeric]
    }
  }
  return []
}

function coalesceSpeakerName(summaryPayload, metadata, fallbackRole) {
  const candidates = [
    summaryPayload?.extra?.speaker?.displayName,
    summaryPayload?.extra?.speaker?.name,
    summaryPayload?.speaker?.displayName,
    summaryPayload?.speaker?.name,
    metadata?.speaker?.displayName,
    metadata?.speaker?.name,
    metadata?.speaker_name,
    summaryPayload?.speaker_name,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  if (fallbackRole === 'assistant') {
    return 'AI'
  }

  if (fallbackRole === 'user') {
    return '플레이어'
  }

  if (fallbackRole === 'system') {
    return '시스템'
  }

  return fallbackRole || '발화자'
}

function coalesceSpeakerRole(summaryPayload, metadata, fallbackRole) {
  const candidates = [
    summaryPayload?.extra?.speaker?.role,
    summaryPayload?.speaker?.role,
    metadata?.speaker?.role,
    metadata?.speaker_role,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return fallbackRole || 'assistant'
}

function extractSlotIndex(summaryPayload, metadata) {
  const candidates = [
    summaryPayload?.extra?.speaker?.slotIndex,
    summaryPayload?.extra?.speaker?.slot_index,
    summaryPayload?.extra?.slotIndex,
    summaryPayload?.extra?.slot_index,
    summaryPayload?.speaker?.slotIndex,
    summaryPayload?.speaker?.slot_index,
    metadata?.speaker?.slotIndex,
    metadata?.speaker?.slot_index,
    metadata?.slotIndex,
    metadata?.slot_index,
  ]

  for (const candidate of candidates) {
    const parsed = toNumber(candidate)
    if (parsed !== null && parsed >= 0) {
      return parsed
    }
  }

  return null
}

function extractOwnerId(summaryPayload, metadata) {
  const candidates = [
    summaryPayload?.extra?.speaker?.ownerId,
    summaryPayload?.extra?.speaker?.owner_id,
    summaryPayload?.speaker?.ownerId,
    summaryPayload?.speaker?.owner_id,
    metadata?.speaker?.ownerId,
    metadata?.speaker?.owner_id,
    metadata?.ownerId,
    metadata?.owner_id,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

function normalizeTurnRow(row, index) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const summaryPayload =
    row.summary_payload && typeof row.summary_payload === 'object'
      ? row.summary_payload
      : row.summaryPayload && typeof row.summaryPayload === 'object'
        ? row.summaryPayload
        : null

  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : null

  const role = typeof row.role === 'string' && row.role.trim() ? row.role.trim() : 'assistant'

  const speakerName = coalesceSpeakerName(summaryPayload, metadata, role)
  const speakerRole = coalesceSpeakerRole(summaryPayload, metadata, role)
  const slotIndex = extractSlotIndex(summaryPayload, metadata)
  const ownerId = extractOwnerId(summaryPayload, metadata)
  const hiddenSlotIndexes = normalizeSlotList(
    metadata?.hiddenSlotIndexes,
    metadata?.hidden_slot_indexes,
    metadata?.hiddenSlots,
    metadata?.hidden_slots,
    summaryPayload?.extra?.hiddenSlotIndexes,
    summaryPayload?.extra?.hidden_slot_indexes,
    summaryPayload?.extra?.hiddenSlots,
    summaryPayload?.extra?.hidden_slots,
  )
  const visibleSlotIndexes = normalizeSlotList(
    metadata?.visibleSlotIndexes,
    metadata?.visible_slot_indexes,
    metadata?.visibleSlots,
    metadata?.visible_slots,
    summaryPayload?.extra?.visibleSlotIndexes,
    summaryPayload?.extra?.visible_slot_indexes,
    summaryPayload?.extra?.visibleSlots,
    summaryPayload?.extra?.visible_slots,
  )

  const createdAt = row.created_at || row.createdAt || null

  return {
    id:
      row.id != null
        ? String(row.id)
        : row.turn_id != null
          ? String(row.turn_id)
          : `turn-${index}`,
    idx: toNumber(row.idx) ?? index,
    role,
    content: typeof row.content === 'string' ? row.content : '',
    createdAt,
    public: row.public !== false,
    isVisible: row.is_visible !== false,
    summaryPayload,
    metadata,
    speakerName,
    speakerRole,
    slotIndex,
    ownerId,
    hiddenSlotIndexes,
    visibleSlotIndexes,
  }
}

function normalizeTurnList(rows = []) {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row, index) => normalizeTurnRow(row, index))
    .filter((entry) => entry && typeof entry.content === 'string' && entry.content.trim())
}

function isVisibleToViewer(entry, viewerSlotIndex) {
  if (!entry) return false
  if (entry.public === false) return false
  if (entry.isVisible === false) return false
  if (viewerSlotIndex == null) return true
  if (entry.hiddenSlotIndexes.includes(viewerSlotIndex)) {
    return false
  }
  if (entry.visibleSlotIndexes.length > 0) {
    return entry.visibleSlotIndexes.includes(viewerSlotIndex)
  }
  return true
}

function mergeTurns(primary, secondary) {
  const directory = new Map()
  primary.forEach((entry) => {
    directory.set(entry.id, entry)
  })
  secondary.forEach((entry) => {
    directory.set(entry.id, entry)
  })
  return Array.from(directory.values()).sort((a, b) => {
    const idxDiff = (a.idx ?? 0) - (b.idx ?? 0)
    if (idxDiff !== 0) return idxDiff
    return (a.createdAt || '').localeCompare(b.createdAt || '')
  })
}

function extractSpeakerColor(entry) {
  if (!entry) return '#0f172a'
  if (entry.speakerRole === 'assistant') {
    return '#2563eb'
  }
  if (entry.speakerRole === 'system') {
    return '#0f172a'
  }
  return '#1e3a8a'
}

function detectMissingRpc(error) {
  if (!error) return false
  const code = String(error.code || '').toUpperCase()
  if (code === '42883') return true
  const merged = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return merged.includes('function') && merged.includes('fetch_rank_session_turns')
}

async function fetchTurnsViaRpc(sessionId, { limit = TURN_LIMIT } = {}) {
  const { data, error } = await supabase.rpc('fetch_rank_session_turns', {
    p_session_id: sessionId,
    p_limit: limit,
  })
  return { data, error }
}

async function fetchTurnsViaTable(sessionId, { limit = TURN_LIMIT } = {}) {
  return withTable(supabase, 'rank_turns', (table) =>
    supabase
      .from(table)
      .select('id, session_id, idx, role, content, public, is_visible, summary_payload, metadata, created_at')
      .eq('session_id', sessionId)
      .order('idx', { ascending: true })
      .limit(limit),
  )
}

export default function SessionChatPanel({
  sessionId,
  sessionHistory,
  viewerSlotIndex,
  participants,
  title = '세션 공용 채팅',
  pollInterval = POLL_INTERVAL_MS,
}) {
  const [entries, setEntries] = useState(() => normalizeTurnList(sessionHistory?.turns))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const pollRef = useRef(null)

  const participantNames = useMemo(() => {
    const directory = new Map()
    if (Array.isArray(participants)) {
      participants.forEach((participant, index) => {
        if (!participant || directory.has(index)) return
        const heroName =
          (participant.hero && participant.hero.name) ||
          participant.hero_name ||
          participant.heroName ||
          participant.name ||
          ''
        const role = participant.role || participant.role_name || ''
        directory.set(index, {
          heroName: heroName || `참가자 ${index + 1}`,
          role: role || '',
        })
      })
    }
    return directory
  }, [participants])

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => isVisibleToViewer(entry, viewerSlotIndex))
  }, [entries, viewerSlotIndex])

  const fetchTurns = useCallback(
    async (source = 'poll') => {
      if (!sessionId) {
        setEntries([])
        setError(null)
        return
      }

      if (source === 'manual') {
        setLoading(true)
      }

      try {
        let payload = await fetchTurnsViaRpc(sessionId, { limit: TURN_LIMIT })
        if (payload.error && detectMissingRpc(payload.error)) {
          payload = await fetchTurnsViaTable(sessionId, { limit: TURN_LIMIT })
        }

        if (payload.error) {
          throw payload.error
        }

        const list = Array.isArray(payload.data) ? payload.data : []
        const normalized = normalizeTurnList(list)
        setEntries((prev) => mergeTurns(prev, normalized))
        setError(null)
      } catch (fetchError) {
        console.error('[SessionChatPanel] 세션 채팅을 불러오지 못했습니다.', fetchError)
        setError(fetchError)
      } finally {
        if (source === 'manual') {
          setLoading(false)
        }
      }
    },
    [sessionId],
  )

  useEffect(() => {
    setEntries(normalizeTurnList(sessionHistory?.turns))
  }, [sessionHistory])

  useEffect(() => {
    if (!sessionId) {
      setEntries([])
      setError(null)
      return undefined
    }

    fetchTurns('manual')

    if (!pollInterval || pollInterval <= 0) {
      return undefined
    }

    pollRef.current = setInterval(() => {
      fetchTurns('poll')
    }, pollInterval)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [sessionId, pollInterval, fetchTurns])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [visibleEntries])

  const handleManualRefresh = useCallback(() => {
    fetchTurns('manual')
  }, [fetchTurns])

  if (!sessionId) {
    return null
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>AI 응답과 플레이어 발화를 세션 단위로 묶어 모두에게 공유합니다.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={handleManualRefresh} className={styles.refreshButton} disabled={loading}>
            {loading ? '동기화 중…' : '새로고침'}
          </button>
        </div>
      </header>
      {error ? (
        <div className={styles.errorBanner}>
          <strong>세션 채팅을 불러오지 못했습니다.</strong>
          <span className={styles.errorDetail}>{error.message || '잠시 후 다시 시도해 주세요.'}</span>
        </div>
      ) : null}
      <div ref={scrollRef} className={styles.messageScroll}>
        {visibleEntries.length === 0 ? (
          <div className={styles.emptyState}>공유된 발화가 없습니다. 턴이 진행되면 자동으로 채워집니다.</div>
        ) : (
          <ul className={styles.messageList}>
            {visibleEntries.map((entry) => {
              const participantMeta =
                entry.slotIndex != null && participantNames.has(entry.slotIndex)
                  ? participantNames.get(entry.slotIndex)
                  : null
              const displayName = participantMeta?.heroName || entry.speakerName
              const roleLabel = participantMeta?.role || entry.speakerRole
              const timestamp = entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : null
              const accentColor = extractSpeakerColor(entry)
              return (
                <li key={entry.id} className={styles.messageItem}>
                  <div className={styles.metaRow}>
                    <span className={styles.speaker} style={{ color: accentColor }}>
                      {displayName}
                    </span>
                    {roleLabel ? <span className={styles.roleBadge}>{roleLabel}</span> : null}
                    {timestamp ? <span className={styles.timestamp}>{timestamp}</span> : null}
                  </div>
                  <p className={styles.body}>{entry.content}</p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

