'use client'

import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'

import {
  clearActiveSessionRecord,
  readActiveSession,
  subscribeActiveSession,
} from '@/lib/rank/activeSessionStorage'
import { withTable } from '@/lib/supabaseTables'
import { supabase } from '@/lib/supabase'
import { fetchLatestSessionRow } from '@/modules/rank/matchRealtimeSync'

const styles = {
  root: {
    position: 'fixed',
    top: '50%',
    right: 18,
    transform: 'translateY(-50%)',
    zIndex: 70,
    pointerEvents: 'none',
    maxWidth: 280,
  },
  card: {
    pointerEvents: 'auto',
    background: 'rgba(15,23,42,0.85)',
    border: '1px solid rgba(59,130,246,0.35)',
    borderRadius: 16,
    padding: '16px 18px',
    boxShadow: '0 24px 48px -32px rgba(15,23,42,0.9)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    color: '#e2e8f0',
  },
  title: {
    fontSize: 13,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#38bdf8',
    fontWeight: 700,
  },
  gameName: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.2,
    color: '#f8fafc',
  },
  summary: {
    fontSize: 13,
    color: '#cbd5f5',
    lineHeight: 1.4,
  },
  actorRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  actorBadge: {
    padding: '6px 10px',
    borderRadius: 999,
    background: 'rgba(59,130,246,0.25)',
    color: '#dbeafe',
    fontSize: 12,
    fontWeight: 600,
  },
  button: {
    appearance: 'none',
    border: 'none',
    borderRadius: 12,
    padding: '12px 16px',
    background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
    color: '#0f172a',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'center',
  },
}

const DISQUALIFYING_STATUSES = new Set([
  'out',
  'removed',
  'kicked',
  'defeated',
  'retired',
  'eliminated',
  'dead',
  'lost',
  'banned',
  'timeout',
  'timed_out',
  'expired',
  'disconnected',
])

function normaliseStatus(value) {
  if (!value || typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

function formatSummary(session) {
  if (!session) return ''
  const parts = []
  if (Number.isFinite(session.turn) && session.turn > 0) {
    parts.push(`턴 ${session.turn}`)
  }
  if (Array.isArray(session.actorNames) && session.actorNames.length) {
    parts.push(`${session.actorNames.slice(0, 3).join(', ')} 진행 중`)
  }
  return parts.join(' · ')
}

export default function ActiveMatchOverlay() {
  const router = useRouter()
  const { asPath } = router
  // Initialise from storage immediately so first render can show overlay without waiting for effects
  const [session, setSession] = useState(() => readActiveSession())
  const [forceHide, setForceHide] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    return subscribeActiveSession((payload) => {
      setSession(payload || null)
    })
  }, [])

  useEffect(() => {
    setForceHide(false)
  }, [session?.gameId, session?.sessionId])

  const active = useMemo(() => {
    if (!session) return null
    if (session.status && session.status !== 'active') return null
    if (session.defeated) return null
    if (!session.href) return null
    return session
  }, [session])

  const hidden = useMemo(() => {
    if (!active) return true
    const currentPath = asPath || ''
    if (!currentPath) return false
    return currentPath.startsWith(active.href)
  }, [active, asPath])

  useEffect(() => {
    if (!active) return undefined

    const handleFocus = () => {
      setRefreshToken((token) => token + 1)
    }

    const handleVisibility = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'visible') {
        setRefreshToken((token) => token + 1)
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [active?.gameId, active?.sessionId])

  useEffect(() => {
    if (!active) return undefined

    let cancelled = false

    const validateSession = async () => {
      const gameId = active.gameId
      const sessionId = active.sessionId

      if (!gameId) {
        if (!cancelled) {
          setForceHide(true)
          clearActiveSessionRecord()
        }
        return
      }

      const { data: authData, error: authError } = await supabase.auth.getUser()
      const viewer = authData?.user || null

      if (authError) {
        console.warn('활성 세션 상태 확인 중 사용자 정보를 가져오지 못했습니다:', authError)
        return
      }

      if (!viewer?.id) {
        if (!cancelled) {
          setForceHide(true)
          clearActiveSessionRecord(gameId)
        }
        return
      }

      let invalid = false

      const { data: gameRow, error: gameError } = await withTable(
        supabase,
        'rank_games',
        (table) =>
          supabase
            .from(table)
            .select('id')
            .eq('id', gameId)
            .maybeSingle(),
      )

      if (gameError) {
        console.warn('활성 세션 확인 중 게임 정보를 불러오지 못했습니다:', gameError)
        return
      }

      if (!gameRow?.id) {
        invalid = true
      }

      let sessionRow = null
      if (!invalid) {
        try {
          sessionRow = await fetchLatestSessionRow(supabase, gameId, { ownerId: viewer.id })
        } catch (error) {
          console.warn('활성 세션 확인 중 세션 정보를 불러오지 못했습니다:', error)
          return
        }

        if (!sessionRow?.id) {
          invalid = true
        } else if (sessionId && sessionRow.id !== sessionId) {
          // 사용자가 최신 세션이 아닌 레코드를 보고 있다면 덮어씁니다.
          invalid = false
        }

        if (sessionRow && sessionRow.status && sessionRow.status !== 'active') {
          invalid = true
        }
      }

      if (invalid) {
        if (!cancelled) {
          setForceHide(true)
          clearActiveSessionRecord(gameId)
        }
        return
      }

      const { data: participantRow, error: participantError } = await withTable(
        supabase,
        'rank_participants',
        (table) =>
          supabase
            .from(table)
            .select('id, status, hero_id')
            .eq('game_id', gameId)
            .eq('owner_id', viewer.id)
            .maybeSingle(),
      )

      if (participantError) {
        console.warn('활성 세션 확인 중 참가자 정보를 불러오지 못했습니다:', participantError)
        return
      }

      const participant = participantRow || null

      if (!participant?.id) {
        invalid = true
      } else {
        const status = normaliseStatus(participant.status)
        if (participant.hero_id == null || DISQUALIFYING_STATUSES.has(status)) {
          invalid = true
        }
      }

      if (invalid && !cancelled) {
        setForceHide(true)
        clearActiveSessionRecord(gameId)
      }
    }

    validateSession()

    return () => {
      cancelled = true
    }
  }, [active, refreshToken])

  if (!active || hidden || forceHide) return null

  const summary = formatSummary(active)

  const handleReturn = () => {
    router.push(active.href)
  }

  return (
    <div style={styles.root}>
      <aside style={styles.card}>
        <span style={styles.title}>진행 중</span>
        <strong style={styles.gameName}>{active.gameName || '랭크 게임'}</strong>
        {summary ? <p style={styles.summary}>{summary}</p> : null}
        {Array.isArray(active.actorNames) && active.actorNames.length ? (
          <div style={styles.actorRow}>
            {active.actorNames.slice(0, 4).map((name) => (
              <span key={name} style={styles.actorBadge}>
                {name}
              </span>
            ))}
          </div>
        ) : null}
        <button type="button" style={styles.button} onClick={handleReturn}>
          진행 중인 게임으로 돌아가기
        </button>
      </aside>
    </div>
  )
}
