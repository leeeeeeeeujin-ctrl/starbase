import { useEffect, useState } from 'react'

function ConditionBuilder({ selectedEdge, setEdges, pushToForm }) {
  const [typeIdx, setTypeIdx] = useState(0)
  const [values, setValues] = useState({})

  const CONDITION_DEFS = [
    {
      type: 'turn_gte',
      label: '턴 ≥',
      params: [{ key:'value', label:'턴 ≥', type:'number', defaultValue:'1' }],
      toJSON: v => ({ type:'turn_gte', value:Number(v.value ?? 1) }),
      toSummary: v => `턴 ≥ ${v.value ?? 1}`
    },
    {
      type: 'turn_lte',
      label: '턴 ≤',
      params: [{ key:'value', label:'턴 ≤', type:'number', defaultValue:'5' }],
      toJSON: v => ({ type:'turn_lte', value:Number(v.value ?? 1) }),
      toSummary: v => `턴 ≤ ${v.value ?? 1}`
    },
    {
      type: 'prev_ai_contains',
      label: '이전응답 포함',
      params: [
        { key:'value', label:'문구', type:'text', placeholder:'예) 승리' },
        { key:'scope', label:'구간', type:'select', options:[
          {value:'last1', label:'마지막 1줄'},
          {value:'last2', label:'마지막 2줄'},
          {value:'last5', label:'마지막 5줄'},
          {value:'all',   label:'전체'},
        ], defaultValue:'last2' }
      ],
      toJSON: v => ({ type:'prev_ai_contains', value:String(v.value||''), scope:v.scope||'last2' }),
      toSummary: v => `이전응답(${v.scope||'last2'}) "${v.value||''}"`
    },
    {
      type: 'prev_prompt_contains',
      label: '이전프롬프트 포함',
      params: [
        { key:'value', label:'문구', type:'text', placeholder:'예) 탈출' },
        { key:'scope', label:'구간', type:'select', options:[
          {value:'last1', label:'마지막 1줄'},
          {value:'last2', label:'마지막 2줄'},
          {value:'all',   label:'전체'},
        ], defaultValue:'last1' }
      ],
      toJSON: v => ({ type:'prev_prompt_contains', value:String(v.value||''), scope:v.scope||'last1' }),
      toSummary: v => `이전프롬프트(${v.scope||'last1'}) "${v.value||''}"`
    },
    {
      type: 'prev_ai_regex',
      label: '이전응답 정규식',
      params: [
        { key:'pattern', label:'패턴', type:'text', placeholder:'예) ^패배\\b' },
        { key:'flags',   label:'플래그', type:'text', placeholder:'예) i' },
        { key:'scope',   label:'구간', type:'select', options:[
          {value:'last1', label:'마지막 1줄'},
          {value:'last2', label:'마지막 2줄'},
          {value:'all',   label:'전체'},
        ], defaultValue:'last1' }
      ],
      toJSON: v => ({ type:'prev_ai_regex', pattern:String(v.pattern||''), flags:String(v.flags||''), scope:v.scope||'last1' }),
      toSummary: v => `이전응답/${v.pattern||''}/${v.flags||''}`
    },
    {
      type: 'visited_slot',
      label: '경유 슬롯',
      params: [{ key:'slot_id', label:'슬롯 ID', type:'text', placeholder:'예) 12' }],
      toJSON: v => ({ type:'visited_slot', slot_id: v.slot_id ? String(v.slot_id) : null }),
      toSummary: v => `경유 #${v.slot_id ?? '?'}`
    },
    {
      type: 'random',
      label: '확률',
      params: [{ key:'p', label:'확률(0~1)', type:'number', step:'0.05', min:'0', max:'1', defaultValue:'0.3' }],
      toJSON: v => ({ type:'random', p: Number(v.p ?? 0.3) }),
      toSummary: v => `확률 ${Math.round((Number(v.p ?? 0.3))*100)}%`,
    },
    { type: 'fallback', label: 'Fallback', params: [], toJSON: _ => ({ type:'fallback' }), toSummary: _ => 'Fallback' },
  ]

  const def = CONDITION_DEFS[typeIdx]

  function buildEdgeLabel(data) {
    const parts = []
    const conds = data?.conditions || []
    conds.forEach(c => {
      if (c?.type==='turn_gte') parts.push(`턴 ≥ ${c.value}`)
      if (c?.type==='turn_lte') parts.push(`턴 ≤ ${c.value}`)
      if (c?.type==='prev_ai_contains') parts.push(`이전응답 "${c.value}"`)
      if (c?.type==='prev_prompt_contains') parts.push(`이전프롬프트 "${c.value}"`)
      if (c?.type==='prev_ai_regex') parts.push(`이전응답 /${c.pattern}/${c.flags||''}`)
      if (c?.type==='visited_slot') parts.push(`경유 #${c.slot_id ?? '?'}`)
      if (c?.type==='fallback') parts.push('Fallback')
    })
    const p = data?.probability
    if (p != null && p !== 1) parts.push(`확률 ${Math.round(Number(p)*100)}%`)
    return parts.join(' | ')
  }

  function addCondition() {
    if (!selectedEdge) return
    const json = def.toJSON(values)
    setEdges(eds => eds.map(e => {
      if (e.id !== selectedEdge.id) return e
      const prev = e.data?.conditions || []
      const conditions = [...prev, json]
      const data = { ...(e.data||{}), conditions }
      return { ...e, data, label: buildEdgeLabel(data) }
    }))
    if (pushToForm) pushToForm(json)
    setValues({})
  }

  return (
    <div style={{ display:'grid', gap:8 }}>
      <div style={{ fontWeight:700 }}>조건 추가</div>
      <select value={String(typeIdx)} onChange={e => { setTypeIdx(Number(e.target.value)); setValues({}); }}>
        {CONDITION_DEFS.map((d, i) => (
          <option key={d.type} value={i}>{d.label}</option>
        ))}
      </select>

      <div style={{ display:'grid', gap:6 }}>
        {def.params.map(p => {
          if (p.type === 'select') {
            return (
              <label key={p.key} style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:12, color:'#555' }}>{p.label}</span>
                <select
                  value={values[p.key] ?? p.defaultValue ?? ''}
                  onChange={e=>setValues(v=>({ ...v, [p.key]: e.target.value }))}>
                  {(p.options||[]).map(opt=>(<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>
              </label>
            )
          }
          return (
            <label key={p.key} style={{ display:'grid', gap:4 }}>
              <span style={{ fontSize:12, color:'#555' }}>{p.label}</span>
              <input
                type={p.type}
                step={p.step}
                min={p.min}
                max={p.max}
                placeholder={p.placeholder}
                value={values[p.key] ?? p.defaultValue ?? ''}
                onChange={e=>setValues(v=>({ ...v, [p.key]: e.target.value }))} />
            </label>
          )
        })}
      </div>

      <button onClick={addCondition} style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff', fontWeight:700 }}>
        추가
      </button>
    </div>
  )
}

function TokenPalette({ onInsert }) {
  const [slot, setSlot] = useState('1')
  const [prop, setProp] = useState('name')
  const [ability, setAbility] = useState('1')
  const token = prop === 'ability'
    ? `{{slot${slot}.ability${ability}}}`
    : `{{slot${slot}.${prop}}}`
  return (
    <div style={{ display:'grid', gap:8, borderTop:'1px solid #e5e7eb', marginTop:12, paddingTop:12 }}>
      <div style={{ fontWeight:700 }}>토큰</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <select value={slot} onChange={e=>setSlot(e.target.value)}>
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>슬롯{i+1}</option>)}
        </select>
        <select value={prop} onChange={e=>setProp(e.target.value)}>
          <option value="name">이름</option>
          <option value="description">설명</option>
          <option value="role">역할</option>
          <option value="ability">능력</option>
        </select>
        {prop==='ability' && (
          <select value={ability} onChange={e=>setAbility(e.target.value)}>
            {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>능력{i+1}</option>)}
          </select>
        )}
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <button onClick={()=>onInsert(token)}>선택 토큰</button>
        <button onClick={()=>onInsert('{{slot.random}}')}>랜덤 슬롯번호</button>
        <button onClick={()=>onInsert('{{random.slot.name}}')}>랜덤 슬롯 이름</button>
        <button onClick={()=>onInsert('{{random.choice:A|B|C}}')}>임의 선택</button>
        <button onClick={()=>onInsert('{{history.last1}}')}>마지막 줄</button>
        <button onClick={()=>onInsert('{{history.last2}}')}>마지막 2줄</button>
        <button onClick={()=>onInsert('{{history.last5}}')}>마지막 5줄</button>
      </div>
    </div>
  )
}

