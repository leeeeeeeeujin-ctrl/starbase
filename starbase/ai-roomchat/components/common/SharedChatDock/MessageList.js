import React from 'react'
import { MessageItem } from './MessageItem'

export function MessageList({
  listRef,
  messages,
  heroDirectory,
  viewerHeroId,
  blockedHeroSet,
  onSelectHero,
}) {
  return (
    <div
      ref={listRef}
      style={{ padding: '12px 12px 20px', overflow: 'auto' }}
    >
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          heroDirectory={heroDirectory}
          viewerHeroId={viewerHeroId}
          blockedHeroSet={blockedHeroSet}
          onSelectHero={onSelectHero}
        />
      ))}
    </div>
  )
}

//
