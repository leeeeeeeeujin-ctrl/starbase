'use client'

import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'

import { readActiveSession, subscribeActiveSession } from '@/lib/rank/activeSessionStorage'

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
  const [session, setSession] = useState(() => readActiveSession())

  useEffect(() => {
    return subscribeActiveSession((payload) => {
      setSession(payload || null)
    })
  }, [])

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

  if (!active || hidden) return null

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