export default function SidePanel({
  selectedNodeId,
  selectedEdge,
  setEdges,
  setNodes,
  onInsertToken,
  globalRules,
  setGlobalRules,
  selectedNodeData
}) {
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

  function rebuildLabel(data){
    const parts = []
    const conds = data?.conditions || []
    conds.forEach(c => {
      if (c?.type==='turn_gte' && (c.value ?? c.gte) != null) parts.push(`턴 ≥ ${c.value ?? c.gte}`)
      if (c?.type==='turn_lte' && (c.value ?? c.lte) != null) parts.push(`턴 ≤ ${c.value ?? c.lte}`)
      if (c?.type==='prev_ai_contains') parts.push(`이전응답 "${c.value}"`)
      if (c?.type==='prev_prompt_contains') parts.push(`이전프롬프트 "${c.value}"`)
      if (c?.type==='prev_ai_regex') parts.push(`이전응답 /${c.pattern}/${c.flags||''}`)
      if (c?.type==='visited_slot') parts.push(`경유 #${c.slot_id ?? '?'}`)
    })
    const p = data?.probability
    if (p != null && p !== 1) parts.push(`확률 ${Math.round(Number(p)*100)}%`)
    if (data?.fallback) parts.push('Fallback')
    return parts.join(' | ')
  }

  function applyEdgeForm() {
    if (!selectedEdge) return
    let cond = []
    try { cond = JSON.parse(edgeForm.conditions || '[]') } catch (_) { cond = [] }

    const trigger_words = edgeForm.trigger_words.split(',').map(s=>s.trim()).filter(Boolean)
    const priority = parseInt(edgeForm.priority) || 0
    const probability = Math.max(0, Math.min(1, parseFloat(edgeForm.probability) || 0))
    const fallback = !!edgeForm.fallback
    const action = edgeForm.action

    setEdges(eds => eds.map(e => {
      if (e.id !== selectedEdge.id) return e
      const data = { ...(e.data||{}), trigger_words, conditions: cond, priority, probability, fallback, action }
      return { ...e, data, label: rebuildLabel(data) }
    }))
  }

  function pushToForm(json) {
    setEdgeForm(f => {
      let arr = []
      try { arr = JSON.parse(f.conditions || '[]') } catch {}
      arr.push(json)
      return { ...f, conditions: JSON.stringify(arr) }
    })
  }

  // 전역 변수 규칙(세트 단위)
  function addGlobalRule() {
    setGlobalRules([...(globalRules || []), { name:'', when:'prev_ai_contains', value:'', scope:'last2' }])
  }
  function updateGlobalRule(i, patch){
    setGlobalRules((arr)=>arr.map((r,idx)=>idx===i?{...r,...patch}:r))
  }
  function removeGlobalRule(i){
    setGlobalRules((arr)=>arr.filter((_,idx)=>idx!==i))
  }

  // 로컬 변수 규칙(노드 단위)
  function addLocalRule() {
    if (!selectedNodeData) return
    setNodes(nds=>nds.map(n=>{
      if (n.id!==selectedNodeId) return n
      const prev = Array.isArray(n.data.var_rules_local) ? n.data.var_rules_local : []
      return { ...n, data:{ ...n.data, var_rules_local:[...prev, { name:'', when:'prev_ai_contains', value:'', scope:'last2' }] } }
    }))
  }
  function updateLocalRule(i, patch) {
    setNodes(nds=>nds.map(n=>{
      if (n.id!==selectedNodeId) return n
      const prev = Array.isArray(n.data.var_rules_local) ? n.data.var_rules_local : []
      const next = prev.map((r,idx)=>idx===i?{...r,...patch}:r)
      return { ...n, data:{ ...n.data, var_rules_local:next } }
    }))
  }
  function removeLocalRule(i) {
    setNodes(nds=>nds.map(n=>{
      if (n.id!==selectedNodeId) return n
      const prev = Array.isArray(n.data.var_rules_local) ? n.data.var_rules_local : []
      const next = prev.filter((_,idx)=>idx!==i)
      return { ...n, data:{ ...n.data, var_rules_local:next } }
    }))
  }

  // 사이드 패널 렌더
  if (selectedNodeId) {
    const local = Array.isArray(selectedNodeData?.var_rules_local) ? selectedNodeData.var_rules_local : []
    return (
      <div style={{ padding:12, display:'grid', gap:12 }}>
        <div>
          <div style={{ fontWeight:700, marginBottom:8 }}>프롬프트 토큰</div>
          <TokenPalette onInsert={onInsertToken} />
        </div>

        <div>
          <div style={{ fontWeight:700, marginBottom:6 }}>로컬 변수 규칙(이 노드만)</div>
          <div style={{ display:'grid', gap:8 }}>
            {local.map((r, i)=>(
              <div key={i} style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:8, display:'grid', gap:6 }}>
                <input value={r.name} placeholder="변수명" onChange={e=>updateLocalRule(i,{name:e.target.value})} />
                <select value={r.when} onChange={e=>updateLocalRule(i,{when:e.target.value})}>
                  <option value="prev_ai_contains">이전응답 포함</option>
                  <option value="prev_prompt_contains">이전프롬프트 포함</option>
                  <option value="prev_ai_regex">이전응답 정규식</option>
                  <option value="turn_gte">턴 ≥</option>
                  <option value="turn_lte">턴 ≤</option>
                </select>
                <input value={r.value||''} placeholder="값/패턴" onChange={e=>updateLocalRule(i,{value:e.target.value})} />
                <select value={r.scope||'last2'} onChange={e=>updateLocalRule(i,{scope:e.target.value})}>
                  <option value="last1">마지막 1줄</option>
                  <option value="last2">마지막 2줄</option>
                  <option value="last5">마지막 5줄</option>
                  <option value="all">전체</option>
                </select>
                <button onClick={()=>removeLocalRule(i)} style={{ alignSelf:'start' }}>삭제</button>
              </div>
            ))}
          </div>
          <button onClick={addLocalRule} style={{ marginTop:8, padding:'6px 10px', borderRadius:8, background:'#0ea5e9', color:'#fff' }}>+ 로컬 규칙</button>
        </div>
      </div>
    )
  }

  if (selectedEdge) {
    return (
      <div style={{ padding:12, display:'grid', gap:12 }}>
        <div>
          <div style={{ fontWeight:700, marginBottom:6 }}>브릿지 조건</div>
          <ConditionBuilder selectedEdge={selectedEdge} setEdges={setEdges} pushToForm={pushToForm} />
        </div>

        <div style={{ borderTop:'1px solid #eee', paddingTop:12 }}>
          <label style={{ fontSize:12 }}>조건(JSON 배열)</label>
          <textarea
            value={edgeForm.conditions}
            onChange={e=>setEdgeForm(f=>({ ...f, conditions: e.target.value }))}
            rows={4}
            style={{ width:'100%', marginBottom:8, fontFamily:'monospace' }}
          />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <label>
              <div style={{ fontSize:12 }}>우선순위</div>
              <input type="number" value={edgeForm.priority} onChange={e=>setEdgeForm(f=>({ ...f, priority: e.target.value }))} style={{ width:'100%' }} />
            </label>
            <label>
              <div style={{ fontSize:12 }}>확률(0~1)</div>
              <input type="number" step="0.05" min="0" max="1"
                value={edgeForm.probability}
                onChange={e=>setEdgeForm(f=>({ ...f, probability: e.target.value }))} style={{ width:'100%' }} />
            </label>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={edgeForm.fallback} onChange={e=>setEdgeForm(f=>({ ...f, fallback: e.target.checked }))} />
            Fallback
          </label>
          <label style={{ fontSize:12, marginTop:8 }}>액션</label>
          <select value={edgeForm.action} onChange={e=>setEdgeForm(f=>({ ...f, action: e.target.value }))} style={{ width:'100%', marginBottom:12 }}>
            <option value="continue">일반 진행</option>
            <option value="win">승리</option>
            <option value="lose">패배</option>
            <option value="goto_set">다른 세트로 이동</option>
          </select>
          <button onClick={()=>{
            // edgeForm → 실제 엣지 데이터 반영
            let cond=[]; try{cond=JSON.parse(edgeForm.conditions||'[]')}catch{}
            const tw = edgeForm.trigger_words.split(',').map(s=>s.trim()).filter(Boolean)
            const pr = parseInt(edgeForm.priority)||0
            const pb = Math.max(0, Math.min(1, parseFloat(edgeForm.probability)||0))
            const fb = !!edgeForm.fallback
            const ac = edgeForm.action

            setEdges(eds=>eds.map(e=>{
              if(e.id!==selectedEdge.id) return e
              const data = { ...(e.data||{}), trigger_words:tw, conditions:cond, priority:pr, probability:pb, fallback:fb, action:ac }
              return { ...e, data }
            }))
          }} style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700 }}>
            적용
          </button>
        </div>

        <div style={{ borderTop:'1px solid #eee', paddingTop:12 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>전역 변수 규칙(세트 전체)</div>
          <div style={{ display:'grid', gap:8 }}>
            {(globalRules||[]).map((r,i)=>(
              <div key={i} style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:8, display:'grid', gap:6 }}>
                <input value={r.name} placeholder="변수명" onChange={e=>updateGlobalRule(i,{name:e.target.value})} />
                <select value={r.when} onChange={e=>updateGlobalRule(i,{when:e.target.value})}>
                  <option value="prev_ai_contains">이전응답 포함</option>
                  <option value="prev_prompt_contains">이전프롬프트 포함</option>
                  <option value="prev_ai_regex">이전응답 정규식</option>
                  <option value="turn_gte">턴 ≥</option>
                  <option value="turn_lte">턴 ≤</option>
                </select>
                <input value={r.value||''} placeholder="값/패턴" onChange={e=>updateGlobalRule(i,{value:e.target.value})} />
                <select value={r.scope||'last2'} onChange={e=>updateGlobalRule(i,{scope:e.target.value})}>
                  <option value="last1">마지막 1줄</option>
                  <option value="last2">마지막 2줄</option>
                  <option value="last5">마지막 5줄</option>
                  <option value="all">전체</option>
                </select>
                <button onClick={()=>removeGlobalRule(i)} style={{ alignSelf:'start' }}>삭제</button>
              </div>
            ))}
          </div>
          <button onClick={addGlobalRule} style={{ marginTop:8, padding:'6px 10px', borderRadius:8, background:'#0ea5e9', color:'#fff' }}>+ 전역 규칙</button>
        </div>
      </div>
    )
  }

  return <div style={{ padding:12, color:'#64748b' }}>노드 또는 브릿지를 선택하세요</div>
}
