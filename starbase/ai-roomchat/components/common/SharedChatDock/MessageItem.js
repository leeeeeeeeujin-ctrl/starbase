import React, { useMemo } from 'react'
import { createDraftyFromText, renderDraftySegments } from '@/lib/chat/drafty'

export function MessageItem({
  message,
  heroDirectory,
  viewerHeroId,
  blockedHeroSet,
  onSelectHero,
}) {
  const senderMeta = heroDirectory.get(message.hero_id) || {}
  const senderName = senderMeta.username || message.username || '익명'
  const senderAvatar = senderMeta.avatarUrl || message.avatar_url || null
  const senderOwnerId = senderMeta.ownerId || message.owner_id || null

  const targetMeta = message.target_hero_id ? heroDirectory.get(message.target_hero_id) : null
  const targetName = targetMeta?.username || null

  const isSelf = viewerHeroId && message.hero_id === viewerHeroId
  const blocked = message.hero_id && blockedHeroSet.has(message.hero_id)
  const timestamp = new Date(message.created_at).toLocaleTimeString()

  const heroPayload = message.hero_id
    ? {
        heroId: message.hero_id,
        heroName: senderName,
        avatarUrl: senderAvatar,
        ownerId: senderOwnerId,
        blocked,
      }
    : null

  const handleSelect = () => {
    if (!heroPayload || typeof onSelectHero !== 'function') return
    onSelectHero(heroPayload)
  }

  const draftySource = useMemo(() => {
    if (message?.drafty) return message.drafty
    if (message?.metadata?.drafty) return message.metadata.drafty
    return createDraftyFromText(message?.text || '')
  }, [message])

  const messageContent = useMemo(() => {
    const nodes = renderDraftySegments(draftySource, {
      keyPrefix: `message-${message?.id || 'local'}`,
    })
    if (!nodes?.length) {
      return message?.text || ''
    }
    return nodes
  }, [draftySource, message?.id, message?.text])

  return (
    <div
      key={message.id}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid #f3f4f6',
        cursor: heroPayload ? 'pointer' : 'default',
        color: '#0f172a',
      }}
      role={heroPayload ? 'button' : undefined}
      tabIndex={heroPayload ? 0 : -1}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (!heroPayload) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleSelect()
        }
      }}
    >
      {senderAvatar ? (
        <img
          src={senderAvatar}
          alt=""
          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb' }} />
      )}
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13, color: '#0f172a' }}>{senderName}</b>
          <span style={{ fontSize: 12, color: '#64748b' }}>{timestamp}</span>
          {message.scope === 'whisper' && (
            <span
              style={{
                fontSize: 11,
                color: '#0ea5e9',
                border: '1px solid #0ea5e9',
                borderRadius: 999,
                padding: '0 6px',
              }}
            >
              귓속말{targetName ? ` → ${targetName}` : ''}
            </span>
          )}
          {message.has_links && (
            <span
              style={{
                fontSize: 11,
                color: '#0369a1',
                border: '1px solid #bae6fd',
                borderRadius: 999,
                padding: '0 6px',
                background: '#e0f2fe',
              }}
            >
              링크
            </span>
          )}
          {message.has_mentions && (
            <span
              style={{
                fontSize: 11,
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                borderRadius: 999,
                padding: '0 6px',
                background: '#dbeafe',
              }}
            >
              멘션
            </span>
          )}
          {message.has_hashtags && (
            <span
              style={{
                fontSize: 11,
                color: '#047857',
                border: '1px solid #bbf7d0',
                borderRadius: 999,
                padding: '0 6px',
                background: '#dcfce7',
              }}
            >
              태그
            </span>
          )}
          {blocked && (
            <span style={{ fontSize: 11, color: '#ef4444' }}>차단됨</span>
          )}
        </div>
        <div style={{ marginTop: 2, color: '#1f2937', lineHeight: 1.5 }}>{messageContent}</div>
      </div>
    </div>
  )
}

//
