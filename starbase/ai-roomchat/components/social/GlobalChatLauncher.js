'use client'

import { useState, useMemo } from 'react'

import ChatOverlay from '@/components/social/ChatOverlay'

const launcherStyles = {
  wrapper: {
    position: 'fixed',
    top: 24,
    right: 24,
    zIndex: 1400,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
  },
  button: (open) => ({
    width: 56,
    height: 56,
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: open ? 'rgba(59, 130, 246, 0.9)' : 'rgba(15, 23, 42, 0.82)',
    color: open ? '#f8fafc' : '#cbd5f5',
    boxShadow: '0 24px 80px -48px rgba(15, 23, 42, 0.85)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 700,
    transition: 'all 0.2s ease',
    position: 'relative',
  }),
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    padding: '0 6px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.9)',
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}

export default function GlobalChatLauncher() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)

  const badge = useMemo(() => {
    if (!unread) return null
    if (unread > 99) return '99+'
    return String(unread)
  }, [unread])

  return (
    <>
      <div style={launcherStyles.wrapper}>
        <button
          type="button"
          aria-label="채팅 열기"
          onClick={() => setOpen(true)}
          style={launcherStyles.button(open)}
        >
          💬
          {badge ? <span style={launcherStyles.badge}>{badge}</span> : null}
        </button>
      </div>
      <ChatOverlay
        open={open}
        onClose={() => setOpen(false)}
        onUnreadChange={setUnread}
      />
    </>
  )
}
