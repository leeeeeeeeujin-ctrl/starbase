// components/rank/ParticipantCard.js
import { useState } from 'react'

export default function ParticipantCard({ p }) {
  const [open, setOpen] = useState(false)
  const hero = p.hero
  return (
    <div
      style={{
        border: '1px solid rgba(148, 163, 184, 0.35)',
        borderRadius: 14,
        padding: 14,
        background: 'rgba(15, 23, 42, 0.72)',
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            overflow: 'hidden',
            background: 'rgba(148, 163, 184, 0.25)',
            flexShrink: 0,
          }}
        >
          {hero?.image_url && (
            <img
              src={hero.image_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 15,
            }}
          >
            {hero?.name || `#${p.hero_id}`}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>
            {p.role || '역할 미지정'} · 점수 {p.score}
          </div>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.4)',
            background: 'rgba(30, 41, 59, 0.7)',
            color: '#e2e8f0',
            cursor: 'pointer',
          }}
          type="button"
        >
          {open ? '접기' : '보기'}
        </button>
      </div>
      {open && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: 'rgba(226, 232, 240, 0.82)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
          }}
        >
          {hero?.description || '설명 없음'}
        </div>
      )}
    </div>
  )
}
