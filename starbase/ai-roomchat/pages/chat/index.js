import Head from 'next/head'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchRecentMessages, insertMessage, MESSAGE_LIMIT } from '@/lib/chat/messages'
import { subscribeToBroadcastTopic } from '@/lib/realtime/broadcast'

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #020617 0%, #0f172a 80%, #111827 100%)',
    color: '#e2e8f0',
    padding: '48px 16px 120px',
    boxSizing: 'border-box',
  },
  container: {
    maxWidth: 960,
    margin: '0 auto',
    display: 'grid',
    gap: 28,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: 34,
    fontWeight: 800,
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: 15,
    color: '#94a3b8',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: 999,
    background: 'rgba(15, 23, 42, 0.65)',
    border: '1px solid rgba(148, 163, 184, 0.32)',
    color: '#cbd5f5',
    textDecoration: 'none',
    fontWeight: 600,
  },
  chatShell: {
    display: 'grid',
    gap: 18,
    padding: '24px 26px',
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    background: 'rgba(15, 23, 42, 0.82)',
    boxShadow: '0 24px 64px -40px rgba(15, 23, 42, 0.8)',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  statusBadge: (status) => ({
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    background:
      status === 'SUBSCRIBED'
        ? 'rgba(34, 197, 94, 0.18)'
        : status === 'CHANNEL_ERROR'
        ? 'rgba(248, 113, 113, 0.16)'
        : 'rgba(59, 130, 246, 0.16)',
    border:
      status === 'SUBSCRIBED'
        ? '1px solid rgba(34, 197, 94, 0.32)'
        : status === 'CHANNEL_ERROR'
        ? '1px solid rgba(248, 113, 113, 0.32)'
        : '1px solid rgba(59, 130, 246, 0.32)',
    color:
      status === 'SUBSCRIBED'
        ? '#bbf7d0'
        : status === 'CHANNEL_ERROR'
        ? '#fecaca'
        : '#bfdbfe',
  }),
  messageList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 14,
    maxHeight: '52vh',
    overflowY: 'auto',
    paddingRight: 6,
  },
  messageItem: {
    display: 'grid',
    gap: 6,
    padding: '14px 16px',
    borderRadius: 16,
    background: 'rgba(15, 23, 42, 0.66)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
  },
  messageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    fontSize: 13,
    color: '#cbd5f5',
  },
  messageBody: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.55,
    color: '#f8fafc',
    wordBreak: 'break-word',
  },
  messageMeta: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    fontSize: 12,
    color: '#94a3b8',
  },
  inputForm: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  inputField: {
    flex: '1 1 260px',
    minWidth: 220,
    padding: '12px 14px',
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.32)',
    background: 'rgba(15, 23, 42, 0.65)',
    color: '#f8fafc',
    fontSize: 14,
  },
  submitButton: (disabled) => ({
    padding: '12px 20px',
    borderRadius: 999,
    border: 'none',
    fontWeight: 700,
    fontSize: 14,
    background: disabled ? 'rgba(30, 41, 59, 0.45)' : 'rgba(59, 130, 246, 0.82)',
    color: disabled ? '#64748b' : '#f8fafc',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  errorText: {
    margin: 0,
    color: '#f87171',
    fontSize: 13,
  },
  emptyState: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    padding: '32px 0',
  },
}

function normalizeMessage(record) {
  if (!record) return null
  return {
    id: record.id || record.message_id || null,
    text: record.text || record.metadata?.plain_text || '',
    created_at: record.created_at || record.inserted_at || record.timestamp || null,
    username: record.username || record.author || '익명',
    role: record.role || record.scope || 'global',
    scope: record.scope || 'global',
    channel_type: record.channel_type || 'lobby',
    metadata: record.metadata || {},
  }
}

function formatTimestamp(value) {
  if (!value) return '방금 전'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '방금 전'
  }
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

function mergeMessages(existing, incoming, limit = MESSAGE_LIMIT) {
  const map = new Map()
  existing.forEach((message) => {
    if (message?.id) {
      map.set(message.id, message)
    }
  })
  incoming.forEach((message) => {
    if (message?.id) {
      map.set(message.id, message)
    }
  })
  const sorted = Array.from(map.values()).sort((a, b) => {
    const left = new Date(a.created_at || 0).getTime()
    const right = new Date(b.created_at || 0).getTime()
    return left - right
  })
  return sorted.slice(-limit)
}

