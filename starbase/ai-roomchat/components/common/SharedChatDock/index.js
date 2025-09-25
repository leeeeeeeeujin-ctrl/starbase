'use client'

import React from 'react'
import { ChatHeader } from './ChatHeader'
import { InputBar } from './InputBar'
import { MessageList } from './MessageList'
import { useSharedChatDock } from './useSharedChatDock'

export default function SharedChatDock({ height = 320, heroId }) {
  const {
    availableTargets,
    blockedHeroSet,
    canSend,
    heroDirectory,
    input,
    listRef,
    me,
    scope,
    send,
    setBlockedHeroes,
    setInput,
    setScope,
    setWhisperTarget,
    visibleMessages,
    viewerHeroId,
    whisperTarget,
  } = useSharedChatDock({ heroId })

  const handleBlock = (id) => {
    if (!id) return
    setBlockedHeroes((prev) => [...new Set([...prev, id])])
  }

  const handleUnblock = (id) => {
    if (!id) return
    setBlockedHeroes((prev) => prev.filter((heroId) => heroId !== id))
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
        height,
      }}
    >
      <ChatHeader me={me} />
      <MessageList
        listRef={listRef}
        messages={visibleMessages}
        heroDirectory={heroDirectory}
        viewerHeroId={viewerHeroId}
        blockedHeroSet={blockedHeroSet}
        onBlock={handleBlock}
        onUnblock={handleUnblock}
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

//
