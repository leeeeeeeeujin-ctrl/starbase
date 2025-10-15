import Head from 'next/head'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
import { readRankKeyringSnapshot } from '@/lib/rank/keyringStorage'
import { supabase } from '@/lib/supabase'

const LAYOUT = {
  page: {
    minHeight: '100vh',
    padding: '32px 16px',
    background: 'radial-gradient(circle at top, #0f172a 0%, #020617 70%)',
    color: '#e2e8f0',
    boxSizing: 'border-box',
  },
  viewport: {
    maxWidth: 1180,
    margin: '0 auto',
    height: 'min(900px, calc(100vh - 64px))',
    minHeight: 640,
    background: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.18)',
    boxShadow: '0 40px 120px -80px rgba(15, 23, 42, 0.85)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '24px 32px 18px',
    borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
  },
  titleGroup: {
    display: 'grid',
    gap: 6,
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidePanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 20px 16px',
    gap: 18,
    overflow: 'hidden',
  },
  scrollStack: {
    flex: 1,
    overflowY: 'auto',
    paddingRight: 4,
    display: 'grid',
    gap: 16,
  },
  messagePanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 28px 20px',
    minHeight: 0,
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    display: 'grid',
    gap: 16,
    paddingRight: 6,
  },
  messageCard: {
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.16)',
    background: 'rgba(15, 23, 42, 0.72)',
    padding: '18px 20px',
    display: 'grid',
    gap: 8,
  },
  messageHeader: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(30, 41, 59, 0.7)',
    color: '#cbd5f5',
    fontWeight: 700,
  },
  composer: {
    marginTop: 16,
    paddingTop: 18,
    borderTop: '1px solid rgba(148, 163, 184, 0.16)',
    display: 'grid',
    gap: 12,
  },
  composerRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  textInput: {
    flex: '1 1 280px',
    minHeight: 52,
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    background: 'rgba(15, 23, 42, 0.75)',
    padding: '12px 18px',
    color: '#f8fafc',
    fontSize: 15,
  },
  button: (variant = 'primary', disabled = false) => {
    const palette = {
      primary: {
        background: disabled ? 'rgba(59, 130, 246, 0.24)' : 'rgba(59, 130, 246, 0.9)',
        color: disabled ? '#94a3b8' : '#f8fafc',
      },
      ghost: {
        background: 'rgba(15, 23, 42, 0.65)',
        color: '#cbd5f5',
      },
      danger: {
        background: 'rgba(248, 113, 113, 0.22)',
        color: '#fecaca',
      },
    }
    const tone = palette[variant] || palette.primary
    return {
      padding: '12px 20px',
      borderRadius: 999,
      border: 'none',
      fontWeight: 700,
      fontSize: 14,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: tone.background,
      color: tone.color,
      transition: 'all 0.2s ease',
    }
  },
  smallButton: (active = false) => ({
    padding: '10px 14px',
    borderRadius: 14,
    border: active
      ? '1px solid rgba(147, 197, 253, 0.45)'
      : '1px solid rgba(148, 163, 184, 0.18)',
    background: active ? 'rgba(59, 130, 246, 0.2)' : 'rgba(15, 23, 42, 0.55)',
    color: active ? '#f8fafc' : '#cbd5f5',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  }),
  card: {
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.14)',
    background: 'rgba(15, 23, 42, 0.6)',
    padding: '14px 16px',
    display: 'grid',
    gap: 6,
  },
  badge: {
    padding: '2px 8px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.16)',
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: 700,
  },
  tabBar: {
    borderTop: '1px solid rgba(148, 163, 184, 0.16)',
    background: 'rgba(10, 15, 27, 0.92)',
    padding: '12px 20px',
    display: 'flex',
    justifyContent: 'space-around',
    gap: 12,
  },
  tabButton: (active) => ({
    flex: 1,
    padding: '12px 16px',
    borderRadius: 14,
    border: 'none',
    background: active ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
    color: active ? '#f8fafc' : '#94a3b8',
    fontWeight: active ? 800 : 600,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }),
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 14,
    padding: '32px 0',
  },
  notice: (active = false) => ({
    padding: '12px 16px',
    borderRadius: 16,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.32)'
      : '1px solid rgba(248, 113, 113, 0.25)',
    background: active ? 'rgba(37, 99, 235, 0.18)' : 'rgba(248, 113, 113, 0.12)',
    color: active ? '#bfdbfe' : '#fecaca',
    fontSize: 13,
    lineHeight: 1.5,
  }),
}

const TABS = [
  { id: 'info', label: '정보' },
  { id: 'private', label: '일반채팅' },
  { id: 'open', label: '오픈채팅' },
]

const INITIAL_CREATE_STATE = {
  open: false,
  name: '',
  description: '',
  visibility: 'private',
  capacity: 12,
  allowAi: true,
  requireApproval: false,
  heroId: '',
}

function normalizeId(value) {
  if (value === null || value === undefined) return null
  const token = String(value).trim()
  return token.length ? token.toLowerCase() : null
}

