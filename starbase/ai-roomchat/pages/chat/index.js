import Head from 'next/head'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createChatRoom, fetchChatDashboard, fetchChatRooms, joinChatRoom, leaveChatRoom } from '@/lib/chat/rooms'
import { fetchRecentMessages, getCurrentUser, insertMessage, subscribeToMessages } from '@/lib/chat/messages'
import { readRankKeyringSnapshot } from '@/lib/rank/keyringStorage'
import { supabase } from '@/lib/supabase'

const LAYOUT = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at top, rgba(15,23,42,0.95) 0%, rgba(2,6,23,0.94) 58%, rgba(2,6,23,1) 100%)',
    color: '#e2e8f0',
    padding: '48px 24px 96px',
    boxSizing: 'border-box',
  },
  shell: {
    maxWidth: 1280,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: '320px 1fr 320px',
    gap: 24,
    alignItems: 'flex-start',
  },
  panel: {
    background: 'rgba(15, 23, 42, 0.82)',
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.22)',
    boxShadow: '0 32px 80px -48px rgba(15, 23, 42, 0.9)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 480,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    margin: 0,
    color: '#cbd5f5',
  },
  sectionHeader: {
    padding: '20px 24px 12px',
    borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionBody: {
    padding: '16px 24px 24px',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 220px)',
  },
  list: {
    display: 'grid',
    gap: 12,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  contextButton: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 14,
    background: active ? 'rgba(59, 130, 246, 0.22)' : 'rgba(15, 23, 42, 0.55)',
    border: active ? '1px solid rgba(147, 197, 253, 0.45)' : '1px solid rgba(148, 163, 184, 0.16)',
    color: active ? '#f8fafc' : '#cbd5f5',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }),
  badge: {
    marginLeft: 'auto',
    padding: '2px 8px',
    borderRadius: 999,
    background: 'rgba(148, 163, 184, 0.18)',
    color: '#cbd5f5',
    fontSize: 12,
    fontWeight: 700,
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 28px',
    display: 'grid',
    gap: 18,
    background: 'rgba(8, 11, 20, 0.45)',
  },
  messageItem: {
    borderRadius: 20,
    padding: '18px 20px',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(15, 23, 42, 0.72)',
    display: 'grid',
    gap: 10,
  },
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    overflow: 'hidden',
    flex: '0 0 auto',
    background: 'rgba(30, 41, 59, 0.66)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 700,
  },
  messageMeta: {
    display: 'flex',
    gap: 10,
    fontSize: 13,
    color: '#94a3b8',
    flexWrap: 'wrap',
  },
  messageContent: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.6,
    color: '#f8fafc',
    wordBreak: 'break-word',
  },
  composerShell: {
    borderTop: '1px solid rgba(148, 163, 184, 0.16)',
    padding: '18px 24px',
    display: 'grid',
    gap: 14,
    background: 'rgba(10, 16, 29, 0.82)',
  },
  composerNotice: (active = false) => ({
    padding: '12px 16px',
    borderRadius: 16,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.35)'
      : '1px solid rgba(248, 113, 113, 0.25)',
    background: active
      ? 'rgba(59, 130, 246, 0.16)'
      : 'rgba(248, 113, 113, 0.12)',
    color: active ? '#bfdbfe' : '#fecaca',
    fontSize: 13,
    lineHeight: 1.5,
  }),
  composerRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  textInput: {
    flex: '1 1 260px',
    minHeight: 48,
    padding: '12px 16px',
    borderRadius: 16,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    background: 'rgba(15, 23, 42, 0.75)',
    color: '#f8fafc',
    fontSize: 15,
  },
  button: (variant = 'primary', disabled = false) => {
    const palette = {
      primary: {
        background: disabled ? 'rgba(59, 130, 246, 0.24)' : 'rgba(59, 130, 246, 0.85)',
        color: disabled ? '#94a3b8' : '#f8fafc',
      },
      subtle: {
        background: 'rgba(15, 23, 42, 0.6)',
        color: '#cbd5f5',
      },
      danger: {
        background: 'rgba(248, 113, 113, 0.18)',
        color: '#fecaca',
      },
    }
    const tone = palette[variant] || palette.primary
    return {
      padding: '12px 18px',
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
  tabGroup: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  tabButton: (active) => ({
    padding: '6px 14px',
    borderRadius: 14,
    border: active ? '1px solid rgba(147, 197, 253, 0.45)' : '1px solid rgba(148, 163, 184, 0.18)',
    background: active ? 'rgba(59, 130, 246, 0.2)' : 'rgba(15, 23, 42, 0.5)',
    color: active ? '#f8fafc' : '#cbd5f5',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }),
  emptyState: {
    padding: '48px 0',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 15,
  },
  participantList: {
    display: 'grid',
    gap: 10,
    margin: '12px 0 0',
    padding: 0,
    listStyle: 'none',
  },
  participantItem: (active, isViewer) => ({
    padding: '12px 14px',
    borderRadius: 16,
    border: active
      ? '1px solid rgba(96, 165, 250, 0.45)'
      : '1px solid rgba(148, 163, 184, 0.18)',
    background: active
      ? 'rgba(59, 130, 246, 0.2)'
      : 'rgba(15, 23, 42, 0.5)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: '#e2e8f0',
    fontWeight: isViewer ? 700 : 500,
  }),
}

const DEFAULT_CONTEXT = {
  type: 'global',
  scope: 'global',
  label: '전체 채팅',
}

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

function buildRoomContext(room) {
  if (!room) return null
  return {
    type: 'chatRoom',
    scope: 'room',
    chatRoomId: room.id,
    roomId: room.id,
    label: room.name || '대화방',
    description: room.description || '',
    memberCount: room.member_count || 0,
    visibility: room.visibility || 'public',
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

  if (Array.isArray(turnState.activeOwners)) {
    turnState.activeOwners.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        pushOwner(entry.ownerId || entry.owner_id)
        pushHero(entry.heroId || entry.hero_id)
        pushRole(entry.role)
      } else {
        pushOwner(entry)
      }
    })
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
    return { canChat: true, notice: null, hint: null, activeOwners: new Set(), activeHeroes: new Set(), activeRoles: new Set() }
  }

  if (context.scope === 'room' || context.scope === 'whisper') {
    return { canChat: true, notice: null, hint: null, activeOwners: new Set(), activeHeroes: new Set(), activeRoles: new Set() }
  }

  const turnState = (session.turn_state || session.turnState || null) ?? {}
  const mode = String(session.realtime_mode || turnState.mode || turnState.matchMode || '')
    .trim()
    .toLowerCase()
  if (mode && mode !== 'realtime' && mode !== 'live') {
    return { canChat: true, notice: null, hint: null, activeOwners: new Set(), activeHeroes: new Set(), activeRoles: new Set() }
  }

  const status = String(turnState.status || turnState.phase || '')
    .trim()
    .toLowerCase()
  const locked = Boolean(turnState.locked || turnState.inputLocked || status === 'paused' || status === 'blocked')
  const allowAll =
    turnState.allowAll === true ||
    (typeof turnState.audience === 'string' && turnState.audience.toLowerCase() === 'all') ||
    (turnState.broadcast && String(turnState.broadcast).toLowerCase() === 'all')

  const { owners: activeOwners, heroes: activeHeroes, roles: activeRoles } = collectActiveMarkers(turnState)

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
  const [context, setContext] = useState(DEFAULT_CONTEXT)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [roomSearch, setRoomSearch] = useState('')
  const [roomResults, setRoomResults] = useState([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [createState, setCreateState] = useState({ ...INITIAL_CREATE_STATE })
  const [hasActiveKey, setHasActiveKey] = useState(false)
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

  const contextParticipants = useMemo(() => {
    if (!activeSession) return []
    const participants = Array.isArray(activeSession.participants) ? activeSession.participants : []
    if (!participants.length) return []
    const activeOwners = sessionWindow.activeOwners || new Set()
    const activeHeroes = sessionWindow.activeHeroes || new Set()
    const viewerToken = normalizeId(viewer?.ownerId || viewer?.id)
    return participants.map((participant) => {
      const ownerToken = normalizeId(participant.owner_id)
      const heroToken = normalizeId(participant.hero_id)
      const isActive = activeOwners.has(ownerToken) || activeHeroes.has(heroToken)
      const isViewer = viewerToken && ownerToken === viewerToken
      return {
        ...participant,
        isActive,
        isViewer,
      }
    })
  }, [activeSession, sessionWindow, viewer])

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
      if (!current) return
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
        onInsert: (record) => {
          setMessages((prev) => {
            if (prev.some((item) => item.id === record.id)) {
              return prev
            }
            const next = [...prev, { ...record, hero_name: record.hero_name || record.username || '익명' }]
            return next
          })
        },
        sessionId: current.sessionId || null,
        matchInstanceId: current.matchInstanceId || null,
        gameId: current.gameId || null,
        roomId: current.roomId || null,
        chatRoomId: current.chatRoomId || null,
        heroId: current.heroId || null,
        ownerId: viewer?.ownerId || viewer?.id || null,
        userId: viewer?.id || null,
        channelName: subscriptionKey,
      })
      subscriptionRef.current = unsubscribe
    },
    [context, viewer, subscriptionKey],
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
    loadMessages(context)
    setupSubscription(context)
  }, [context, loadMessages, setupSubscription])

  const handleSelectContext = useCallback((nextContext) => {
    if (!nextContext) return
    setContext(nextContext)
    setComposerText('')
  }, [])

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
            hero_id: context.heroId || null,
            target_hero_id: context.targetHeroId || null,
            target_role: context.scope === 'role' ? context.viewerRole || context.targetRole || null : null,
          },
          {
            sessionId: context.sessionId || null,
            matchInstanceId: context.matchInstanceId || null,
            gameId: context.gameId || null,
            roomId: context.roomId || null,
            chatRoomId: context.chatRoomId || null,
          },
        )
        setComposerText('')
      } catch (error) {
        console.error('[chat] 메시지 전송 실패:', error)
      }
    },
    [composerText, context, sessionWindow],
  )

  const handleSendAiMessage = useCallback(
    async () => {
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
            },
            {
              sessionId: context.sessionId || null,
              matchInstanceId: context.matchInstanceId || null,
              gameId: context.gameId || null,
              roomId: context.roomId || null,
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
    },
    [composerText, context, sessionWindow],
  )

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
          heroId: heroId || null,
        })
        await refreshDashboard()
        handleSelectContext(buildRoomContext(room))
        setCreateState({ ...INITIAL_CREATE_STATE })
      } catch (error) {
        console.error('[chat] 방 생성 실패:', error)
      }
    },
    [createState, handleSelectContext, refreshDashboard],
  )

  const handleCreateSessionRoom = useCallback(
    async (session) => {
      if (!session) return
      try {
        const baseName = session.game_name ? `${session.game_name} 세션` : '세션 대화방'
        const turnState = session.turn_state || session.turnState || {}
        const rawTurn = turnState.turnNumber ?? turnState.turn_number
        const suffix = Number.isFinite(Number(rawTurn)) ? ` #${Number(rawTurn)}` : ''
        const viewerParticipant = resolveViewerParticipant(session, viewer)
        const room = await createChatRoom({
          name: `${baseName}${suffix}`,
          description: session.game_description || '',
          visibility: 'private',
          capacity: 24,
          allowAi: true,
          requireApproval: false,
          heroId: viewerParticipant?.hero_id || null,
        })
        const snapshot = await refreshDashboard()
        const roomSnapshot = (snapshot.rooms || []).find((entry) => entry.id === room.id) || room
        handleSelectContext(buildRoomContext(roomSnapshot))
      } catch (error) {
        console.error('[chat] 세션 전용 방 생성 실패:', error)
      }
    },
    [handleSelectContext, refreshDashboard, viewer],
  )

  const handleJoinRoom = useCallback(
    async (roomId) => {
      if (!roomId) return
      try {
        await joinChatRoom({ roomId })
        const snapshot = await refreshDashboard()
        const room = (snapshot.rooms || []).find((entry) => entry.id === roomId)
        handleSelectContext(buildRoomContext(room || { id: roomId }))
      } catch (error) {
        console.error('[chat] 방 참가 실패:', error)
      }
    },
    [handleSelectContext, refreshDashboard],
  )

  const handleLeaveRoom = useCallback(
    async (roomId) => {
      if (!roomId) return
      try {
        await leaveChatRoom({ roomId })
        await refreshDashboard()
        handleSelectContext(DEFAULT_CONTEXT)
      } catch (error) {
        console.error('[chat] 방 나가기 실패:', error)
      }
    },
    [refreshDashboard, handleSelectContext],
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

  const availableContexts = useMemo(() => {
    const joinedRooms = (dashboard.rooms || []).map((room) => ({
      kind: 'room',
      data: buildRoomContext(room),
    }))
    const sessions = (dashboard.sessions || []).flatMap((session) => {
      const entries = []
      const main = buildSessionContext(session, 'main', viewer)
      if (main) {
        entries.push({ kind: 'session', data: main })
      }
      if (session?.viewer_role) {
        const roleContext = buildSessionContext(session, 'role', viewer)
        if (roleContext) {
          entries.push({ kind: 'session', data: roleContext })
        }
      }
      return entries
    })
    const contacts = (dashboard.contacts || []).map((contact) => ({
      kind: 'contact',
      data: buildWhisperContext(contact),
    }))

    return {
      global: DEFAULT_CONTEXT,
      rooms: joinedRooms.filter(Boolean).map((entry) => entry.data),
      sessions: sessions.filter(Boolean).map((entry) => entry.data),
      contacts: contacts.filter(Boolean).map((entry) => entry.data),
    }
  }, [dashboard, viewer])

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

  const contextRoomSummary = useMemo(() => {
    if (context?.scope !== 'room') return null
    return {
      description: context.description || '',
      memberCount: context.memberCount ?? null,
      visibility: context.visibility || 'private',
    }
  }, [context])

  const sessionHeaderInfo = useMemo(() => {
    if (!activeSession) return null
    const turnState = activeSession.turn_state || activeSession.turnState || {}
    const rawTurn = turnState.turnNumber ?? turnState.turn_number
    const turnNumber = Number.isFinite(Number(rawTurn)) ? Number(rawTurn) : null
    return {
      turnNumber,
      hint: sessionWindow.hint,
    }
  }, [activeSession, sessionWindow])

  return (
    <div style={LAYOUT.page}>
      <Head>
        <title>커뮤니티 채팅 라운지</title>
      </Head>
      <div style={{ maxWidth: 1280, margin: '0 auto 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800 }}>커뮤니티 채팅 라운지</h1>
          <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>
            게임 세션, 역할별 대화, 사설 대화방까지 하나의 화면에서 관리할 수 있습니다.
          </p>
        </div>
        <Link href="/match" style={{ ...LAYOUT.button('subtle'), textDecoration: 'none' }}>
          매칭 로비로 이동
        </Link>
      </div>
      <div style={LAYOUT.shell}>
        <aside style={LAYOUT.panel}>
          <div style={LAYOUT.sectionHeader}>
            <h2 style={LAYOUT.sectionTitle}>대화 맵</h2>
            <button
              type="button"
              style={LAYOUT.button('primary')}
              onClick={() => setCreateState((prev) => ({ ...prev, open: true }))}
            >
              새 방 만들기
            </button>
          </div>
          <div style={LAYOUT.sectionBody}>
            <div>
              <h3 style={{ ...LAYOUT.sectionTitle, fontSize: 15, marginBottom: 8 }}>기본</h3>
              <div style={LAYOUT.list}>
                <button
                  type="button"
                  onClick={() => handleSelectContext(DEFAULT_CONTEXT)}
                  style={LAYOUT.contextButton(context.type === 'global')}
                >
                  전체 채팅
                </button>
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <h3 style={{ ...LAYOUT.sectionTitle, fontSize: 15, marginBottom: 8 }}>내 방</h3>
              <div style={LAYOUT.list}>
                {(availableContexts.rooms.length &&
                  availableContexts.rooms.map((room) => (
                    <button
                      key={room.chatRoomId}
                      type="button"
                      onClick={() => handleSelectContext(room)}
                      style={LAYOUT.contextButton(context.chatRoomId === room.chatRoomId)}
                    >
                      <span>{room.label}</span>
                      <span style={LAYOUT.badge}>{room.memberCount ?? 0}명</span>
                    </button>
                  ))) || (
                  <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>참여 중인 대화방이 없습니다.</p>
                )}
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <h3 style={{ ...LAYOUT.sectionTitle, fontSize: 15, marginBottom: 8 }}>게임 세션</h3>
              <div style={LAYOUT.list}>
                {(availableContexts.sessions.length &&
                  availableContexts.sessions.map((entry) => (
                    <div key={`${entry.scope}-${entry.sessionId}`} style={{ display: 'grid', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleSelectContext(entry)}
                        style={LAYOUT.contextButton(
                          context.sessionId === entry.sessionId && context.scope === entry.scope,
                        )}
                      >
                        <span>{entry.label}</span>
                        {entry.scope === 'role' && entry.viewerRole ? (
                          <span style={LAYOUT.badge}>{entry.viewerRole}</span>
                        ) : null}
                      </button>
                      {entry.scope === 'main' ? (
                        <div style={LAYOUT.tabGroup}>
                          <button
                            type="button"
                            style={LAYOUT.button('subtle')}
                            onClick={() => handleCreateSessionRoom(entry.session)}
                          >
                            세션 방 생성
                          </button>
                          {entry.viewerRole ? (
                            <span style={{ ...LAYOUT.badge, background: 'rgba(59, 130, 246, 0.25)' }}>
                              내 역할 {entry.viewerRole}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))) || (
                  <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>참여 중인 세션이 없습니다.</p>
                )}
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <h3 style={{ ...LAYOUT.sectionTitle, fontSize: 15, marginBottom: 8 }}>연락처</h3>
              <div style={LAYOUT.list}>
                {(availableContexts.contacts.length &&
                  availableContexts.contacts.map((entry) => (
                    <button
                      key={`${entry.targetHeroId}-${entry.matchInstanceId}`}
                      type="button"
                      onClick={() => handleSelectContext(entry)}
                      style={LAYOUT.contextButton(
                        context.scope === 'whisper' && context.targetHeroId === entry.targetHeroId,
                      )}
                    >
                      <span>{entry.label}</span>
                    </button>
                  ))) || (
                  <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>최근 대화한 상대가 없습니다.</p>
                )}
              </div>
            </div>
            <form onSubmit={runRoomSearch} style={{ marginTop: 28, display: 'grid', gap: 12 }}>
              <input
                type="text"
                placeholder="공개 방 검색"
                value={roomSearch}
                onChange={(event) => setRoomSearch(event.target.value)}
                style={{ ...LAYOUT.textInput, minHeight: 40 }}
              />
              <button type="submit" style={LAYOUT.button('subtle')} disabled={searchBusy}>
                {searchBusy ? '검색 중…' : '검색'}
              </button>
              {roomResults.length ? (
                <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.16)', paddingTop: 12 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8' }}>검색 결과</h4>
                  <div style={LAYOUT.list}>
                    {roomResults.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => handleJoinRoom(room.id)}
                        style={LAYOUT.contextButton(false)}
                      >
                        <span>{room.name}</span>
                        <span style={LAYOUT.badge}>{room.member_count ?? 0}명</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </form>
          </div>
        </aside>
        <section style={{ ...LAYOUT.panel, minHeight: 600 }}>
          <div style={LAYOUT.sectionHeader}>
            <div>
              <h2 style={LAYOUT.sectionTitle}>{context?.label || '대화'}</h2>
              {context?.sessionId && sessionHeaderInfo ? (
                <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                  {sessionHeaderInfo.turnNumber != null ? `턴 ${sessionHeaderInfo.turnNumber}` : null}
                  {sessionHeaderInfo.turnNumber != null && sessionHeaderInfo.hint ? ' · ' : ''}
                  {sessionHeaderInfo.hint || null}
                </div>
              ) : null}
              <div style={LAYOUT.messageMeta}>
                {context?.scope === 'room' && (
                  <span>{context.visibility === 'public' ? '공개 방' : '비공개 방'}</span>
                )}
                {context?.scope === 'role' && context.viewerRole ? <span>{context.viewerRole}</span> : null}
                {contextRoomSummary?.memberCount != null ? (
                  <span>{contextRoomSummary.memberCount}명 참여</span>
                ) : null}
              </div>
            </div>
            {context?.type === 'chatRoom' && context.chatRoomId ? (
              <button
                type="button"
                onClick={() => handleLeaveRoom(context.chatRoomId)}
                style={LAYOUT.button('danger')}
              >
                방 나가기
              </button>
            ) : null}
          </div>
          <div ref={messageListRef} style={LAYOUT.messageList}>
            {loadingMessages ? (
              <p style={LAYOUT.emptyState}>메시지를 불러오는 중입니다…</p>
            ) : messages.length ? (
              messages.map((message) => {
                const avatar = resolveAvatar(message)
                return (
                  <article key={message.id} style={LAYOUT.messageItem}>
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
                      {message.thread_label && message.thread_scope !== 'global' ? (
                        <span style={LAYOUT.badge}>{message.thread_label}</span>
                      ) : null}
                    </header>
                    <p style={LAYOUT.messageContent}>{message.text}</p>
                  </article>
                )
              })
            ) : (
              <p style={LAYOUT.emptyState}>첫 메시지를 남겨보세요.</p>
            )}
          </div>
          <form onSubmit={handleSendMessage} style={LAYOUT.composerShell}>
            {composerNotice ? (
              <div style={LAYOUT.composerNotice(composerNotice.active)}>
                <div>{composerNotice.text}</div>
                {composerNotice.hint ? (
                  <div style={{ fontSize: 12, marginTop: 6, color: composerNotice.active ? '#cbd5f5' : '#fecaca' }}>
                    {composerNotice.hint}
                  </div>
                ) : null}
              </div>
            ) : null}
            <textarea
              style={LAYOUT.textInput}
              placeholder={messageComposerDisabled ? '이 대화에서는 지금 메시지를 보낼 수 없습니다.' : '메시지를 입력하세요.'}
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
              disabled={messageComposerDisabled}
            />
            <div style={LAYOUT.composerRow}>
              <button
                type="submit"
                style={LAYOUT.button('primary', messageComposerDisabled || !composerText.trim())}
                disabled={messageComposerDisabled || !composerText.trim()}
              >
                전송
              </button>
              <button
                type="button"
                style={LAYOUT.button('subtle', !hasActiveKey || aiBusy || !composerText.trim())}
                disabled={!hasActiveKey || aiBusy || !composerText.trim()}
                onClick={handleSendAiMessage}
              >
                {aiBusy ? 'AI 응답 생성 중…' : 'AI에게 응답 요청'}
              </button>
            </div>
          </form>
        </section>
        <aside style={LAYOUT.panel}>
          <div style={LAYOUT.sectionHeader}>
            <h2 style={LAYOUT.sectionTitle}>정보</h2>
          </div>
          <div style={LAYOUT.sectionBody}>
            {context?.sessionId && contextParticipants.length ? (
              <section>
                <h3 style={{ ...LAYOUT.sectionTitle, fontSize: 15, marginBottom: 8 }}>세션 참가자</h3>
                <ul style={LAYOUT.participantList}>
                  {contextParticipants.map((participant) => {
                    const avatar = participant.hero_image_url
                      ? { type: 'image', url: participant.hero_image_url }
                      : { type: 'initials', text: (participant.hero_name || participant.role || '?')[0]?.toUpperCase() || '?' }
                    const metaTokens = []
                    if (participant.role) metaTokens.push(participant.role)
                    if (participant.score != null) metaTokens.push(`점수 ${participant.score}`)
                    if (participant.rating != null) metaTokens.push(`레이팅 ${participant.rating}`)
                    const metaLine = metaTokens.join(' · ')
                    return (
                      <li
                        key={`${participant.owner_id}-${participant.hero_id || participant.role || 'slot'}`}
                        style={LAYOUT.participantItem(participant.isActive, participant.isViewer)}
                      >
                        <div style={LAYOUT.avatar}>
                          {avatar.type === 'image' ? (
                            <img
                              src={avatar.url}
                              alt={participant.hero_name || participant.role || '참가자'}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            avatar.text
                          )}
                        </div>
                        <div style={{ display: 'grid', gap: 2 }}>
                          <strong style={{ fontSize: 14 }}>{participant.hero_name || participant.role || '참가자'}</strong>
                          {metaLine ? <span style={{ fontSize: 12, color: '#94a3b8' }}>{metaLine}</span> : null}
                          {participant.isActive ? (
                            <span style={{ fontSize: 11, color: '#bfdbfe' }}>현재 차례</span>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
            {contextRoomSummary ? (
              <section style={{ marginTop: contextParticipants.length ? 24 : 0 }}>
                <h3 style={{ ...LAYOUT.sectionTitle, fontSize: 15, marginBottom: 8 }}>방 요약</h3>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
                  {contextRoomSummary.visibility === 'public' ? '공개 방' : '비공개 방'} ·
                  {contextRoomSummary.memberCount != null ? ` ${contextRoomSummary.memberCount}명 참여` : ' 인원 파악 중'}
                </p>
                {contextRoomSummary.description ? (
                  <p style={{ margin: '8px 0 0', color: '#cbd5f5', fontSize: 13 }}>{contextRoomSummary.description}</p>
                ) : null}
              </section>
            ) : null}
            <section style={{ marginTop: contextParticipants.length || contextRoomSummary ? 32 : 0 }}>
              <h3 style={{ ...LAYOUT.sectionTitle, fontSize: 15, marginBottom: 8 }}>내 캐릭터</h3>
              {(dashboard.heroes || []).length ? (
                <ul style={LAYOUT.list}>
                  {dashboard.heroes.map((hero) => (
                    <li key={hero.id} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(15, 23, 42, 0.55)', border: '1px solid rgba(148, 163, 184, 0.16)' }}>
                      <strong style={{ display: 'block', color: '#f8fafc' }}>{hero.name}</strong>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{hero.description || '설명 없음'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>등록된 캐릭터가 없습니다.</p>
              )}
            </section>
            <section style={{ marginTop: 32 }}>
              <h3 style={{ ...LAYOUT.sectionTitle, fontSize: 15, marginBottom: 8 }}>추천 공개 방</h3>
              {(dashboard.publicRooms || []).length ? (
                <div style={LAYOUT.list}>
                  {dashboard.publicRooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => handleJoinRoom(room.id)}
                      style={LAYOUT.contextButton(false)}
                    >
                      <span>{room.name}</span>
                      <span style={LAYOUT.badge}>{room.member_count ?? 0}명</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>추천할 공개 방이 없습니다.</p>
              )}
            </section>
          </div>
        </aside>
      </div>

      {createState.open ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <form
            onSubmit={handleCreateRoom}
            style={{
              width: '100%',
              maxWidth: 440,
              borderRadius: 24,
              padding: 28,
              background: 'rgba(15, 23, 42, 0.96)',
              border: '1px solid rgba(148, 163, 184, 0.24)',
              display: 'grid',
              gap: 16,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f8fafc' }}>새 대화방 만들기</h3>
            <input
              type="text"
              placeholder="방 이름"
              value={createState.name}
              onChange={(event) => setCreateState((prev) => ({ ...prev, name: event.target.value }))}
              style={LAYOUT.textInput}
              required
            />
            <textarea
              placeholder="방 설명"
              value={createState.description}
              onChange={(event) => setCreateState((prev) => ({ ...prev, description: event.target.value }))}
              style={{ ...LAYOUT.textInput, minHeight: 100 }}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ fontSize: 14, color: '#cbd5f5', display: 'flex', flexDirection: 'column', gap: 6 }}>
                공개 여부
                <select
                  value={createState.visibility}
                  onChange={(event) => setCreateState((prev) => ({ ...prev, visibility: event.target.value }))}
                  style={{ ...LAYOUT.textInput, minHeight: 42 }}
                >
                  <option value="private">비공개</option>
                  <option value="public">공개</option>
                </select>
              </label>
              <label style={{ fontSize: 14, color: '#cbd5f5', display: 'flex', flexDirection: 'column', gap: 6 }}>
                정원
                <input
                  type="number"
                  min={2}
                  max={500}
                  value={createState.capacity}
                  onChange={(event) =>
                    setCreateState((prev) => ({ ...prev, capacity: Number(event.target.value) }))
                  }
                  style={{ ...LAYOUT.textInput, minHeight: 42 }}
                />
              </label>
            </div>
            <label style={{ fontSize: 14, color: '#cbd5f5', display: 'flex', flexDirection: 'column', gap: 6 }}>
              대표 캐릭터
              <select
                value={createState.heroId}
                onChange={(event) => setCreateState((prev) => ({ ...prev, heroId: event.target.value }))}
                style={{ ...LAYOUT.textInput, minHeight: 42 }}
              >
                <option value="">선택 안 함</option>
                {(dashboard.heroes || []).map((hero) => (
                  <option key={hero.id} value={hero.id}>
                    {hero.name}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5f5' }}>
                <input
                  type="checkbox"
                  checked={createState.allowAi}
                  onChange={(event) => setCreateState((prev) => ({ ...prev, allowAi: event.target.checked }))}
                  style={{ width: 18, height: 18 }}
                />
                AI 응답 허용
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5f5' }}>
                <input
                  type="checkbox"
                  checked={createState.requireApproval}
                  onChange={(event) => setCreateState((prev) => ({ ...prev, requireApproval: event.target.checked }))}
                  style={{ width: 18, height: 18 }}
                />
                가입 승인 필요
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={LAYOUT.button('subtle')}
                onClick={() => setCreateState({ ...INITIAL_CREATE_STATE })}
              >
                취소
              </button>
              <button type="submit" style={LAYOUT.button('primary', !createState.name.trim())}>
                생성
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
