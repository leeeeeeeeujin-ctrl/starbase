// components/maker/PromptNode.js
import React from 'react'

export default function PromptNode({ id, data }) {
  const d = data || {}
  const update = (patch) => d.onChange?.(patch)

  return (
    <div style={{ width: 360, border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', overflow:'hidden' }}>
      {/* 헤더 */}
      <div style={{ padding:'8px 10px', display:'flex', alignItems:'center', gap:8, background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
        <select
          value={d.slot_type || 'ai'}
          onChange={e=>update({ slot_type: e.target.value })}
          style={{ fontWeight:700 }}
        >
          <option value="ai">AI</option>
          <option value="user_action">유저행동</option>
          <option value="system">시스템</option>
        </select>
        <button onClick={()=>d.onSetStart?.()} style={{ marginLeft:'auto', padding:'4px 8px' }}>
          {d.isStart ? '시작노드 ✔' : '시작지점 지정'}
        </button>
        <button onClick={()=>d.onDelete?.(id)} style={{ padding:'4px 8px', color:'#ef4444' }}>삭제</button>
      </div>

      {/* 템플릿 */}
      <div style={{ padding:10 }}>
        <label style={{ fontSize:12, color:'#64748b' }}>템플릿</label>
        <textarea
          rows={8}
          value={d.template || ''}
          onChange={e=>update({ template: e.target.value })}
          style={{ width:'100%', fontFamily:'monospace' }}
        />
      </div>
    </div>
  )
}
