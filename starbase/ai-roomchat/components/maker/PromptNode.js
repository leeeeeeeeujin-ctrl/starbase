// components/maker/PromptNode.js
import React from 'react'
import { Handle, Position } from 'reactflow'

export default function PromptNode({ id, data }) {
  const d = data || {}
  const update = (patch) => d.onChange?.(patch)

  return (
    <div
      style={{
        width: 360,
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        background: '#fff',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 16px 40px -32px rgba(15, 23, 42, 0.45)',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 14, height: 14, borderRadius: '50%', background: '#1d4ed8', border: '2px solid #fff' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 14, height: 14, borderRadius: '50%', background: '#0ea5e9', border: '2px solid #fff' }}
      />
      {/* 헤더 */}
      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: d.isStart ? '#dbeafe' : '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <select
          value={d.slot_type || 'ai'}
          onChange={e => update({ slot_type: e.target.value })}
          style={{ fontWeight: 700 }}
        >
          <option value="ai">AI</option>
          <option value="user_action">유저행동</option>
          <option value="system">시스템</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>
          {d.invisible ? '숨김 노드' : '표시 노드'}
        </span>
        <button onClick={() => d.onSetStart?.()} style={{ marginLeft: 8, padding: '4px 8px', borderRadius: 8 }}>
          {d.isStart ? '시작노드 ✔' : '시작지점 지정'}
        </button>
        <button onClick={() => d.onDelete?.(id)} style={{ padding: '4px 8px', color: '#ef4444' }}>삭제</button>
      </div>

      {/* 템플릿 */}
      <div style={{ padding: 10 }}>
        <label style={{ fontSize: 12, color: '#64748b' }}>템플릿</label>
        <textarea
          rows={8}
          value={d.template || ''}
          onChange={e => update({ template: e.target.value })}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
      </div>
    </div>
  )
}