const GLOBAL_ROOM_CARD = {
  id: 'global-chat-channel',
  name: '전체 채팅',
  description: '모든 플레이어가 참여하는 기본 채널',
  visibility: 'public',
  builtin: 'global',
}

function buildRoomContext(room) {
  if (!room) return null
  return {
    type: 'chatRoom',
    scope: 'room',
    chatRoomId: room.id,
    rankRoomId: room.rank_room_id || null,
    label: room.name || '대화방',
    description: room.description || '',
    memberCount: room.member_count || 0,
    visibility: room.visibility || 'private',
  }
}

function buildGlobalContext() {
  return {
    type: 'global',
    scope: 'global',
    label: '전체 채팅',
    description: '모두와 대화하세요.',
    memberCount: null,
    visibility: 'public',
  }
}

function resolveViewerParticipant(session, viewer) {
  if (!session || !viewer) return null
  const participants = Array.isArray(session.participants) ? session.participants : []
  if (!participants.length) return null
  const viewerId = normalizeId(viewer.ownerId || viewer.id)
  if (!viewerId) return null
  return (
    participants.find((entry) => normalizeId(entry.owner_id) === viewerId) || null
  )
}

function buildSessionContext(session, variant = 'main', viewer = null) {
  if (!session) return null
  const viewerParticipant = resolveViewerParticipant(session, viewer)
  const base = {
    type: variant === 'role' ? 'session-role' : 'session-main',
    scope: variant === 'role' ? 'role' : 'main',
    sessionId: session.session_id,
    matchInstanceId: session.match_instance_id,
    gameId: session.game_id,
    label:
      variant === 'role'
        ? `${session.game_name || '세션'} · 역할`
        : `${session.game_name || '세션'} · 메인`,
    viewerRole: session.viewer_role || null,
    heroId: viewerParticipant?.hero_id || null,
    heroName: viewerParticipant?.hero_name || null,
    participants: Array.isArray(session.participants) ? session.participants : [],
    session,
  }
  return base
}

function buildWhisperContext(contact) {
  if (!contact) return null
  return {
    type: 'whisper',
    scope: 'whisper',
    label: contact.hero_name ? `${contact.hero_name} 님과 대화` : '귓속말',
    targetHeroId: contact.hero_id || null,
    targetOwnerId: contact.owner_id || null,
    matchInstanceId: contact.match_instance_id || null,
  }
}

function collectActiveMarkers(turnState = {}) {
  const ownerSet = new Set()
  const heroSet = new Set()
  const roleSet = new Set()
  const pushOwner = (value) => {
    const token = normalizeId(value)
    if (token) ownerSet.add(token)
  }
  const pushHero = (value) => {
    const token = normalizeId(value)
    if (token) heroSet.add(token)
  }
  const pushRole = (value) => {
    const token = typeof value === 'string' ? value.trim().toLowerCase() : null
    if (token) roleSet.add(token)
  }

  const ownerCandidates = [
    turnState.activeOwnerId,
    turnState.active_owner_id,
    turnState.ownerId,
    turnState.currentOwnerId,
    turnState.turnOwnerId,
    turnState.owner_id,
  ]
  ownerCandidates.forEach(pushOwner)

  const heroCandidates = [turnState.activeHeroId, turnState.heroId, turnState.hero_id]
  heroCandidates.forEach(pushHero)

  const roleCandidates = [turnState.activeRole, turnState.role, turnState.targetRole]
  roleCandidates.forEach(pushRole)

  if (Array.isArray(turnState.activeOwnerIds)) {
    turnState.activeOwnerIds.forEach(pushOwner)
  }

  if (turnState.actor && typeof turnState.actor === 'object') {
    pushOwner(turnState.actor.ownerId || turnState.actor.owner_id)
    pushHero(turnState.actor.heroId || turnState.actor.hero_id)
    pushRole(turnState.actor.role)
    if (Array.isArray(turnState.actor.owners)) {
      turnState.actor.owners.forEach(pushOwner)
    }
  }

  const participants = [turnState.participant, turnState.activeParticipant]
  participants.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    pushOwner(entry.ownerId || entry.owner_id)
    pushHero(entry.heroId || entry.hero_id)
    pushRole(entry.role)
  })

  if (Array.isArray(turnState.activeRoles)) {
    turnState.activeRoles.forEach(pushRole)
  }

  if (Array.isArray(turnState.roles)) {
    turnState.roles.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        pushRole(entry.role || entry.name)
      } else {
        pushRole(entry)
      }
    })
  }

  return { owners: ownerSet, heroes: heroSet, roles: roleSet }
}

