import React from 'react'
import { MessageItem } from './MessageItem'

export function MessageList({
  listRef,
  messages,
  heroDirectory,
  viewerHeroId,
  blockedHeroSet,
  onBlock,
  onUnblock,
  onSelectHero,
}) {
  return (
    <div ref={listRef} style={{ padding: 12, overflow: 'auto' }}>
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          heroDirectory={heroDirectory}
          viewerHeroId={viewerHeroId}
          blockedHeroSet={blockedHeroSet}
          onBlock={onBlock}
          onUnblock={onUnblock}
          onSelectHero={onSelectHero}
        />
      ))}
    </div>
  )
}

//
