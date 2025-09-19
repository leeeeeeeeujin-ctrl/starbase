// SidePanel.js
import { useEffect, useMemo, useState } from 'react'

function TokenPalette({ onInsert }) {
  const [slot, setSlot] = useState('1')
  const [prop, setProp] = useState('name')
  const [ability, setAbility] = useState('1')

  const token = useMemo(() => {
    if (prop === 'ability') return `{{slot${slot}.ability${ability}}}`
    return `{{slot${slot}.${prop}}}`
  }, [slot, prop, ability])

  return (
    <div style={{ display:'grid', gap:8, borderTop:'1px solid #e5e7eb', marginTop:12, paddingTop:12 }}>
      <div style={{ fontWeight:700 }}>토큰 팔레트</div>
      <div style={{ display:'flex', gap:6 }}>
        <select value={slot} onChange={e=>setSlot(e.target.value)}>
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}
        </select>
        <select value={prop} onChange={e=>setProp(e.target.value)}>
          <option value="name">이름</option>
          <option value="description">설명</option>
          <option value="ability">능력</option>
        </select>
        {prop==='ability' && (
          <select value={ability} onChange={e=>setAbility(e.target.value)}>
            {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}
          </select>
        )}
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <button onClick={()=>onInsert(token)}>토큰 삽입 ({token})</button>
        <button onClick={()=>onInsert('{{slot.random}}')}>랜덤 슬롯</button>
        <button onClick={()=>onInsert('{{random.slot.name}}')}>랜덤 슬롯 이름</button>
        <button onClick={()=>onInsert('{{random.choice:A|B|C}}')}>임의 선택</button>
        <button onClick={()=>onInsert('{{history.last1}}')}>마지막 줄</button>
        <button onClick={()=>onInsert('{{history.last2}}')}>마지막 2줄</button>
      </div>
    </div>
  )
}

export default function SidePanel({ selectedNodeId, selectedEdge, setEdges, onInsertToken }) {
  const [edgeForm, setEdgeForm] = useState({
    trigger_words: '',
    conditions: '[]',
    priority: 0,
    probability: 1.0,
    fallback: false,
    action: 'continue'
  })

  useEffect(() => {
    if (!selectedEdge) return
    setEdgeForm({
      trigger_words: (selectedEdge.data?.trigger_words || []).join(','),
      conditions: JSON.stringify(selectedEdge.data?.conditions || []),
      priority: selectedEdge.data?.priority ?? 0,
      probability: selectedEdge.data?.probability ?? 1.0,
      fallback: !!selectedEdge.data?.fallback,
      action: selectedEdge.data?.action || 'continue'
    })
  }, [selectedEdge])

  function applyEdgeForm() {
    if (!selectedEdge) return
    let cond = []
    try { cond = JSON.parse(edgeForm.conditions || '[]') } catch (_) { cond = [] }
    const trigger_words = edgeForm.trigger_words.split(',').map(s=>s.trim()).filter(Boolean)
    const priority = parseInt(edgeForm.priority) || 0
    const probability = Math.max(0, Math.min(1, parseFloat(edgeForm.probability) || 0))
    const fallback = !!edgeForm.fallback
    const action = edgeForm.action

    setEdges(eds => eds.map(e => e.id === selectedEdge.id
      ? { ...e,
          label: [
            (trigger_words || []).join(', '),
            (cond && cond.length ? 'cond' : null),
            (probability !== 1 ? `p=${probability}` : null),
            (fallback ? 'fallback' : null),
            (action && action !== 'continue' ? action : null)
          ].filter(Boolean).join(' | '),
          data: { ...(e.data||{}), trigger_words, conditions: cond, priority, probability, fallback, action }
        }
      : e
    ))
  }

  if (selectedNodeId) {
    return (
      <div style={{ padding:12 }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>노드 {selectedNodeId}</div>
        <div style={{ color:'#64748b' }}>프롬프트 텍스트는 카드 안에서 직접 수정합니다.</div>
        <TokenPalette onInsert={onInsertToken}/>
      </div>
    )
  }
  if (selectedEdge) {
    return (
      <div style={{ padding:12 }}>
        <h3 style={{ marginTop:0 }}>브릿지 설정</h3>
        <label style={{ fontSize:12 }}>트리거 단어(쉼표로 구분)</label>
        <input
          value={edgeForm.trigger_words}
          onChange={e=>setEdgeForm(f=>({ ...f, trigger_words: e.target.value }))}
          style={{ width:'100%', marginBottom:8 }}
        />
        <div style={{ fontSize:12, marginBottom:4 }}>조건(JSON 배열) 예:</div>
        <pre style={{ margin:0, padding:'6px 8px', background:'#f3f4f6', borderRadius:6, fontSize:12, fontFamily:'monospace' }}>
{`[{"type":"contains","value":"승리"}]`}
        </pre>
        <textarea
          value={edgeForm.conditions}
          onChange={e=>setEdgeForm(f=>({ ...f, conditions: e.target.value }))}
          rows={4}
          style={{ width:'100%', marginTop:8, marginBottom:8, fontFamily:'monospace' }}
          placeholder='예: [{"type":"contains","value":"승리"},{"type":"regex","value":".*마무리.*"}]'
        />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <label style={{ fontSize:12 }}>우선순위(작을수록 먼저)</label>
            <input
              type="number"
              value={edgeForm.priority}
              onChange={e=>setEdgeForm(f=>({ ...f, priority: e.target.value }))}
              style={{ width:'100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize:12 }}>확률(0~1)</label>
            <input
              type="number" step="0.1" min="0" max="1"
              value={edgeForm.probability}
              onChange={e=>setEdgeForm(f=>({ ...f, probability: e.target.value }))}
              style={{ width:'100%' }}
            />
          </div>
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:8, margin:'10px 0' }}>
          <input
            type="checkbox"
            checked={edgeForm.fallback}
            onChange={e=>setEdgeForm(f=>({ ...f, fallback: e.target.checked }))}
          />
          Fallback(어느 조건도 안 맞을 때 사용)
        </label>
        <label style={{ fontSize:12 }}>액션</label>
        <select
          value={edgeForm.action}
          onChange={e=>setEdgeForm(f=>({ ...f, action: e.target.value }))}
          style={{ width:'100%', marginBottom:12 }}
        >
          <option value="continue">일반 진행</option>
          <option value="win">승리</option>
          <option value="lose">패배</option>
          <option value="goto_set">다른 세트로 이동(확장)</option>
        </select>
        <button
          onClick={applyEdgeForm}
          style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700 }}
        >
          엣지 라벨 반영
        </button>
      </div>
    )
  }
  return <div style={{ padding:12, color:'#64748b' }}>노드/브릿지를 선택하세요</div>
}