export default function ChatPage() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [channelStatus, setChannelStatus] = useState('SUBSCRIBING')
  const listRef = useRef(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { messages: initialMessages } = await fetchRecentMessages({ limit: 120 })
        if (!active) return
        const normalized = Array.isArray(initialMessages)
          ? initialMessages
              .map(normalizeMessage)
              .filter(Boolean)
              .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
          : []
        setMessages(normalized.slice(-MESSAGE_LIMIT))
      } catch (err) {
        if (!active) return
        console.error('[Chat] failed to load history', err)
        setError(err)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToBroadcastTopic(
      'messages:scope:global',
      (change) => {
        const { eventType, record, old } = change || {}
        if (eventType === 'INSERT') {
          const message = normalizeMessage(record)
          if (!message) return
          setMessages((prev) => mergeMessages(prev, [message]))
        } else if (eventType === 'UPDATE') {
          const message = normalizeMessage(record)
          if (!message) return
          setMessages((prev) => mergeMessages(prev, [message]))
        } else if (eventType === 'DELETE') {
          const targetId = old?.id || record?.id
          if (!targetId) return
          setMessages((prev) => prev.filter((entry) => entry.id !== targetId))
        }
      },
      {
        events: ['INSERT', 'UPDATE', 'DELETE'],
        onStatus: (status) => {
          setChannelStatus(status)
        },
      },
    )

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      const text = input.trim()
      if (!text || sending) return
      setSending(true)
      setError(null)
      try {
        await insertMessage({ text, scope: 'global' })
        setInput('')
      } catch (err) {
        console.error('[Chat] failed to send message', err)
        setError(err)
      } finally {
        setSending(false)
      }
    },
    [input, sending],
  )

  const statusLabel = useMemo(() => {
    switch (channelStatus) {
      case 'SUBSCRIBED':
        return 'realtime connected'
      case 'CHANNEL_ERROR':
        return 'channel error'
      case 'TIMED_OUT':
        return 'subscription timeout'
      default:
        return 'connecting'
    }
  }, [channelStatus])

  return (
    <>
      <Head>
        <title>공용 채팅 · Starbase</title>
      </Head>
      <main style={styles.page}>
        <div style={styles.container}>
          <header style={styles.header}>
            <div>
              <h1 style={styles.title}>공용 채팅</h1>
              <p style={styles.subtitle}>
                게임 준비와 매칭에 참여 중인 모든 사용자가 메시지를 나누는 글로벌 채널입니다.
              </p>
            </div>
            <Link href="/match" style={styles.backLink}>
              매칭 센터로 돌아가기
            </Link>
          </header>
          <section style={styles.chatShell}>
            <div style={styles.statusRow}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>실시간 스트림</h2>
              <span style={styles.statusBadge(channelStatus)}>{statusLabel}</span>
            </div>
            {error ? (
              <p style={styles.errorText}>{error.message || '채팅 내역을 불러오지 못했습니다.'}</p>
            ) : null}
            <ul ref={listRef} style={styles.messageList}>
              {loading ? (
                <li style={styles.emptyState}>메시지를 불러오는 중…</li>
              ) : messages.length ? (
                messages.map((message) => (
                  <li key={message.id || message.created_at} style={styles.messageItem}>
                    <div style={styles.messageHeader}>
                      <strong>{message.username || '익명'}</strong>
                      <span>{formatTimestamp(message.created_at)}</span>
                    </div>
                    <p style={styles.messageBody}>{message.text || '(내용 없음)'}</p>
                    <div style={styles.messageMeta}>
                      <span>scope: {message.scope || 'global'}</span>
                      <span>channel: {message.channel_type || 'lobby'}</span>
                    </div>
                  </li>
                ))
              ) : (
                <li style={styles.emptyState}>아직 메시지가 없습니다. 첫 메시지를 남겨보세요!</li>
              )}
            </ul>
            <form style={styles.inputForm} onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                style={styles.inputField}
                placeholder="공용 메시지를 입력하세요"
              />
              <button type="submit" style={styles.submitButton(sending || !input.trim())} disabled={sending || !input.trim()}>
                {sending ? '전송 중…' : '전송'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </>
  )
}
