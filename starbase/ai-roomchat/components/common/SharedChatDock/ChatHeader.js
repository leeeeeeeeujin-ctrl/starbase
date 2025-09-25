import React from 'react'

export function ChatHeader({ me }) {
  const avatar = me?.avatar_url

  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {avatar
        ? <img src={avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
        : <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e5e7eb' }} />
      }
      <span>공유 로비 채팅</span>
    </div>
  )
}

//
