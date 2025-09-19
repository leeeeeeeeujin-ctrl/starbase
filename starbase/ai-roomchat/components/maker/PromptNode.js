import { Handle, Position } from 'reactflow'

export default function PromptNode({ id, data = {}, selected }) {
  const slot_type = data.slot_type || 'ai'
  const template  = data.template  || ''

  return (
    <div style={{
      width: 340, background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 12, boxShadow: selected ? '0 0 0 2px #60a5fa' : '0 1px 2px rgba(0,0,0,0.04)',
      position:'relative'
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:6, background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
        <select
          value={slot_type}
          onChange={e => data.onChange?.({ slot_type: e.target.value })}
          style={{ padding:'4px 6px', border:'1px solid #e5e7eb', borderRadius:6, fontWeight:700 }}
        >
          <option value="ai">AI 프롬프트</option>
          <option value="user_action">유저 행동</option>
          <option value="system">시스템 설명</option>
        </select>
        <button
          onClick={() => data.onDelete?.(id)}
          title="프롬프트와 연결된 브릿지 삭제"
          style={{ marginLeft:'auto', border:'none', background:'transparent', color:'#ef4444', fontWeight:900, fontSize:16, cursor:'pointer' }}
        >✕</button>
      </div>

      {slot_type === 'user_action'
        ? <div style={{ padding:10, color:'#6b7280', fontStyle:'italic' }}>유저 입력 단계입니다.</div>
        : <textarea
            value={template}
            onChange={e => data.onChange?.({ template: e.target.value })}
            placeholder="템플릿 입력…"
            rows={8}
            style={{ width:'100%', border:'none', outline:'none', padding:10, resize:'vertical' }}
          />
      }
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
