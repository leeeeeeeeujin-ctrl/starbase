// components/maker/PromptNode.js
import React, { useMemo } from 'react'
import { Handle, Position } from 'reactflow'

export default function PromptNode({ id, data }) {
  const d = data || {}

  const slotLabel = useMemo(() => {
    if (!d.slotNo) return null
    return `#${d.slotNo}`
  }, [d.slotNo])

  const typeLabel = useMemo(() => {
    if (!d.slot_type) return 'AI'
    if (d.slot_type === 'user_action') return '유저'
    if (d.slot_type === 'system') return '시스템'
    return 'AI'
  }, [d.slot_type])

  const isInvisible = !!d.invisible
  const isStart = !!d.isStart

  return (
    <div
      style={{
        minWidth: 140,
        maxWidth: 180,
        padding: '12px 8px',
        display: 'grid',
        justifyItems: 'center',
        alignItems: 'center',
        gap: 10,
        background: 'transparent',
        touchAction: 'none',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#38bdf8',
          border: '3px solid #0f172a',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#f97316',
          border: '3px solid #0f172a',
        }}
      />
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: '50%',
          background: isStart
            ? 'radial-gradient(circle at 30% 25%, rgba(96,165,250,0.9) 0%, rgba(59,130,246,0.4) 35%, rgba(15,23,42,0.95) 100%)'
            : 'radial-gradient(circle at 30% 25%, rgba(248,250,252,0.8) 0%, rgba(148,163,184,0.3) 40%, rgba(15,23,42,0.92) 100%)',
          boxShadow: isInvisible
            ? '0 0 0 4px rgba(248, 250, 252, 0.55), 0 18px 40px -26px rgba(15, 23, 42, 0.8)'
            : '0 22px 46px -28px rgba(15, 23, 42, 0.75)',
          border: isInvisible ? '2px dashed rgba(251, 191, 36, 0.85)' : '1px solid rgba(148, 163, 184, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'transform 120ms ease',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 8,
            borderRadius: '50%',
            background: isStart ? 'rgba(30,64,175,0.28)' : 'rgba(15,23,42,0.38)',
            filter: 'blur(0.5px)',
          }}
        />
        <span style={{ fontSize: 34, color: '#f8fafc', lineHeight: 1, textShadow: '0 4px 12px rgba(15,23,42,0.85)' }}>★</span>
      </div>

      <div style={{ display: 'grid', gap: 4, textAlign: 'center' }}>
        {slotLabel && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              background: '#1d4ed8',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {slotLabel}
          </span>
        )}
        <span style={{ fontSize: 12, color: '#cbd5f5', fontWeight: 600 }}>{typeLabel}</span>
        {isInvisible && <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>숨김</span>}
      </div>
    </div>
  )
}
