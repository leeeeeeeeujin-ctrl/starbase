'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import SurfaceOverlay from '@/components/common/SurfaceOverlay'
import {
  createChatRoom,
  fetchChatDashboard,
  fetchChatRooms,
  joinChatRoom,
  leaveChatRoom,
} from '@/lib/chat/rooms'
import {
  fetchRecentMessages,
  getCurrentUser,
  insertMessage,
  subscribeToMessages,
} from '@/lib/chat/messages'
import { supabase } from '@/lib/supabase'

const normalizeMessageRecord = (record) => {
  if (!record || typeof record !== 'object') {
    return null
  }

  const createdAt = record.created_at || record.createdAt || null
  return {
    ...record,
    created_at: createdAt,
    hero_name: record.hero_name || record.username || '익명',
  }
}

const toChrono = (value) => {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const upsertMessageList = (current, incoming) => {
  const next = Array.isArray(current) ? [...current] : []
  const payload = Array.isArray(incoming) ? incoming : [incoming]

  for (const candidate of payload) {
    const normalized = normalizeMessageRecord(candidate)
    if (!normalized) continue
    const identifier = normalized.id || normalized.local_id || normalized.created_at
    if (!identifier) continue

    const index = next.findIndex((item) => {
      if (!item) return false
      if (item.id && normalized.id) {
        return String(item.id) === String(normalized.id)
      }
      if (item.local_id && normalized.local_id) {
        return String(item.local_id) === String(normalized.local_id)
      }
      if (item.created_at && normalized.created_at) {
        return String(item.created_at) === String(normalized.created_at)
      }
      return false
    })

    if (index >= 0) {
      next[index] = { ...next[index], ...normalized }
    } else {
      next.push(normalized)
    }
  }

  return next
    .filter(Boolean)
    .sort((a, b) => toChrono(a?.created_at) - toChrono(b?.created_at))
}

const overlayStyles = {
  frame: {
    background: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 28,
    border: '1px solid rgba(71, 85, 105, 0.45)',
    padding: 20,
    minHeight: 'min(82vh, 720px)',
    display: 'grid',
    width: '100%',
    boxSizing: 'border-box',
  },
  root: (focused) => ({
    display: 'grid',
    gridTemplateColumns: focused ? 'minmax(0, 1fr)' : '280px minmax(0, 1fr)',
    gap: focused ? 20 : 16,
    height: 'min(78vh, 680px)',
    minHeight: 520,
  }),
  sidePanel: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    background: 'rgba(12, 20, 45, 0.92)',
    borderRadius: 22,
    border: '1px solid rgba(71, 85, 105, 0.45)',
    overflow: 'hidden',
  },
  sideTabs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
    padding: '16px 16px 12px',
    background: 'rgba(15, 23, 42, 0.96)',
  },
  sideTabButton: (active) => ({
    borderRadius: 10,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.6)'
      : '1px solid rgba(71, 85, 105, 0.5)',
    background: active ? 'rgba(37, 99, 235, 0.28)' : 'rgba(15, 23, 42, 0.7)',
    color: active ? '#e0f2fe' : '#cbd5f5',
    fontSize: 12,
    fontWeight: 600,
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }),
  sideContent: {
    padding: '0 16px 18px',
    overflowY: 'auto',
    display: 'grid',
    gap: 18,
    background: 'rgba(10, 16, 35, 0.65)',
  },
  section: {
    display: 'grid',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#cbd5f5',
  },
  mutedText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  heroSelector: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroPill: (active) => ({
    borderRadius: 999,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.6)'
      : '1px solid rgba(71, 85, 105, 0.5)',
    background: active ? 'rgba(37, 99, 235, 0.2)' : 'rgba(15, 23, 42, 0.7)',
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    color: active ? '#e0f2fe' : '#cbd5f5',
    cursor: 'pointer',
  }),
  roomList: {
    display: 'grid',
    gap: 10,
  },
  roomCard: (active) => ({
    borderRadius: 16,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.55)'
      : '1px solid rgba(71, 85, 105, 0.45)',
    background: active ? 'rgba(30, 64, 175, 0.32)' : 'rgba(15, 23, 42, 0.6)',
    padding: '12px 14px',
    display: 'grid',
    gap: 6,
    cursor: 'pointer',
  }),
  cardTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionButton: (variant = 'primary', disabled = false) => {
    const palette = {
      primary: {
        background: disabled ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.85)',
        color: disabled ? '#94a3b8' : '#f8fafc',
        border: '1px solid rgba(59, 130, 246, 0.6)',
      },
      ghost: {
        background: 'rgba(15, 23, 42, 0.7)',
        color: '#cbd5f5',
        border: '1px solid rgba(71, 85, 105, 0.5)',
      },
    }
    const tone = palette[variant] || palette.primary
    return {
      borderRadius: 12,
      border: tone.border,
      padding: '9px 14px',
      fontSize: 12,
      fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: tone.background,
      color: tone.color,
      transition: 'all 0.15s ease',
    }
  },
  conversation: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',
    borderRadius: 24,
    border: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(11, 18, 40, 0.96)',
    minHeight: 0,
    overflow: 'hidden',
  },
  conversationHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(12, 20, 45, 0.98)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  headerMeta: {
    display: 'grid',
    gap: 4,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#f1f5f9',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: (variant = 'ghost', disabled = false) => {
    const palette = {
      ghost: {
        background: 'rgba(15, 23, 42, 0.7)',
        color: disabled ? '#64748b' : '#cbd5f5',
        border: '1px solid rgba(71, 85, 105, 0.5)',
      },
      primary: {
        background: 'rgba(59, 130, 246, 0.85)',
        color: '#f8fafc',
        border: '1px solid rgba(59, 130, 246, 0.6)',
      },
    }
    const tone = palette[variant] || palette.ghost
    return {
      borderRadius: 10,
      border: tone.border,
      padding: '8px 14px',
      fontSize: 12,
      fontWeight: 600,
      background: tone.background,
      color: tone.color,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.7 : 1,
    }
  },
  messageViewport: {
    overflowY: 'auto',
    padding: '18px 22px',
    display: 'grid',
    gap: 10,
    background: 'rgba(4, 10, 28, 0.4)',
  },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontSize: 13,
    minHeight: '100%',
    textAlign: 'center',
    padding: '32px 20px',
  },
  messageRow: (mine = false) => ({
    display: 'flex',
    justifyContent: mine ? 'flex-end' : 'flex-start',
    alignItems: 'flex-end',
    gap: 12,
  }),
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'rgba(15, 23, 42, 0.8)',
    color: '#bae6fd',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  messageContent: (mine = false) => ({
    display: 'grid',
    gap: 4,
    maxWidth: '85%',
    textAlign: mine ? 'right' : 'left',
  }),
  messageName: (mine = false) => ({
    fontSize: 11,
    fontWeight: 700,
    color: mine ? '#bfdbfe' : '#f8fafc',
  }),
  messageBubble: (mine = false) => ({
    borderRadius: 14,
    border: mine ? '1px solid rgba(59, 130, 246, 0.45)' : '1px solid rgba(71, 85, 105, 0.45)',
    background: mine ? 'rgba(37, 99, 235, 0.25)' : 'rgba(15, 23, 42, 0.8)',
    padding: '10px 14px',
    color: '#f8fafc',
  }),
  messageText: {
    fontSize: 13,
    lineHeight: 1.45,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  messageTimestamp: (mine = false) => ({
    fontSize: 11,
    color: 'rgba(148, 163, 184, 0.85)',
    minWidth: 56,
    textAlign: mine ? 'right' : 'left',
  }),
  composer: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 12,
    padding: '14px 20px 18px',
    borderTop: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(12, 20, 45, 0.98)',
  },
  textarea: {
    width: '100%',
    minHeight: 56,
    maxHeight: 160,
    borderRadius: 14,
    border: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(2, 6, 23, 0.6)',
    color: '#f8fafc',
    padding: '12px 14px',
    fontSize: 14,
    lineHeight: 1.45,
    resize: 'vertical',
  },
  errorText: {
    fontSize: 12,
    color: '#fca5a5',
    padding: '0 20px 14px',
  },
}

