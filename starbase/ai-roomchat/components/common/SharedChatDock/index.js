'use client'

import React, { useEffect } from 'react'

import { ChatHeader } from './ChatHeader'
import { InputBar } from './InputBar'
import { MessageList } from './MessageList'
import { useSharedChatDock } from './useSharedChatDock'

export default function SharedChatDock({
  height = 'min(70vh, 520px)',
  heroId,
  extraWhisperTargets = [],
  blockedHeroes: externalBlockedHeroes,
  viewerHero = null,
  sessionId = null,
  matchInstanceId = null,
  gameId = null,
  roomId = null,
  roster = [],
  viewerRole = null,
  allowMainInput = true,
  onSelectHero,
  onUnreadChange,
  onBlockedHeroesChange,
  activeThreadId,
  onThreadChange,
  onUserSend,
  onMessageAlert,
  pollingEnabled = false,
}) {
  const {
    activeThread,
    availableTargets,
    blockedHeroSet,
    blockedHeroes,
    blockedHeroEntries,
    canSend,
    heroDirectory,
    input,
    listRef,
    me,
    primaryThreads,
    scope,
    scopeOptions,
    send,
    setActiveThread: setActiveThreadInternal,
    setBlockedHeroes,
    setInput,
    setScope,
    setWhisperTarget,
    threadList,
    totalUnread,
    unreadThreads,
    viewerHeroId,
    visibleMessages,
    whisperTarget,
    clearThread,
  } = useSharedChatDock({
    heroId,
    extraWhisperTargets,
    blockedHeroes: externalBlockedHeroes,
    viewerHero,
    sessionId,
    matchInstanceId,
    gameId,
    roomId,
    roster,
    viewerRole,
    allowMainInput,
    onSend: onUserSend,
    onNotify: onMessageAlert,
    pollingEnabled,
  })

  useEffect(() => {
    onUnreadChange?.(totalUnread)
  }, [onUnreadChange, totalUnread])

  useEffect(() => {
    onBlockedHeroesChange?.({ ids: blockedHeroes, entries: blockedHeroEntries })
  }, [blockedHeroEntries, blockedHeroes, onBlockedHeroesChange])

  const handleSelectHero = (hero) => {
    if (!hero) return
    const extended = {
      ...hero,
      blocked: hero.heroId ? blockedHeroSet.has(hero.heroId) : false,
      onToggleBlock: () => {
        if (!hero.heroId) return
        setBlockedHeroes((prev) => {
          if (prev.includes(hero.heroId)) {
            return prev.filter((id) => id !== hero.heroId)
          }
          return [...new Set([...prev, hero.heroId])]
        })
      },
    }
    onSelectHero?.(extended)
  }

  const threadTabs = React.useMemo(() => {
    const items = primaryThreads.map((thread) => ({
      id: thread.id,
      label: thread.label,
      unread: unreadThreads[thread.id] || 0,
      closable: false,
    }))

    for (const thread of threadList) {
      const threadId = thread.threadId || (thread.heroId ? `whisper:${thread.heroId}` : 'whisper')
      items.push({
        id: threadId,
        label: thread.heroName,
        unread: unreadThreads[threadId] || 0,
        closable: true,
      })
    }

    return items
  }, [primaryThreads, threadList, unreadThreads])

  const setActiveThread = React.useCallback(
    (next) => {
      const normalized = next || 'global'
      if (normalized !== activeThread) {
        onThreadChange?.(normalized)
      }
      setActiveThreadInternal(normalized)
    },
    [activeThread, onThreadChange, setActiveThreadInternal],
  )

  useEffect(() => {
    if (!activeThreadId) return
    if (activeThreadId === activeThread) return
    setActiveThreadInternal(activeThreadId)
  }, [activeThread, activeThreadId, setActiveThreadInternal])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr auto',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
        color: '#0f172a',
        height,
      }}
    >
      <ChatHeader me={me} viewerHeroId={viewerHeroId} />
      <ThreadTabList
        items={threadTabs}
        activeId={activeThread}
        onSelect={setActiveThread}
        onClear={clearThread}
      />
      <MessageList
        listRef={listRef}
        messages={visibleMessages}
        heroDirectory={heroDirectory}
        viewerHeroId={viewerHeroId}
        blockedHeroSet={blockedHeroSet}
        onSelectHero={handleSelectHero}
      />
      <InputBar
        scope={scope}
        setScope={setScope}
        scopeOptions={scopeOptions}
        whisperTarget={whisperTarget}
        setWhisperTarget={setWhisperTarget}
        availableTargets={availableTargets}
        input={input}
        setInput={setInput}
        send={send}
        canSend={canSend}
      />
    </div>
  )
}

export {
  SharedChatDockProvider,
  useSharedChatDock,
  useSharedChatDockContext,
} from './useSharedChatDock'

function ThreadTabList({ items, activeId, onSelect, onClear }) {
  if (!items?.length) return null
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '8px 10px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
        overflowX: 'auto',
      }}
    >
      {items.map((item) => {
        const active = item.id === activeId
        return (
          <div
            key={item.id}
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => onSelect?.(item.id)}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid',
                borderColor: active ? '#2563eb' : 'rgba(148,163,184,0.45)',
                background: active ? 'rgba(37, 99, 235, 0.12)' : '#fff',
                color: active ? '#1e3a8a' : '#334155',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              <span>{item.label}</span>
              {item.unread ? (
                <span
                  style={{
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                  }}
                >
                  {item.unread}
                </span>
              ) : null}
            </button>
            {item.closable ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onClear?.(item.id)
                }}
                aria-label={`${item.label} 대화 기록 지우기`}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: '1px solid rgba(148,163,184,0.45)',
                  background: '#fff',
                  color: '#64748b',
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
