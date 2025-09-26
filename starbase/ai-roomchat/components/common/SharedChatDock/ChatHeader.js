import React from 'react'

export function ChatHeader({ me, viewerHeroId }) {
  const avatar = me?.avatar_url
  const heroLabel = viewerHeroId ? `ID: ${viewerHeroId}` : '캐릭터 미선택'

  return (
    <div
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {avatar ? (
          <img src={avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb' }} />
        )}
        <div style={{ display: 'grid', gap: 2 }}>
          <strong style={{ fontSize: 14 }}>{me?.name || '익명'}</strong>
          <span style={{ fontSize: 11, color: '#64748b' }}>{heroLabel}</span>
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>공용 채널</span>
    </div>
  )
}

//
