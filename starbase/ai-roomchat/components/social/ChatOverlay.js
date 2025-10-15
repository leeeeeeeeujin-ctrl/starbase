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
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    minHeight: '84vh',
    maxHeight: '92vh',
    width: '100%',
    boxSizing: 'border-box',
  },
  tabBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
  },
  tabButton: (active) => ({
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    background: active ? 'rgba(59, 130, 246, 0.25)' : 'rgba(15, 23, 42, 0.72)',
    color: active ? '#dbeafe' : '#cbd5f5',
    transition: 'all 0.2s ease',
  }),
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    flex: 1,
    overflow: 'hidden',
  },
  listColumn: {
    width: 280,
    minWidth: 240,
    maxHeight: '100%',
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.6)',
    padding: '16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  listScroll: {
    flex: 1,
    overflowY: 'auto',
    display: 'grid',
    gap: 10,
    paddingRight: 4,
  },
  card: (active) => ({
    borderRadius: 14,
    border: active ? '1px solid rgba(59, 130, 246, 0.55)' : '1px solid rgba(148, 163, 184, 0.18)',
    background: active ? 'rgba(59, 130, 246, 0.18)' : 'rgba(15, 23, 42, 0.72)',
    padding: '12px 14px',
    display: 'grid',
    gap: 6,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
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
  messageColumn: {
    flex: 1,
    minWidth: 320,
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.7)',
    padding: '18px 18px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  placeholder: {
    flex: 1,
    borderRadius: 18,
    border: '1px dashed rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontSize: 14,
    padding: '24px 18px',
    textAlign: 'center',
  },
  heroSelector: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroPill: (active) => ({
    borderRadius: 999,
    border: active ? '1px solid rgba(59, 130, 246, 0.6)' : '1px solid rgba(148, 163, 184, 0.28)',
    background: active ? 'rgba(59, 130, 246, 0.18)' : 'rgba(15, 23, 42, 0.68)',
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    color: active ? '#dbeafe' : '#cbd5f5',
    cursor: 'pointer',
  }),
  messageList: {
    flex: 1,
    overflowY: 'auto',
    display: 'grid',
    gap: 6,
    padding: '2px 4px 14px',
  },
  messageRow: (mine = false) => ({
    display: 'flex',
    justifyContent: mine ? 'flex-end' : 'flex-start',
    alignItems: 'center',
    gap: 12,
  }),
  messageContent: (mine = false) => ({
    display: 'grid',
    gap: 4,
    maxWidth: '70%',
    textAlign: mine ? 'right' : 'left',
  }),
  messageName: (mine = false) => ({
    fontSize: 11,
    fontWeight: 700,
    color: mine ? '#cfe1ff' : '#f1f5f9',
  }),
  messageBubble: (mine = false) => ({
    background: mine ? 'rgba(59, 130, 246, 0.24)' : 'rgba(15, 23, 42, 0.82)',
    borderRadius: mine ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
    border: mine ? '1px solid rgba(96, 165, 250, 0.45)' : '1px solid rgba(148, 163, 184, 0.22)',
    padding: '8px 12px',
    color: '#f8fafc',
    boxShadow: mine ? '0 14px 36px -28px rgba(59, 130, 246, 0.7)' : '0 14px 36px -28px rgba(15, 23, 42, 0.7)',
  }),
  messageText: {
    fontSize: 13,
    lineHeight: 1.45,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'rgba(30, 41, 59, 0.85)',
    color: '#bae6fd',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  messageTimestamp: (mine = false) => ({
    fontSize: 11,
    color: 'rgba(148, 163, 184, 0.85)',
    minWidth: 54,
    textAlign: mine ? 'right' : 'left',
  }),
  composer: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  textarea: {
    flex: '1 1 240px',
    minHeight: 64,
    borderRadius: 16,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    background: 'rgba(15, 23, 42, 0.75)',
    color: '#f8fafc',
    padding: '12px 14px',
    fontSize: 14,
    resize: 'vertical',
  },
  actionButton: (variant = 'primary', disabled = false) => {
    const palette = {
      primary: {
        background: disabled ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.85)',
        color: disabled ? '#94a3b8' : '#f8fafc',
      },
      ghost: {
        background: 'rgba(15, 23, 42, 0.6)',
        color: '#cbd5f5',
      },
    }
    const tone = palette[variant] || palette.primary
    return {
      borderRadius: 14,
      border: 'none',
      padding: '10px 16px',
      fontSize: 13,
      fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: tone.background,
      color: tone.color,
    }
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

  const renderInfoTab = () => {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#cbd5f5' }}>사용할 캐릭터</h3>
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
              <span style={{ fontSize: 12, color: '#94a3b8' }}>등록된 캐릭터가 없습니다.</span>
            )}
          </div>
        </div>
        <div>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#cbd5f5' }}>참여중인 세션</h3>
          <div style={overlayStyles.listScroll}>
            {(dashboard?.sessions || []).map((session) => {
              const key = session.session_id || session.id
              const active = activeSessionId && key === activeSessionId
              const latest = derivePreviewText(session.latestMessage || null)
              return (
                <div
                  key={key}
                  style={overlayStyles.card(active)}
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
              <span style={{ fontSize: 12, color: '#94a3b8' }}>참여중인 세션이 없습니다.</span>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  const renderRoomList = (visibility) => {
    let list = visibility === 'open' ? rooms.available || [] : rooms.joined || []
    if (visibility === 'open') {
      const filtered = list.filter(
        (room) => normalizeId(room.id) !== normalizeId(GLOBAL_ROOM.id),
      )
      list = [GLOBAL_ROOM, ...filtered]
    }

    if (!list.length) {
      return <span style={{ fontSize: 12, color: '#94a3b8' }}>표시할 채팅방이 없습니다.</span>
    }

    return list.map((room) => {
      const roomId = normalizeId(room.id)
      const isGlobal = room.builtin === 'global' || roomId === normalizeId(GLOBAL_ROOM.id)
      const active = isGlobal ? viewingGlobal : activeRoomId === room.id
      const latest = derivePreviewText(room.latestMessage || null)
      return (
        <div
          key={room.id}
          style={overlayStyles.card(active)}
          role="button"
          tabIndex={0}
          onClick={() => handleSelectRoom(room, visibility)}
        >
          <span style={overlayStyles.cardTitle}>{room.name || '채팅방'}</span>
          <span style={overlayStyles.cardSubtitle}>{latest || '최근 메시지가 없습니다.'}</span>
          {visibility === 'open' ? (
            isGlobal ? (
              <span style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>기본 채널</span>
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
    })
  }

  const renderListColumn = () => {
    if (activeTab === 'info') {
      return (
        <div style={{ ...overlayStyles.listColumn, gap: 18 }}>
          {loadingDashboard ? (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>정보를 불러오는 중...</span>
          ) : dashboardError ? (
            <span style={{ fontSize: 12, color: '#fca5a5' }}>대시보드를 불러오지 못했습니다.</span>
          ) : (
            renderInfoTab()
          )}
        </div>
      )
    }

    const visibility = activeTab === 'open' ? 'open' : 'private'

    return (
      <div style={overlayStyles.listColumn}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <strong style={{ fontSize: 13, color: '#cbd5f5' }}>
            {visibility === 'open' ? '공개 채팅' : '비공개 채팅'}
          </strong>
          {visibility === 'private' ? (
            <button type="button" onClick={handleCreateRoom} style={overlayStyles.actionButton('ghost')}>
              새 방
            </button>
          ) : null}
        </div>
        {roomError ? (
          <span style={{ fontSize: 12, color: '#fca5a5' }}>채팅방을 불러올 수 없습니다.</span>
        ) : null}
        <div style={overlayStyles.listScroll}>
          {loadingRooms ? (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>채팅방을 불러오는 중...</span>
          ) : (
            renderRoomList(visibility)
          )}
        </div>
      </div>
    )
  }

  const renderMessageColumn = () => {
    if (!context) {
      return <div style={overlayStyles.placeholder}>채팅방 또는 세션을 선택해 주세요.</div>
    }

    return (
      <div style={overlayStyles.messageColumn}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" onClick={() => setContext(null)} style={overlayStyles.actionButton('ghost')}>
              ← 목록
            </button>
            <div style={{ display: 'grid', gap: 4 }}>
              <strong style={{ fontSize: 15, color: '#f1f5f9' }}>{context.label || '채팅'}</strong>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {context.type === 'session'
                  ? '세션 채팅'
                  : context.type === 'global'
                    ? '전체 채널'
                    : context.visibility === 'open'
                      ? '공개 채팅방'
                      : '비공개 채팅방'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleAiReply} style={overlayStyles.actionButton('ghost')}>
              AI 응답
            </button>
          </div>
        </header>
        <div ref={messageListRef} style={overlayStyles.messageList}>
          {loadingMessages ? (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>메시지를 불러오는 중...</span>
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
            <span style={{ fontSize: 12, color: '#94a3b8' }}>아직 메시지가 없습니다.</span>
          )}
        </div>
        <div style={overlayStyles.composer}>
          <textarea
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            placeholder="메시지를 입력하세요"
            style={overlayStyles.textarea}
            disabled={!context || sending}
          />
          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!context || sending || !messageInput.trim()}
            style={overlayStyles.actionButton('primary', sending || !messageInput.trim())}
          >
            보내기
          </button>
        </div>
        {sendError ? (
          <span style={{ fontSize: 12, color: '#fca5a5' }}>메시지를 전송할 수 없습니다.</span>
        ) : null}
      </div>
    )
  }

  return (
    <SurfaceOverlay
      open={open}
      onClose={onClose}
      title="채팅"
      width={960}
      contentStyle={{ padding: 20, background: 'rgba(15, 23, 42, 0.85)' }}
    >
      <div style={overlayStyles.container}>
        <nav style={overlayStyles.tabBar}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              style={overlayStyles.tabButton(activeTab === tab.key)}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div style={overlayStyles.body}>
          {context ? renderMessageColumn() : renderListColumn()}
        </div>
      </div>
    </SurfaceOverlay>
  )
}
