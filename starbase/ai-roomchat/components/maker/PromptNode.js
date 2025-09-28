// components/maker/PromptNode.js
import React, { useMemo } from 'react'
import { Handle, Position } from 'reactflow'

function formatVisibilityLabel(data) {
  if (!data?.invisible) {
    return '표시 노드'
  }

  const list = Array.isArray(data?.visible_slots) ? data.visible_slots : []
  if (list.length === 0) {
    return '숨김: 전체 비공개'
  }

  if (list.length === 1) {
    return `숨김: 슬롯 ${list[0]}만 볼 수 있음`
  }

  return `숨김: ${list.length}개 슬롯 공개`
}

export default function PromptNode({ id, data }) {
  const d = data || {}
  const update = (patch) => d.onChange?.(patch)

  const visibilityLabel = useMemo(() => formatVisibilityLabel(d), [d])
  const slotLabel = useMemo(() => {
    if (!d.slotNo) return null
    return `#${d.slotNo}`
  }, [d.slotNo])

  return (
    <div
      style={{
        width: 'min(320px, 82vw)',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        background: '#fff',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 20px 48px -32px rgba(15, 23, 42, 0.5)',
        touchAction: 'none',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#1d4ed8',
          border: '3px solid #fff',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#0ea5e9',
          border: '3px solid #fff',
        }}
      />
      <div
        style={{
          padding: '10px 12px',
          display: 'grid',
          gap: 8,
          background: d.isStart ? '#dbeafe' : '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {slotLabel && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                background: '#1d4ed8',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {slotLabel}
            </span>
          )}
          <select
            value={d.slot_type || 'ai'}
            onChange={(event) => update({ slot_type: event.target.value })}
            style={{
              fontWeight: 700,
              borderRadius: 8,
              border: '1px solid #cbd5f5',
              padding: '4px 10px',
              background: '#fff',
            }}
          >
            <option value="ai">AI</option>
            <option value="user_action">유저행동</option>
            <option value="system">시스템</option>
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>{visibilityLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => d.onSetStart?.()}
            style={{
              padding: '4px 10px',
              borderRadius: 10,
              background: d.isStart ? '#1d4ed8' : '#e2e8f0',
              color: d.isStart ? '#fff' : '#1f2937',
              fontWeight: 600,
            }}
          >
            {d.isStart ? '시작 노드' : '시작 지정'}
          </button>
          <button
            type="button"
            onClick={() => d.onDelete?.(id)}
            style={{
              padding: '4px 10px',
              borderRadius: 10,
              background: '#fee2e2',
              color: '#b91c1c',
              fontWeight: 600,
            }}
          >
            삭제
          </button>
        </div>
      </div>

      <div style={{ padding: 12, display: 'grid', gap: 6 }}>
        <label style={{ fontSize: 12, color: '#64748b' }}>템플릿</label>
        <textarea
          rows={8}
          value={d.template || ''}
          onChange={(event) => update({ template: event.target.value })}
          style={{
            width: '100%',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: '10px 12px',
            fontFamily: 'inherit',
            fontSize: 13,
            lineHeight: 1.5,
            resize: 'vertical',
            minHeight: 160,
          }}
        />
      </div>
    </div>
  )
}