const TABS = [
  { key: 'info', label: '정보' },
  { key: 'private', label: '일반채팅' },
  { key: 'open', label: '오픈채팅' },
]

const MESSAGE_LIMIT = 60

function derivePreviewText(record) {
  if (!record) return ''
  if (record.metadata?.plain_text) return record.metadata.plain_text
  if (record.text) return record.text
  if (record.metadata?.drafty?.txt) return record.metadata.drafty.txt
  return ''
}

function extractMessageText(message) {
  if (!message) return ''
  const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : null
  if (metadata?.plain_text) {
    return String(metadata.plain_text)
  }
  if (metadata?.text) {
    return String(metadata.text)
  }
  if (metadata?.drafty?.txt) {
    return String(metadata.drafty.txt)
  }
  if (typeof message.text === 'string') {
    return message.text
  }
  return ''
}

function formatTime(value) {
  if (!value) return ''
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    return ''
  }
}

function normalizeId(value) {
  if (value === null || value === undefined) return null
  const token = String(value).trim()
  return token.length ? token.toLowerCase() : null
}

const GLOBAL_ROOM = {
  id: 'global-chat-channel',
  name: '전체 채팅',
  description: '모두가 참여하는 기본 채팅 채널입니다.',
  visibility: 'public',
  builtin: 'global',
}