function computeSessionSpeakWindow(session, viewer, context) {
  if (!session || !context) {
    return {
      canChat: true,
      notice: null,
      hint: null,
      activeOwners: new Set(),
      activeHeroes: new Set(),
      activeRoles: new Set(),
    }
  }

  if (context.scope === 'room' || context.scope === 'whisper') {
    return {
      canChat: true,
      notice: null,
      hint: null,
      activeOwners: new Set(),
      activeHeroes: new Set(),
      activeRoles: new Set(),
    }
  }

  const turnState = (session.turn_state || session.turnState || null) ?? {}
  const mode = String(session.realtime_mode || turnState.mode || turnState.matchMode || '')
    .trim()
    .toLowerCase()
  if (mode && mode !== 'realtime' && mode !== 'live') {
    return {
      canChat: true,
      notice: null,
      hint: null,
      activeOwners: new Set(),
      activeHeroes: new Set(),
      activeRoles: new Set(),
    }
  }

  const status = String(turnState.status || turnState.phase || '')
    .trim()
    .toLowerCase()
  const locked = Boolean(
    turnState.locked || turnState.inputLocked || status === 'paused' || status === 'blocked',
  )
  const allowAll =
    turnState.allowAll === true ||
    (typeof turnState.audience === 'string' && turnState.audience.toLowerCase() === 'all') ||
    (turnState.broadcast && String(turnState.broadcast).toLowerCase() === 'all')

  const { owners: activeOwners, heroes: activeHeroes, roles: activeRoles } =
    collectActiveMarkers(turnState)

  const viewerId = normalizeId(viewer?.ownerId || viewer?.id)
  const viewerHeroId = normalizeId(context?.heroId || viewer?.heroId)

  let viewerAllowed = allowAll || !activeOwners.size
  if (!viewerAllowed && viewerId) {
    viewerAllowed = activeOwners.has(viewerId)
  }
  if (!viewerAllowed && viewerHeroId) {
    viewerAllowed = activeHeroes.has(viewerHeroId)
  }

  const viewerRole = context.viewerRole ? context.viewerRole.toLowerCase() : null
  let roleAllowed = true
  if (context.scope === 'role' && viewerRole) {
    if (activeRoles.size) {
      roleAllowed = activeRoles.has(viewerRole)
    }
  }

  const remainingSeconds = Number.isFinite(Number(turnState.remainingSeconds))
    ? Math.max(0, Math.floor(Number(turnState.remainingSeconds)))
    : null

  let canChat = viewerAllowed && roleAllowed && !locked
  let notice = null
  if (!viewerAllowed) {
    notice = '지금은 다른 참가자의 차례입니다.'
  } else if (!roleAllowed) {
    notice = '현재 역할에게는 입력 권한이 없습니다.'
  } else if (locked) {
    notice = '세션 입력 창이 일시적으로 잠겨 있습니다.'
  }

  let hint = null
  if (remainingSeconds !== null) {
    hint = `남은 시간 ${remainingSeconds}초`
  } else if (status) {
    hint = `상태: ${status}`
  }

  return { canChat, notice, hint, activeOwners, activeHeroes, activeRoles }
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

function resolveAvatar(message) {
  if (message?.hero_image_url) {
    return { type: 'image', url: message.hero_image_url }
  }
  if (message?.avatar_url) {
    return { type: 'image', url: message.avatar_url }
  }
  const label = (message?.hero_name || message?.username || '익명').trim()
  return { type: 'initials', text: label ? label[0].toUpperCase() : '?' }
}

export default function ChatPage() {
  const [viewer, setViewer] = useState({ id: null, ownerId: null, email: null, heroId: null })
  const [dashboard, setDashboard] = useState({ heroes: [], rooms: [], publicRooms: [], sessions: [], contacts: [] })
  const [context, setContext] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [activeTab, setActiveTab] = useState('info')
  const [roomSearch, setRoomSearch] = useState('')
  const [roomResults, setRoomResults] = useState([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [createState, setCreateState] = useState({ ...INITIAL_CREATE_STATE })
  const [showCreate, setShowCreate] = useState(false)
  const [hasActiveKey, setHasActiveKey] = useState(false)
  const [selectedHeroId, setSelectedHeroId] = useState('')
  const subscriptionRef = useRef(null)
  const messageListRef = useRef(null)

  const sessionLookup = useMemo(() => {
    const map = new Map()
    const sessions = Array.isArray(dashboard.sessions) ? dashboard.sessions : []
    sessions.forEach((session) => {
      if (session && session.session_id) {
        map.set(session.session_id, session)
      }
    })
    return map
  }, [dashboard.sessions])

  const activeSession = useMemo(() => {
    if (!context?.sessionId) {
      return null
    }
    return sessionLookup.get(context.sessionId) || context.session || null
  }, [context, sessionLookup])

  const sessionWindow = useMemo(
    () => computeSessionSpeakWindow(activeSession, viewer, context),
    [activeSession, viewer, context],
  )

  const subscriptionKey = useMemo(() => {
    if (!context) return 'messages-global'
    if (context.chatRoomId) return `messages-room-${context.chatRoomId}`
    if (context.sessionId) return `messages-session-${context.sessionId}-${context.scope || 'main'}`
    if (context.scope === 'whisper' && (context.targetHeroId || context.targetOwnerId)) {
      return `messages-whisper-${context.targetHeroId || context.targetOwnerId}`
    }
    return `messages-${context.scope || 'global'}`
  }, [context])

  const refreshDashboard = useCallback(async () => {
    try {
      const snapshot = await fetchChatDashboard({ limit: 36 })
      setDashboard(snapshot)
      return snapshot
    } catch (error) {
      console.error('[chat] 대시보드 로드 실패:', error)
      throw error
    }
  }, [])

  const loadMessages = useCallback(
    async (targetContext) => {
      const current = targetContext || context
      if (!current) {
        setMessages([])
        return
      }
      setLoadingMessages(true)
      try {
        const response = await fetchRecentMessages({
          limit: 200,
          sessionId: current.sessionId || null,
          matchInstanceId: current.matchInstanceId || null,
          chatRoomId: current.chatRoomId || null,
          scope: current.scope || null,
        })
        const prepared = Array.isArray(response.messages)
          ? response.messages.map((msg) => ({
              ...msg,
              hero_name: msg.hero_name || msg.username || '익명',
            }))
          : []
        setMessages(prepared)
        setTimeout(() => {
          if (messageListRef.current) {
            messageListRef.current.scrollTop = messageListRef.current.scrollHeight
          }
        }, 80)
      } catch (error) {
        console.error('[chat] 메시지 로드 실패:', error)
      } finally {
        setLoadingMessages(false)
      }
    },
    [context],
  )

  const setupSubscription = useCallback(
    (targetContext) => {
      if (subscriptionRef.current) {
        subscriptionRef.current()
        subscriptionRef.current = null
      }
      const current = targetContext || context
      if (!current) return
      const unsubscribe = subscribeToMessages({
        sessionId: current.sessionId || null,
        matchInstanceId: current.matchInstanceId || null,
        chatRoomId: current.chatRoomId || null,
        scope: current.scope || null,
        ownerId: viewer?.ownerId || viewer?.id || null,
        heroId: current.heroId || selectedHeroId || viewer?.heroId || null,
        channelName: subscriptionKey,
        onInsert: (record) => {
          setMessages((prev) => {
            if (prev.some((item) => item.id === record.id)) {
              return prev
            }
            return [
              ...prev,
              {
                ...record,
                hero_name: record.hero_name || record.username || '익명',
              },
            ]
          })
          setTimeout(() => {
            if (messageListRef.current) {
              messageListRef.current.scrollTop = messageListRef.current.scrollHeight
            }
          }, 60)
        },
      })
      subscriptionRef.current = unsubscribe
    },
    [context, viewer, subscriptionKey, selectedHeroId],
  )

  useEffect(() => {
    ;(async () => {
      try {
        const [user] = await Promise.all([getCurrentUser().catch(() => null), refreshDashboard()])
        if (user) {
          setViewer((prev) => ({
            id: user.id,
            ownerId: user.id,
            email: user.email,
            heroId: prev?.heroId || null,
          }))
        } else {
          setViewer({ id: null, ownerId: null, email: null, heroId: null })
        }
        const snapshot = readRankKeyringSnapshot()
        setHasActiveKey(snapshot?.entries?.some((entry) => entry.isActive) || false)
      } catch (error) {
        console.warn('[chat] 초기화 실패:', error)
      }
    })()
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current()
        subscriptionRef.current = null
      }
    }
  }, [refreshDashboard])

  useEffect(() => {
    if (!selectedHeroId) {
      const heroes = Array.isArray(dashboard.heroes) ? dashboard.heroes : []
      if (heroes.length) {
        setSelectedHeroId((prev) => prev || heroes[0].id)
        setViewer((prev) => ({ ...prev, heroId: prev.heroId || heroes[0].id }))
      }
    }
  }, [dashboard.heroes, selectedHeroId])

  useEffect(() => {
    loadMessages(context)
    setupSubscription(context)
  }, [context, loadMessages, setupSubscription])

  const handleSelectContext = useCallback((nextContext, tabHint = null) => {
    if (!nextContext) return
    setContext(nextContext)
    setComposerText('')
    if (tabHint) {
      setActiveTab(tabHint)
    }
  }, [])

  useEffect(() => {
    if (!context) {
      setMessages([])
      setComposerText('')
    }
  }, [context])

  const contextHeroId = context?.heroId || null

  const effectiveHeroId = useMemo(() => {
    return contextHeroId || selectedHeroId || viewer.heroId || null
  }, [contextHeroId, selectedHeroId, viewer.heroId])

  const isChatActive = Boolean(context)

  const contentStyle = LAYOUT.content
  const sidePanelStyle = LAYOUT.sidePanel

  const messageComposerDisabled = useMemo(() => {
    if (!context) return true
    if (context.scope === 'role' && !context.viewerRole) return true
    if (context.scope === 'whisper' && !context.targetHeroId && !context.targetOwnerId) return true
    if ((context.scope === 'main' || context.scope === 'role') && !sessionWindow.canChat) return true
    return false
  }, [context, sessionWindow])

  const composerNotice = useMemo(() => {
    if (!context) return null
    if (context.scope === 'room' && context.description) {
      return { text: context.description, hint: null, active: true }
    }
    if (context.scope === 'whisper') {
      return { text: '선택한 참가자와의 귓속말입니다.', hint: null, active: true }
    }
    if ((context.scope === 'main' || context.scope === 'role') && (sessionWindow.notice || sessionWindow.hint)) {
      return {
        text: sessionWindow.notice || '턴 정보를 확인하세요.',
        hint: sessionWindow.hint,
        active: sessionWindow.canChat && !sessionWindow.notice,
      }
    }
    return null
  }, [context, sessionWindow])

  const handleSendMessage = useCallback(
    async (event) => {
      event?.preventDefault?.()
      const text = composerText.trim()
      if (!text || !context) return
      if ((context.scope === 'main' || context.scope === 'role') && !sessionWindow.canChat) {
        console.warn('[chat] 현재 턴이 아니므로 메시지를 전송할 수 없습니다.')
        return
      }
      try {
        await insertMessage(
          {
            text,
            scope: context.scope || 'global',
            hero_id: effectiveHeroId,
            target_hero_id: context.targetHeroId || null,
            target_role: context.scope === 'role' ? context.viewerRole || context.targetRole || null : null,
          },
          {
            sessionId: context.sessionId || null,
            matchInstanceId: context.matchInstanceId || null,
            gameId: context.gameId || null,
            roomId: context.rankRoomId || null,
            chatRoomId: context.chatRoomId || null,
          },
        )
        setComposerText('')
      } catch (error) {
        console.error('[chat] 메시지 전송 실패:', error)
      }
    },
    [composerText, context, effectiveHeroId, sessionWindow],
  )

  const handleSendAiMessage = useCallback(async () => {
    const text = composerText.trim()
    if (!text || !context) return
    if ((context.scope === 'main' || context.scope === 'role') && !sessionWindow.canChat) {
      return
    }
    setAiBusy(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) {
        throw new Error('세션 정보를 불러오지 못했습니다.')
      }
      const response = await fetch('/api/chat/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: text,
          scope: context.scope,
          sessionId: context.sessionId || null,
          matchInstanceId: context.matchInstanceId || null,
          chatRoomId: context.chatRoomId || null,
        }),
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail?.detail || 'AI 응답 요청에 실패했습니다.')
      }
      const payload = await response.json()
      const aiText = typeof payload?.text === 'string' ? payload.text.trim() : ''
      if (aiText) {
        await insertMessage(
          {
            text: aiText,
            scope: context.scope || 'global',
            metadata: { origin: 'ai' },
            hero_id: effectiveHeroId,
          },
          {
            sessionId: context.sessionId || null,
            matchInstanceId: context.matchInstanceId || null,
            gameId: context.gameId || null,
            roomId: context.rankRoomId || null,
            chatRoomId: context.chatRoomId || null,
          },
        )
      }
      setComposerText('')
    } catch (error) {
      console.error('[chat] AI 응답 실패:', error)
    } finally {
      setAiBusy(false)
    }
  }, [composerText, context, effectiveHeroId, sessionWindow])

  const handleCreateRoom = useCallback(
    async (event) => {
      event?.preventDefault?.()
      const { name, description, visibility, capacity, allowAi, requireApproval, heroId } = createState
      try {
        const room = await createChatRoom({
          name,
          description,
          visibility,
          capacity,
          allowAi,
          requireApproval,
          heroId: heroId || selectedHeroId || null,
        })
        const snapshot = await refreshDashboard()
        const roomSnapshot = (snapshot.rooms || []).find((entry) => entry.id === room.id) || room
        handleSelectContext(buildRoomContext(roomSnapshot), 'private')
        setCreateState({ ...INITIAL_CREATE_STATE })
        setShowCreate(false)
      } catch (error) {
        console.error('[chat] 방 생성 실패:', error)
      }
    },
    [createState, handleSelectContext, refreshDashboard, selectedHeroId],
  )

  const handleJoinRoom = useCallback(
    async (roomId, tabHint = 'open') => {
      if (!roomId) return
      try {
        await joinChatRoom({ roomId })
        const snapshot = await refreshDashboard()
        const room = (snapshot.rooms || []).find((entry) => entry.id === roomId)
        handleSelectContext(buildRoomContext(room || { id: roomId }), tabHint)
      } catch (error) {
        console.error('[chat] 방 참가 실패:', error)
      }
    },
    [handleSelectContext, refreshDashboard],
  )

  const handleLeaveRoom = useCallback(
    async (roomId, nextTab = 'info') => {
      if (!roomId) return
      try {
        await leaveChatRoom({ roomId })
        await refreshDashboard()
        setContext(null)
        setMessages([])
        setComposerText('')
        setActiveTab(nextTab)
      } catch (error) {
        console.error('[chat] 방 나가기 실패:', error)
      }
    },
    [refreshDashboard],
  )

  const runRoomSearch = useCallback(
    async (event) => {
      event?.preventDefault?.()
      setSearchBusy(true)
      try {
        const result = await fetchChatRooms({ search: roomSearch, limit: 24 })
        setRoomResults(result.available || [])
      } catch (error) {
        console.error('[chat] 방 검색 실패:', error)
      } finally {
        setSearchBusy(false)
      }
    },
    [roomSearch],
  )

  const privateRooms = useMemo(() => {
    const rooms = Array.isArray(dashboard.rooms) ? dashboard.rooms : []
    return rooms.filter((room) => (room.visibility || 'private') !== 'public')
  }, [dashboard.rooms])

  const joinedPublicRooms = useMemo(() => {
    const rooms = Array.isArray(dashboard.rooms) ? dashboard.rooms : []
    return rooms.filter((room) => (room.visibility || 'private') === 'public')
  }, [dashboard.rooms])

  const infoSessions = useMemo(() => {
    return Array.isArray(dashboard.sessions) ? dashboard.sessions : []
  }, [dashboard.sessions])

  const contacts = useMemo(() => {
    return Array.isArray(dashboard.contacts) ? dashboard.contacts : []
  }, [dashboard.contacts])

  const publicRooms = useMemo(() => {
    const rooms = Array.isArray(dashboard.publicRooms) ? dashboard.publicRooms : []
    const filtered = rooms.filter((room) => {
      const roomId = normalizeId(room?.id)
      return roomId && roomId !== normalizeId(GLOBAL_ROOM_CARD.id)
    })
    return [GLOBAL_ROOM_CARD, ...filtered]
  }, [dashboard.publicRooms])

  const activeHero = useMemo(() => {
    const heroes = Array.isArray(dashboard.heroes) ? dashboard.heroes : []
    return heroes.find((hero) => hero.id === selectedHeroId) || null
  }, [dashboard.heroes, selectedHeroId])

  return (
    <>
      <Head>
        <title>채팅 허브 · Starbase</title>
      </Head>
      <main style={LAYOUT.page}>
        <div style={LAYOUT.viewport}>
          <header style={LAYOUT.header}>
            <div style={LAYOUT.titleGroup}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>채팅 허브</h1>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 14 }}>
                영웅을 선택하고 방을 이동해 실시간으로 대화하세요.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>사용 영웅</span>
                <select
                  value={selectedHeroId}
                  onChange={(event) => {
                    const next = event.target.value
                    setSelectedHeroId(next)
                    setViewer((prev) => ({ ...prev, heroId: next }))
                  }}
                  style={{
                    minWidth: 180,
                    padding: '10px 14px',
                    borderRadius: 14,
                    border: '1px solid rgba(148, 163, 184, 0.28)',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: '#f8fafc',
                  }}
                >
                  {(dashboard.heroes || []).map((hero) => (
                    <option key={hero.id} value={hero.id}>
                      {hero.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                style={LAYOUT.button('ghost')}
                onClick={() => {
                  setShowCreate((prev) => !prev)
                  setActiveTab('private')
                }}
              >
                새 방 만들기
              </button>
            </div>
          </header>
          <div style={contentStyle}>
            {!isChatActive ? (
              <section style={sidePanelStyle}>
              <div>
                <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>
                  {TABS.find((tab) => tab.id === activeTab)?.label || '정보'}
                </h2>
                <div style={LAYOUT.scrollStack}>
                  {activeTab === 'info' ? (
                    <>
                      <section style={LAYOUT.card}>
                        <strong style={{ fontSize: 14 }}>내 영웅</strong>
                        {activeHero ? (
                          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>{activeHero.description || '선택한 영웅으로 메시지를 전송합니다.'}</p>
                        ) : (
                          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>사용할 영웅을 선택하세요.</p>
                        )}
                      </section>
                      <section style={{ display: 'grid', gap: 12 }}>
                        <h3 style={{ margin: '8px 0 0', fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>
                          세션
                        </h3>
                        {infoSessions.length ? (
                          infoSessions.map((session) => (
                            <article key={session.session_id} style={LAYOUT.card}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <strong style={{ fontSize: 14 }}>{session.game_name || '세션'}</strong>
                                  <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 12 }}>
                                    {session.status || '진행 중'}
                                  </p>
                                </div>
                                <span style={LAYOUT.badge}>{session.viewer_role ? `내 역할 ${session.viewer_role}` : '참가자'}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                <button
                                  type="button"
                                  style={LAYOUT.smallButton(
                                    context?.sessionId === session.session_id && context?.scope === 'main',
                                  )}
                                  onClick={() => handleSelectContext(buildSessionContext(session, 'main', viewer), 'info')}
                                >
                                  메인 대화
                                </button>
                                {session.viewer_role ? (
                                  <button
                                    type="button"
                                    style={LAYOUT.smallButton(
                                      context?.sessionId === session.session_id && context?.scope === 'role',
                                    )}
                                    onClick={() => handleSelectContext(buildSessionContext(session, 'role', viewer), 'info')}
                                  >
                                    역할 대화
                                  </button>
                                ) : null}
                              </div>
                            </article>
                          ))
                        ) : (
                          <p style={LAYOUT.empty}>참여 중인 세션이 없습니다.</p>
                        )}
                      </section>
                      <section style={{ display: 'grid', gap: 12 }}>
                        <h3 style={{ margin: '8px 0 0', fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>
                          친구 & 귓속말
                        </h3>
                        {contacts.length ? (
                          contacts.map((contact) => {
                            const ctx = buildWhisperContext(contact)
                            return (
                              <button
                                key={`${contact.owner_id}-${contact.hero_id}`}
                                type="button"
                                style={LAYOUT.smallButton(
                                  context?.scope === 'whisper' && context?.targetHeroId === ctx.targetHeroId,
                                )}
                                onClick={() => handleSelectContext(ctx, 'info')}
                              >
                                <span>{contact.hero_name || '이름 없음'}</span>
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>{contact.role || '참가자'}</span>
                              </button>
                            )
                          })
                        ) : (
                          <p style={LAYOUT.empty}>최근 대화한 친구가 없습니다.</p>
                        )}
                      </section>
                    </>
                  ) : null}

                  {activeTab === 'private' ? (
                    <>
                      {showCreate ? (
                        <form onSubmit={handleCreateRoom} style={LAYOUT.card}>
                          <strong style={{ fontSize: 14, marginBottom: 6 }}>새 비공개 방</strong>
                          <input
                            type="text"
                            placeholder="방 이름"
                            value={createState.name}
                            onChange={(event) => setCreateState((prev) => ({ ...prev, name: event.target.value }))}
                            style={{ ...LAYOUT.textInput, minHeight: 44 }}
                          />
                          <textarea
                            placeholder="설명"
                            value={createState.description}
                            onChange={(event) =>
                              setCreateState((prev) => ({ ...prev, description: event.target.value }))
                            }
                            style={{
                              ...LAYOUT.textInput,
                              minHeight: 88,
                              resize: 'vertical',
                              padding: '12px 16px',
                            }}
                          />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" style={LAYOUT.button('primary')}>
                              생성
                            </button>
                            <button
                              type="button"
                              style={LAYOUT.button('ghost')}
                              onClick={() => {
                                setShowCreate(false)
                                setCreateState({ ...INITIAL_CREATE_STATE })
                              }}
                            >
                              취소
                            </button>
                          </div>
                        </form>
                      ) : null}
                      {privateRooms.length ? (
                        privateRooms.map((room) => (
                          <article key={room.id} style={LAYOUT.card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: 14 }}>{room.name}</strong>
                              <span style={LAYOUT.badge}>{room.member_count ?? 0}명</span>
                            </div>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
                              {room.description || '설명 없음'}
                            </p>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button
                                type="button"
                                style={LAYOUT.smallButton(
                                  context?.chatRoomId === room.id && context?.scope === 'room',
                                )}
                                onClick={() => handleSelectContext(buildRoomContext(room), 'private')}
                              >
                                대화 열기
                              </button>
                              <button
                                type="button"
                                style={LAYOUT.smallButton(false)}
                                onClick={() => handleLeaveRoom(room.id, 'private')}
                              >
                                나가기
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p style={LAYOUT.empty}>참여 중인 비공개 방이 없습니다.</p>
                      )}
                    </>
                  ) : null}

                  {activeTab === 'open' ? (
                    <>
                      {joinedPublicRooms.length ? (
                        <section style={{ display: 'grid', gap: 12 }}>
                          <h3 style={{ margin: '0 0 0', fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>
                            참여 중인 공개 방
                          </h3>
                          {joinedPublicRooms.map((room) => (
                            <article key={room.id} style={LAYOUT.card}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ fontSize: 14 }}>{room.name}</strong>
                                <span style={LAYOUT.badge}>{room.member_count ?? 0}명</span>
                              </div>
                              <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
                                {room.description || '설명 없음'}
                              </p>
                              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button
                                  type="button"
                                  style={LAYOUT.smallButton(
                                    context?.chatRoomId === room.id && context?.scope === 'room',
                                  )}
                                  onClick={() => handleSelectContext(buildRoomContext(room), 'open')}
                                >
                                  대화 열기
                                </button>
                                <button
                                  type="button"
                                  style={LAYOUT.smallButton(false)}
                                  onClick={() => handleLeaveRoom(room.id, 'open')}
                                >
                                  나가기
                                </button>
                              </div>
                            </article>
                          ))}
                        </section>
                      ) : null}
                      <form onSubmit={runRoomSearch} style={LAYOUT.card}>
                        <strong style={{ fontSize: 14, marginBottom: 6 }}>공개 방 검색</strong>
                        <input
                          type="text"
                          value={roomSearch}
                          onChange={(event) => setRoomSearch(event.target.value)}
                          placeholder="방 이름 또는 설명"
                          style={{ ...LAYOUT.textInput, minHeight: 44 }}
                        />
                        <button type="submit" style={LAYOUT.button('primary')} disabled={searchBusy}>
                          {searchBusy ? '검색 중…' : '검색'}
                        </button>
                        {roomResults.length ? (
                          <div style={{ display: 'grid', gap: 10 }}>
                            {roomResults.map((room) => (
                              <button
                                key={room.id}
                                type="button"
                                style={LAYOUT.smallButton(false)}
                                onClick={() => handleJoinRoom(room.id, 'open')}
                              >
                                <span>{room.name}</span>
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>{room.member_count ?? 0}명</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </form>
                      <section style={{ display: 'grid', gap: 12 }}>
                        <h3 style={{ margin: '0 0 0', fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>
                          추천 공개 방
                        </h3>
                        {publicRooms.length ? (
                          publicRooms.map((room) => {
                            const isGlobal =
                              room?.builtin === 'global' ||
                              normalizeId(room?.id) === normalizeId(GLOBAL_ROOM_CARD.id)
                            const memberLabel = isGlobal ? '전체' : `${room.member_count ?? 0}명`
                            const description = room.description || (isGlobal ? '모두가 참여하는 기본 채널입니다.' : '설명 없음')
                            return (
                              <article key={room.id} style={LAYOUT.card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <strong style={{ fontSize: 14 }}>{room.name}</strong>
                                  <span style={LAYOUT.badge}>{memberLabel}</span>
                                </div>
                                <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>{description}</p>
                                <button
                                  type="button"
                                  style={{ ...LAYOUT.smallButton(false), marginTop: 8 }}
                                  onClick={() =>
                                    isGlobal
                                      ? handleSelectContext(buildGlobalContext(), 'open')
                                      : handleJoinRoom(room.id, 'open')
                                  }
                                >
                                  {isGlobal ? '입장하기' : '참가하기'}
                                </button>
                              </article>
                            )
                          })
                        ) : (
                          <p style={LAYOUT.empty}>추천할 공개 방이 없습니다.</p>
                        )}
                      </section>
                    </>
                  ) : null}
                </div>
              </div>
              </section>
            ) : null}
            {isChatActive ? (
              <section style={LAYOUT.messagePanel}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => setContext(null)}
                      style={LAYOUT.button('ghost')}
                    >
                      ← 목록으로
                    </button>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{context?.label || '대화'}</h2>
                      <div style={{ display: 'flex', gap: 12, color: '#94a3b8', fontSize: 12, flexWrap: 'wrap' }}>
                        {context?.scope === 'global' ? <span>전체 채널</span> : null}
                        {context?.scope === 'room' ? (
                          <span>{context?.visibility === 'public' ? '공개 방' : '비공개 방'}</span>
                        ) : null}
                        {context?.scope === 'role' && context?.viewerRole ? <span>{context.viewerRole}</span> : null}
                        {context?.memberCount != null ? <span>{context.memberCount}명 참여</span> : null}
                      </div>
                    </div>
                  </div>
                  {context?.type === 'chatRoom' && context?.chatRoomId ? (
                    <button
                      type="button"
                      onClick={() => handleLeaveRoom(context.chatRoomId, context?.visibility === 'public' ? 'open' : 'private')}
                      style={LAYOUT.button('danger')}
                    >
                      방 나가기
                    </button>
                  ) : null}
                </div>
                <div ref={messageListRef} style={LAYOUT.messageList}>
                  {loadingMessages ? (
                    <p style={LAYOUT.empty}>메시지를 불러오는 중입니다…</p>
                  ) : messages.length ? (
                    messages.map((message) => {
                      const avatar = resolveAvatar(message)
                      return (
                        <article key={message.id} style={LAYOUT.messageCard}>
                          <header style={LAYOUT.messageHeader}>
                            <div style={LAYOUT.avatar}>
                              {avatar.type === 'image' ? (
                                <img
                                  src={avatar.url}
                                  alt={message.hero_name || message.username}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                avatar.text
                              )}
                            </div>
                            <div style={{ display: 'grid', gap: 2 }}>
                              <strong style={{ fontSize: 15 }}>{message.hero_name || message.username || '익명'}</strong>
                              <span style={{ color: '#94a3b8', fontSize: 12 }}>{formatTime(message.created_at)}</span>
                            </div>
                          </header>
                          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: '#f8fafc' }}>{message.text}</p>
                        </article>
                      )
                    })
                  ) : (
                    <p style={LAYOUT.empty}>아직 메시지가 없습니다.</p>
                  )}
                </div>
                <div style={LAYOUT.composer}>
                  {composerNotice ? (
                    <div style={LAYOUT.notice(composerNotice.active)}>
                      <span>{composerNotice.text}</span>
                      {composerNotice.hint ? (
                        <span style={{ display: 'block', marginTop: 4, opacity: 0.8 }}>{composerNotice.hint}</span>
                      ) : null}
                    </div>
                  ) : null}
                  <form onSubmit={handleSendMessage} style={LAYOUT.composerRow}>
                    <input
                      type="text"
                      placeholder="메시지를 입력하세요"
                      value={composerText}
                      onChange={(event) => setComposerText(event.target.value)}
                      style={LAYOUT.textInput}
                      disabled={messageComposerDisabled}
                    />
                    <button type="submit" style={LAYOUT.button('primary', messageComposerDisabled)} disabled={messageComposerDisabled}>
                      전송
                    </button>
                    <button
                      type="button"
                      style={LAYOUT.button('ghost', !hasActiveKey || aiBusy || messageComposerDisabled)}
                      disabled={!hasActiveKey || aiBusy || messageComposerDisabled}
                      onClick={handleSendAiMessage}
                    >
                      {aiBusy ? 'AI 응답 중…' : 'AI 응답'}
                    </button>
                  </form>
                </div>
              </section>
            ) : null}
          </div>
          <nav style={LAYOUT.tabBar}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                style={LAYOUT.tabButton(activeTab === tab.id)}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id === 'info') {
                    setContext(null)
                    setMessages([])
                    setComposerText('')
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </main>
    </>
  )
}
