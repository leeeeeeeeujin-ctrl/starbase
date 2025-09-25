import React from 'react'

export function MessageItem({
  message,
  heroDirectory,
  viewerHeroId,
  blockedHeroSet,
  onBlock,
  onUnblock,
}) {
  const senderName = heroDirectory.get(message.hero_id) || message.username || '익명'
  const targetName = message.target_hero_id ? heroDirectory.get(message.target_hero_id) : null
  const isSelf = viewerHeroId && message.hero_id === viewerHeroId
  const blocked = message.hero_id && blockedHeroSet.has(message.hero_id)
  const timestamp = new Date(message.created_at).toLocaleTimeString()

  return (
    <div
      key={message.id}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid #f3f4f6',
      }}
    >
      {message.avatar_url
        ? <img src={message.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
        : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb' }} />
      }
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13 }}>{senderName}</b>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{timestamp}</span>
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
          {blocked && (
            <span style={{ fontSize: 11, color: '#ef4444' }}>차단됨</span>
          )}
        </div>
        <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{message.text}</div>
        {message.hero_id && !isSelf && (
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            {blocked ? (
              <button
                onClick={() => onUnblock(message.hero_id)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 8,
                  border: '1px solid #ef4444',
                  background: '#fff',
                  color: '#ef4444',
                }}
              >
                차단 해제
              </button>
            ) : (
              <button
                onClick={() => onBlock(message.hero_id)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 8,
                  border: '1px solid #cbd5f5',
                  background: '#f8fafc',
                }}
              >
                차단하기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

//
