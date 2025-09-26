'use client'

import React, { useEffect } from 'react'

import { ChatHeader } from './ChatHeader'
import { InputBar } from './InputBar'
import { MessageList } from './MessageList'
import { useSharedChatDock } from './useSharedChatDock'

export default function SharedChatDock({
  height = 320,
  heroId,
  extraWhisperTargets = [],
  onSelectHero,
  onUnreadChange,
  onBlockedHeroesChange,
  activeThreadId,
  onThreadChange,
}) {
  const {
    activeThread,
    availableTargets,
    blockedHeroSet,
    blockedHeroes,
    canSend,
    heroDirectory,
    input,
    listRef,
    me,
    scope,
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
  } = useSharedChatDock({ heroId, extraWhisperTargets })

  useEffect(() => {
    onUnreadChange?.(totalUnread)
  }, [onUnreadChange, totalUnread])

  useEffect(() => {
    onBlockedHeroesChange?.(blockedHeroes)
  }, [blockedHeroes, onBlockedHeroesChange])

  const handleSelectHero = (hero) => {
    if (!hero) return
    const extended = {
      ...hero,
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
    const items = [
      { id: 'global', label: '전체', unread: 0 },
      ...threadList.map((thread) => ({
        id: thread.heroId,
        label: thread.heroName,
        unread: unreadThreads[thread.heroId] || 0,
      })),
    ]
    return items
  }, [threadList, unreadThreads])

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
        height,
      }}
    >
      <ChatHeader me={me} viewerHeroId={viewerHeroId} />
      <ThreadTabList
        items={threadTabs}
        activeId={activeThread}
        onSelect={setActiveThread}
      />
      <MessageList
        listRef={listRef}
        messages={visibleMessages}
        heroDirectory={heroDirectory}
        viewerHeroId={viewerHeroId}
        blockedHeroSet={blockedHeroSet}
        onBlock={(id) => setBlockedHeroes((prev) => [...new Set([...prev, id])])}
        onUnblock={(id) => setBlockedHeroes((prev) => prev.filter((heroId) => heroId !== id))}
        onSelectHero={handleSelectHero}
      />
      <InputBar
        scope={scope}
        setScope={setScope}
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

function ThreadTabList({ items, activeId, onSelect }) {
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
          <button
            key={item.id}
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
        )
      })}
    </div>
  )
}
