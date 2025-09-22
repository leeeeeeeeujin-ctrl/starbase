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
        <label style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
          <input
            type="checkbox"
            checked={!!(d.options?.invisible)}
            onChange={e=>update({ options: { ...(d.options||{}), invisible: e.target.checked } })}
          />
          인비저블
        </label>
      </div>

      {/* 템플릿 */}
      <div style={{ padding:10 }}>
        <label style={{ fontSize:12, color:'#64748b' }}>템플릿</label>
        <textarea
          rows={6}
          value={d.template || ''}
          onChange={e=>update({ template: e.target.value })}
          style={{ width:'100%', fontFamily:'monospace' }}
        />
      </div>

      {/* 가시 슬롯 */}
      {d.options?.invisible && (
        <div style={{ padding:'0 10px 10px' }}>
          <label style={{ fontSize:12, color:'#64748b' }}>보이는 슬롯(쉼표): 예) 1,3,5</label>
          <input
            value={Array.isArray(d.options?.visible_slots) ? d.options.visible_slots.join(',') : ''}
            onChange={e=>{
              const arr = e.target.value.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n))
              update({ options: { ...(d.options||{}), visible_slots: arr } })
            }}
            style={{ width:'100%' }}
          />
        </div>
      )}

      {/* 변수(전역/로컬) – 수동/적극 */}
      <div style={{ padding:'0 10px 10px', display:'grid', gap:8 }}>
        <b style={{ fontSize:13 }}>변수 설정</b>
        <VarArea
          label="전역 수동변수(JSON 배열: {name,instruction})"
          value={d.options?.manual_vars_global}
          onChange={(v)=>update({ options: { ...(d.options||{}), manual_vars_global: v } })}
        />
        <VarArea
          label="로컬 수동변수(JSON 배열: {name,instruction})"
          value={d.options?.manual_vars_local}
          onChange={(v)=>update({ options: { ...(d.options||{}), manual_vars_local: v } })}
        />
        <VarArea
          label="전역 적극변수(JSON 배열: {name,ruleText})"
          value={d.options?.active_vars_global}
          onChange={(v)=>update({ options: { ...(d.options||{}), active_vars_global: v } })}
        />
        <VarArea
          label="로컬 적극변수(JSON 배열: {name,ruleText})"
          value={d.options?.active_vars_local}
          onChange={(v)=>update({ options: { ...(d.options||{}), active_vars_local: v } })}
        />
      </div>

      {/* 풋터 */}
      <div style={{ padding:10, borderTop:'1px solid #e5e7eb', display:'flex', gap:8 }}>
        <button onClick={()=>d.onSetStart?.()} style={{ padding:'6px 10px' }}>
          {d.isStart ? '시작노드 ✔' : '시작지점 지정'}
        </button>
        <button onClick={()=>d.onDelete?.(id)} style={{ marginLeft:'auto', padding:'6px 10px', color:'#ef4444' }}>삭제</button>
      </div>
    </div>
  )
}

function VarArea({ label, value, onChange }) {
  let text = ''
  try { text = JSON.stringify(value ?? [], null, 2) } catch { text = '[]' }
  return (
    <div>
      <label style={{ fontSize:12, color:'#64748b' }}>{label}</label>
      <textarea
        rows={4}
        value={text}
        onChange={e=>{
          try { onChange(JSON.parse(e.target.value || '[]')) }
          catch { /* 무시 */ }
        }}
        style={{ width:'100%', fontFamily:'monospace' }}
      />
    </div>
  )
}