export default function ChatOverlay({ open, onClose, onUnreadChange }) {
  const [activeTab, setActiveTab] = useState('info')
  const [dashboard, setDashboard] = useState(null)
  const [rooms, setRooms] = useState({ joined: [], available: [] })
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [dashboardError, setDashboardError] = useState(null)
  const [roomError, setRoomError] = useState(null)
  const [selectedHero, setSelectedHero] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [context, setContext] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [sending, setSending] = useState(false)
  const unsubscribeRef = useRef(null)
  const messageListRef = useRef(null)

  const heroes = useMemo(() => (dashboard?.heroes ? dashboard.heroes : []), [dashboard])

  const activeRoomId = context?.type === 'chat-room' ? context.chatRoomId : null
  const viewingGlobal = context?.type === 'global'
  const activeSessionId = context?.type === 'session' ? context.sessionId : null

  const viewerToken = useMemo(() => normalizeId(viewer?.id || viewer?.owner_id), [viewer])

  useEffect(() => {
    if (!open) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      setContext(null)
      setMessages([])
      setMessageInput('')
      if (onUnreadChange) {
        onUnreadChange(0)
      }
      return
    }

    let mounted = true

    const bootstrap = async () => {
      setLoadingDashboard(true)
      setDashboardError(null)
      try {
        const [snapshot, user] = await Promise.all([fetchChatDashboard({ limit: 24 }), getCurrentUser()])
        if (!mounted) return
        setDashboard(snapshot)
        setViewer(user)
        setSelectedHero((snapshot.heroes && snapshot.heroes[0]?.id) || null)
        setRooms({ joined: snapshot.rooms || [], available: snapshot.publicRooms || [] })
      } catch (error) {
        if (!mounted) return
        console.error('[chat] 대시보드 로드 실패:', error)
        setDashboardError(error)
      } finally {
        if (mounted) {
          setLoadingDashboard(false)
        }
      }
    }

    bootstrap()

    return () => {
      mounted = false
    }
  }, [open])

  useEffect(() => {
    if (!open || !context) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      return
    }

    let cancelled = false
    const load = async () => {
      setLoadingMessages(true)
      setSendError(null)
      try {
        const result = await fetchRecentMessages({
          limit: MESSAGE_LIMIT,
          sessionId: context.sessionId || null,
          matchInstanceId: context.matchInstanceId || null,
          chatRoomId: context.chatRoomId || null,
          scope: context.scope || null,
        })
        if (cancelled) return
        setMessages(upsertMessageList([], result.messages || []))
        if (onUnreadChange) {
          onUnreadChange(0)
        }

        if (unsubscribeRef.current) {
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }

        unsubscribeRef.current = subscribeToMessages({
          onInsert: (record) => {
            setMessages((prev) => upsertMessageList(prev, record))
            const hidden = typeof document !== 'undefined' ? document.hidden : false
            if (onUnreadChange && (!context.focused || hidden)) {
              onUnreadChange((prevUnread) => Math.min(999, (prevUnread || 0) + 1))
            }
          },
          sessionId: context.sessionId || null,
          matchInstanceId: context.matchInstanceId || null,
          chatRoomId: context.chatRoomId || null,
          scope: context.scope || null,
          ownerId: viewer?.id || null,
          userId: viewer?.id || null,
        })
      } catch (error) {
        if (cancelled) return
        console.error('[chat] 메시지 로드 실패:', error)
        setSendError(error)
      } finally {
        if (!cancelled) {
          setLoadingMessages(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [open, context, viewer, onUnreadChange])

  useEffect(() => {
    if (!open) return
    const node = messageListRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, open])

  const refreshRooms = useCallback(
    async (search = '') => {
      setLoadingRooms(true)
      setRoomError(null)
      try {
        const snapshot = await fetchChatRooms({ search })
        setRooms(snapshot)
      } catch (error) {
        console.error('[chat] 방 목록을 불러오지 못했습니다.', error)
        setRoomError(error)
      } finally {
        setLoadingRooms(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    if (activeTab === 'private' || activeTab === 'open') {
      refreshRooms()
    }
  }, [activeTab, open, refreshRooms])

  const handleSelectHero = useCallback((heroId) => {
    setSelectedHero(heroId)
  }, [])

  const handleSelectSession = useCallback((session) => {
    if (!session) return
    setContext({
      type: 'session',
      scope: 'main',
      sessionId: session.session_id || session.id,
      matchInstanceId: session.match_instance_id || session.matchInstanceId || null,
      rankRoomId: session.room_id || null,
      label: session.game_name || '세션 채팅',
      focused: true,
    })
    setActiveTab('info')
  }, [])

  const handleSelectRoom = useCallback((room, visibility) => {
    if (!room) return
    const roomId = normalizeId(room.id)
    const isGlobal = room.builtin === 'global' || roomId === normalizeId(GLOBAL_ROOM.id)
    if (isGlobal) {
      setContext({
        type: 'global',
        scope: 'global',
        label: room.name || GLOBAL_ROOM.name,
        visibility: 'public',
        focused: true,
      })
      return
    }

    setContext({
      type: 'chat-room',
      scope: 'room',
      chatRoomId: room.id,
      label: room.name || '채팅방',
      visibility: visibility || room.visibility || 'private',
      focused: true,
    })
  }, [])

  const handleCreateRoom = useCallback(async () => {
    const name = window.prompt('새 비공개 채팅방 이름을 입력해 주세요.')
    if (!name) return
    try {
      await createChatRoom({ name, visibility: 'private', heroId: selectedHero || null })
      await refreshRooms()
    } catch (error) {
      console.error('[chat] 채팅방 생성 실패', error)
      alert('채팅방을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.')
    }
  }, [refreshRooms, selectedHero])

  const handleJoinRoom = useCallback(
    async (room) => {
      if (!room?.id) return
      const isGlobal = room.builtin === 'global' || normalizeId(room.id) === normalizeId(GLOBAL_ROOM.id)
      if (isGlobal) {
        handleSelectRoom({ ...GLOBAL_ROOM, ...room }, room.visibility || 'public')
        return
      }
      try {
        await joinChatRoom({ roomId: room.id, heroId: selectedHero || null })
        await refreshRooms()
        handleSelectRoom(room, room.visibility)
      } catch (error) {
        console.error('[chat] 채팅방 참여 실패', error)
        alert('채팅방에 참여할 수 없습니다.')
      }
    },
    [refreshRooms, handleSelectRoom, selectedHero],
  )

  const handleLeaveRoom = useCallback(
    async (room) => {
      if (!room?.id) return
      const isGlobal = room.builtin === 'global' || normalizeId(room.id) === normalizeId(GLOBAL_ROOM.id)
      if (isGlobal) {
        setContext((current) => (current?.type === 'global' ? null : current))
        setMessages([])
        return
      }
      const confirmLeave = window.confirm('이 채팅방에서 나가시겠습니까?')
      if (!confirmLeave) return
      try {
        await leaveChatRoom({ roomId: room.id })
        await refreshRooms()
        if (context?.type === 'chat-room' && context.chatRoomId === room.id) {
          setContext(null)
          setMessages([])
        }
      } catch (error) {
        console.error('[chat] 채팅방 나가기 실패', error)
        alert('채팅방을 나갈 수 없습니다.')
      }
    },
    [context, refreshRooms],
  )

  const handleSendMessage = useCallback(
    async (options = {}) => {
      if (!context) return
      const text = typeof options.text === 'string' ? options.text.trim() : messageInput.trim()
      if (!text) return

      setSending(true)
      setSendError(null)
      try {
        const rankRoomId =
          context && (context.scope === 'main' || context.scope === 'role')
            ? context.rankRoomId || null
            : null
        const inserted = await insertMessage(
          { text, scope: context.scope || 'global', hero_id: selectedHero || null },
          {
            sessionId: context.sessionId || null,
            matchInstanceId: context.matchInstanceId || null,
            chatRoomId: context.chatRoomId || null,
            roomId: rankRoomId,
          },
        )
        if (inserted) {
          setMessages((prev) => upsertMessageList(prev, inserted))
        }
        setMessageInput('')
      } catch (error) {
        console.error('[chat] 메시지를 보낼 수 없습니다.', error)
        setSendError(error)
      } finally {
        setSending(false)
      }
    },
    [context, messageInput, selectedHero],
  )

  const handleAiReply = useCallback(async () => {
    const prompt = window.prompt('AI에게 전달할 프롬프트를 입력해 주세요.')
    if (!prompt) return
    try {
      const session = await supabase.auth.getSession()
      const token = session?.data?.session?.access_token
      if (!token) {
        alert('로그인 세션을 확인할 수 없습니다.')
        return
      }
      const response = await fetch('/api/chat/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt }),
      })
      const payload = await response.json()
      if (!response.ok || !payload?.text) {
        throw new Error(payload?.error || 'AI 응답을 받을 수 없습니다.')
      }
      await handleSendMessage({ text: payload.text })
    } catch (error) {
      console.error('[chat] AI 응답 요청 실패', error)
      alert('AI 응답을 불러올 수 없습니다.')
    }
  }, [handleSendMessage])

  const renderInfoTab = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={overlayStyles.section}>
        <h3 style={overlayStyles.sectionTitle}>사용할 캐릭터</h3>
        <div style={overlayStyles.heroSelector}>
          {heroes.length ? (
            heroes.map((hero) => (
              <button
                key={hero.id}
                type="button"
                onClick={() => handleSelectHero(hero.id)}
                style={overlayStyles.heroPill(selectedHero === hero.id)}
              >
                {hero.name || '이름 없는 캐릭터'}
              </button>
            ))
          ) : (
            <span style={overlayStyles.mutedText}>등록된 캐릭터가 없습니다.</span>
          )}
        </div>
      </section>
      <section style={overlayStyles.section}>
        <h3 style={overlayStyles.sectionTitle}>참여중인 세션</h3>
        <div style={overlayStyles.roomList}>
          {(dashboard?.sessions || []).map((session) => {
            const key = session.session_id || session.id
            const active = activeSessionId && key === activeSessionId
            const latest = derivePreviewText(session.latestMessage || null)
            return (
              <div
                key={key}
                style={overlayStyles.roomCard(active)}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectSession(session)}
              >
                <span style={overlayStyles.cardTitle}>{session.game_name || '매치 세션'}</span>
                <span style={overlayStyles.cardSubtitle}>{latest || '메시지를 불러옵니다.'}</span>
              </div>
            )
          })}
          {!(dashboard?.sessions || []).length ? (
            <span style={overlayStyles.mutedText}>참여중인 세션이 없습니다.</span>
          ) : null}
        </div>
      </section>
    </div>
  )

  const renderRoomList = (visibility) => {
    let list = visibility === 'open' ? rooms.available || [] : rooms.joined || []
    if (visibility === 'open') {
      const filtered = list.filter(
        (room) => normalizeId(room.id) !== normalizeId(GLOBAL_ROOM.id),
      )
      list = [GLOBAL_ROOM, ...filtered]
    }

    if (!list.length) {
      return <span style={overlayStyles.mutedText}>표시할 채팅방이 없습니다.</span>
    }

    return (
      <div style={overlayStyles.roomList}>
        {list.map((room) => {
          const roomId = normalizeId(room.id)
          const isGlobal = room.builtin === 'global' || roomId === normalizeId(GLOBAL_ROOM.id)
          const active = isGlobal ? viewingGlobal : activeRoomId === room.id
          const latest = derivePreviewText(room.latestMessage || null)
          return (
            <div
              key={room.id}
              style={overlayStyles.roomCard(active)}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectRoom(room, visibility)}
            >
              <span style={overlayStyles.cardTitle}>{room.name || '채팅방'}</span>
              <span style={overlayStyles.cardSubtitle}>{latest || '최근 메시지가 없습니다.'}</span>
              {visibility === 'open' ? (
                isGlobal ? (
                  <span style={{ ...overlayStyles.mutedText, marginTop: 6 }}>기본 채널</span>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleJoinRoom(room)
                    }}
                    style={{ ...overlayStyles.actionButton('ghost'), marginTop: 6 }}
                  >
                    참여하기
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleLeaveRoom(room)
                  }}
                  style={{ ...overlayStyles.actionButton('ghost'), marginTop: 6 }}
                >
                  나가기
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderListColumn = () => {
    const visibility = activeTab === 'open' ? 'open' : activeTab === 'private' ? 'private' : null

    let content
    if (activeTab === 'info') {
      content = loadingDashboard ? (
        <span style={overlayStyles.mutedText}>정보를 불러오는 중...</span>
      ) : dashboardError ? (
        <span style={{ ...overlayStyles.mutedText, color: '#fca5a5' }}>
          대시보드를 불러오지 못했습니다.
        </span>
      ) : (
        renderInfoTab()
      )
    } else {
      content = (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={overlayStyles.listHeader}>
            <strong style={overlayStyles.sectionTitle}>
              {visibility === 'open' ? '공개 채팅' : '비공개 채팅'}
            </strong>
            {visibility === 'private' ? (
              <button type="button" onClick={handleCreateRoom} style={overlayStyles.actionButton('ghost')}>
                새 방
              </button>
            ) : null}
          </div>
          {roomError ? (
            <span style={{ ...overlayStyles.mutedText, color: '#fca5a5' }}>
              채팅방을 불러올 수 없습니다.
            </span>
          ) : loadingRooms ? (
            <span style={overlayStyles.mutedText}>채팅방을 불러오는 중...</span>
          ) : (
            renderRoomList(visibility)
          )}
        </div>
      )
    }

    return (
      <aside style={overlayStyles.sidePanel}>
        <div style={overlayStyles.sideTabs}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              style={overlayStyles.sideTabButton(activeTab === tab.key)}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={overlayStyles.sideContent}>{content}</div>
      </aside>
    )
  }

  const renderMessageColumn = () => {
    const hasContext = Boolean(context)

    const label = hasContext ? context.label || '채팅' : '채팅'
    const subtitle = hasContext
      ? context.type === 'session'
        ? '세션 채팅'
        : context.type === 'global'
          ? '전체 채널'
          : context.visibility === 'open'
            ? '공개 채팅방'
            : '비공개 채팅방'
      : '좌측에서 채팅방을 선택해 주세요.'

    const disableSend = !hasContext || sending || !messageInput.trim()

    return (
      <section style={overlayStyles.conversation}>
        <header style={overlayStyles.conversationHeader}>
          <div style={overlayStyles.headerLeft}>
            {hasContext ? (
              <button
                type="button"
                onClick={() => setContext(null)}
                style={overlayStyles.headerButton('ghost')}
              >
                ← 목록
              </button>
            ) : null}
            <div style={overlayStyles.headerMeta}>
              <span style={overlayStyles.headerTitle}>{label}</span>
              <span style={overlayStyles.headerSubtitle}>{subtitle}</span>
            </div>
          </div>
          <div style={overlayStyles.headerButtons}>
            <button
              type="button"
              onClick={handleAiReply}
              disabled={!hasContext}
              style={overlayStyles.headerButton('ghost', !hasContext)}
            >
              AI 응답
            </button>
            <button
              type="button"
              onClick={onClose}
              style={overlayStyles.headerButton('primary')}
            >
              닫기
            </button>
          </div>
        </header>
        <div ref={messageListRef} style={overlayStyles.messageViewport}>
          {hasContext ? (
            loadingMessages ? (
              <span style={overlayStyles.mutedText}>메시지를 불러오는 중...</span>
            ) : messages.length ? (
              messages.map((message) => {
                const text = extractMessageText(message)
                const created = formatTime(message.created_at)
                const ownerToken = normalizeId(message.owner_id || message.user_id)
                const mine = viewerToken && ownerToken && viewerToken === ownerToken
                const preview = text || derivePreviewText(message)
                const displayName = message.username || '알 수 없음'
                const initials = displayName.slice(0, 2)
                const avatarNode = (
                  <div style={overlayStyles.messageAvatar}>
                    {message.avatar_url ? (
                      <img
                        src={message.avatar_url}
                        alt={displayName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      initials
                    )}
                  </div>
                )
                return (
                  <div
                    key={message.id || `${message.created_at}-${Math.random()}`}
                    style={overlayStyles.messageRow(mine)}
                  >
                    {mine ? (
                      <span style={overlayStyles.messageTimestamp(true)}>{created}</span>
                    ) : (
                      avatarNode
                    )}
                    <div style={overlayStyles.messageContent(mine)}>
                      <span style={overlayStyles.messageName(mine)}>{displayName}</span>
                      <div style={overlayStyles.messageBubble(mine)}>
                        <p style={overlayStyles.messageText}>{preview || ' '}</p>
                      </div>
                    </div>
                    {mine ? avatarNode : <span style={overlayStyles.messageTimestamp(false)}>{created}</span>}
                  </div>
                )
              })
            ) : (
              <span style={overlayStyles.mutedText}>아직 메시지가 없습니다.</span>
            )
          ) : (
            <div style={overlayStyles.placeholder}>채팅방 또는 세션을 선택해 주세요.</div>
          )}
        </div>
        <div style={overlayStyles.composer}>
          <textarea
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            placeholder="메시지를 입력하세요"
            style={overlayStyles.textarea}
            disabled={!hasContext || sending}
          />
          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={disableSend}
            style={overlayStyles.actionButton('primary', disableSend)}
          >
            보내기
          </button>
        </div>
        {sendError ? (
          <div style={overlayStyles.errorText}>메시지를 전송할 수 없습니다.</div>
        ) : null}
      </section>
    )
  }

  const focused = Boolean(context)

  return (
    <SurfaceOverlay
      open={open}
      onClose={onClose}
      title="채팅"
      width="min(1100px, 95vw)"
      hideHeader
      contentStyle={{ padding: 0, background: 'transparent', display: 'flex', justifyContent: 'center' }}
      frameStyle={{ border: 'none', background: 'transparent', boxShadow: 'none' }}
    >
      <div style={overlayStyles.frame}>
        <div style={overlayStyles.root(focused)}>
          {!focused ? renderListColumn() : null}
          {renderMessageColumn()}
        </div>
      </div>
    </SurfaceOverlay>
  )
}
