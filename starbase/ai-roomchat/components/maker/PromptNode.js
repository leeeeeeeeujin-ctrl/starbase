import { Handle, Position } from 'reactflow'

export default function PromptNode({ id, data = {}, selected }) {
  const slotType = data.slot_type || 'ai'
  const template = data.template || ''

  return (
    <div
      style={{
        width: 320,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        boxShadow: selected ? '0 0 0 2px #60a5fa' : ''
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ display: 'flex', alignItems: 'center', padding: 6 }}>
        <select
          value={slotType}
          onChange={(e) => data.onChange?.({ slot_type: e.target.value })}
        >
          <option value="ai">AI</option>
          <option value="user_action">유저 행동</option>
          <option value="system">시스템</option>
        </select>
        <button
          onClick={() => data.onDelete?.(id)}
          style={{ marginLeft: 'auto', color: 'red' }}
        >
          ✕
        </button>
      </div>
      {slotType === 'user_action' ? (
        <div style={{ padding: 10, fontStyle: 'italic' }}>유저 입력 단계</div>
      ) : (
        <textarea
          value={template}
          onChange={(e) => data.onChange?.({ template: e.target.value })}
          placeholder="프롬프트 입력…"
          style={{ width: '100%', minHeight: 80 }}
        />
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
