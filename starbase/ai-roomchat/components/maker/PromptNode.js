// components/maker/PromptNode.js
import React, { useMemo } from 'react'
import { Handle, Position } from 'reactflow'

const SLOT_COLORS = {
  ai: 'rgba(96, 165, 250, 1)',
  user_action: 'rgba(248, 113, 113, 1)',
  system: 'rgba(167, 139, 250, 1)',
}

function summarizeTemplate(value) {
  if (!value) return '내용이 비어 있습니다.'
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= 60) return compact
  return `${compact.slice(0, 57)}…`
}

export default function PromptNode({ data }) {
  const d = data || {}
  const color = SLOT_COLORS[d.slot_type] || SLOT_COLORS.ai
  const slotLabel = useMemo(() => (d.slotNo ? `#${d.slotNo}` : ''), [d.slotNo])
  const preview = useMemo(() => summarizeTemplate(d.template), [d.template])

  return (
    <div
      title={preview}
      style={{
        width: 112,
        height: 112,
        borderRadius: '50%',
        position: 'relative',
        boxShadow: `0 0 22px -6px ${color}, 0 0 120px -24px ${color}`,
        background: `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.92), ${color})`,
        border: '2px solid rgba(148, 163, 184, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0f172a',
        fontWeight: 700,
        textShadow: '0 0 12px rgba(255,255,255,0.8)',
        cursor: 'pointer',
        userSelect: 'none',
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
          background: 'rgba(148, 163, 184, 0.9)',
          border: '3px solid rgba(15, 23, 42, 0.85)',
        }}
        isConnectable
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'rgba(148, 163, 184, 0.9)',
          border: '3px solid rgba(15, 23, 42, 0.85)',
        }}
        isConnectable
      />
      <div
        style={{
          position: 'absolute',
          top: -26,
          background: 'rgba(15, 23, 42, 0.88)',
          color: '#e2e8f0',
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          border: '1px solid rgba(148, 163, 184, 0.32)',
          boxShadow: '0 4px 14px -8px rgba(15, 23, 42, 0.8)',
        }}
      >
        {slotLabel || d.slot_type?.toUpperCase() || 'NODE'}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: -32,
          maxWidth: 148,
          padding: '6px 10px',
          borderRadius: 12,
          background: 'rgba(15, 23, 42, 0.7)',
          color: '#cbd5f5',
          fontSize: 11,
          textAlign: 'center',
          lineHeight: 1.35,
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none',
          border: '1px solid rgba(148, 163, 184, 0.18)',
        }}
      >
        {d.isStart ? '시작' : d.slot_type === 'system' ? '시스템' : d.slot_type === 'user_action' ? '행동' : 'AI'}
      </div>
    </div>
  )
}
