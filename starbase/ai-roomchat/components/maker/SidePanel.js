// components/maker/SidePanel.js
import { useEffect, useState } from 'react'

/* ===========================
   조건 빌더(기존 유지)
   =========================== */
function ConditionBuilder({ selectedEdge, setEdges, pushToForm }) {
  const [typeIdx, setTypeIdx] = useState(0)
  const [values, setValues] = useState({})

  const CONDITION_DEFS = [
    {
      type: 'probability',
      label: '확률로 진행',
      params: [{ key:'p', label:'확률(0~1)', type:'number', step:'0.05', min:'0', max:'1', defaultValue:'0.3' }],
      toJSON: v => ({ type:'random', p: Number(v.p ?? 0.3) }),
    },
    {
      type: 'turn_gte',
      label: '특정 턴 이상',
      params: [{ key:'value', label:'턴 ≥', type:'number', defaultValue:'3' }],
      toJSON: v => ({ type:'turn_gte', value: Number(v.value ?? 1) }),
    },
    {
      type: 'turn_lte',
      label: '특정 턴 이하',
      params: [{ key:'value', label:'턴 ≤', type:'number', defaultValue:'5' }],
      toJSON: v => ({ type:'turn_lte', value: Number(v.value ?? 1) }),
    },
    {
      type: 'prev_ai_contains',
      label: '이전 AI 응답에 단어 포함',
      params: [
        { key:'value', label:'단어', type:'text', placeholder:'예) 승리' },
        { key:'scope', label:'대상 구간', type:'select', options:[
          {value:'last1', label:'마지막 한 줄'},
          {value:'last2', label:'마지막 두 줄'},
          {value:'last5', label:'마지막 5줄'},
          {value:'all',   label:'전체 응답'},
        ], defaultValue:'last2' }
      ],
      toJSON: v => ({ type:'prev_ai_contains', value:String(v.value||''), scope:v.scope||'last2' }),
    },
    {
      type: 'prev_prompt_contains',
      label: '이전 프롬프트에 문구 포함',
      params: [
        { key:'value', label:'문구', type:'text', placeholder:'예) 탈출' },
        { key:'scope', label:'대상 구간', type:'select', options:[
          {value:'last1', label:'마지막 한 줄'},
          {value:'last2', label:'마지막 두 줄'},
          {value:'all',   label:'전체 프롬프트'},
        ], defaultValue:'last1' }
      ],
      toJSON: v => ({ type:'prev_prompt_contains', value:String(v.value||''), scope:v.scope||'last1' }),
    },
    {
      type: 'prev_ai_regex',
      label: '이전 AI 응답 정규식',
      params: [
        { key:'pattern', label:'패턴', type:'text', placeholder:'예) ^패배\\b' },
        { key:'flags',   label:'플래그', type:'text', placeholder:'예) i' },
        { key:'scope',   label:'대상 구간', type:'select', options:[
          {value:'last1', label:'마지막 한 줄'},
          {value:'last2', label:'마지막 두 줄'},
          {value:'all',   label:'전체 응답'},
        ], defaultValue:'last1' }
      ],
      toJSON: v => ({ type:'prev_ai_regex', pattern:String(v.pattern||''), flags:String(v.flags||''), scope:v.scope||'last1' }),
    },
    {
      type: 'visited_slot',
      label: '특정 프롬프트(슬롯) 경유',
      params: [{ key:'slot_id', label:'슬롯 ID', type:'text', placeholder:'예) 12' }],
      toJSON: v => ({ type:'visited_slot', slot_id: v.slot_id ? String(v.slot_id) : null }),
    },
    {
      type: 'fallback',
      label: '모두 불일치 시 이 경로',
      params: [],
      toJSON: _ => ({ type:'fallback' }),
    },
  ]

  const def = CONDITION_DEFS[typeIdx]

  function buildEdgeLabel(data) {
    const parts = []
    const conds = data?.conditions || []
    conds.forEach(c => {
      if (c?.type==='turn_gte' && (c.value ?? c.gte) != null) parts.push(`턴 ≥ ${c.value ?? c.gte}`)
      if (c?.type==='turn_lte' && (c.value ?? c.lte) != null) parts.push(`턴 ≤ ${c.value ?? c.lte}`)
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
      <div style={{ fontWeight:700 }}>조건 만들기</div>

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
                  onChange={e=>setValues(v=>({ ...v, [p.key]: e.target.value }))}
                >
                  {(p.options||[]).map(opt=>(
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
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
                onChange={e=>setValues(v=>({ ...v, [p.key]: e.target.value }))}
              />
            </label>
          )
        })}
      </div>

      <button type="button" onClick={addCondition}
        style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff', fontWeight:700 }}>
        조건 추가
      </button>
    </div>
  )
}

/* ===========================
   전역/로컬 변수 규칙 에디터
   =========================== */
function VarsEditor({ title, value, onChange }) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(value ?? [], null, 2))
  const [draft, setDraft] = useState({ name:'', when:'prev_ai_contains', value:'', scope:'last2' })

  useEffect(() => {
    setJsonText(JSON.stringify(value ?? [], null, 2))
  }, [value])

  function addDraft() {
    const next = [
      ...(Array.isArray(value) ? value : []),
      { name: draft.name.trim(), when: draft.when, value: draft.value.trim(), scope: draft.scope }
    ]
    setDraft({ name:'', when:'prev_ai_contains', value:'', scope:'last2' })
    onChange?.(next)
  }
  function applyJson() {
    try {
      const arr = JSON.parse(jsonText || '[]')
      if (!Array.isArray(arr)) throw new Error('array needed')
      onChange?.(arr)
    } catch {
      alert('JSON 형식이 올바르지 않습니다.')
    }
  }

  return (
    <div style={{ display:'grid', gap:8 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <b>{title}</b>
      </div>

      {/* 빠른 추가 */}
      <div style={{ display:'grid', gap:6, gridTemplateColumns:'1fr 1fr' }}>
        <input
          placeholder="변수명 (예: resolved_escape)"
          value={draft.name}
          onChange={e=>setDraft(d=>({ ...d, name: e.target.value }))}
        />
        <select
          value={draft.when}
          onChange={e=>setDraft(d=>({ ...d, when: e.target.value }))}
        >
          <option value="prev_ai_contains">이전 AI 응답 포함</option>
          <option value="prev_prompt_contains">이전 프롬프트 포함</option>
          <option value="prev_ai_regex">이전 AI 응답 정규식</option>
          <option value="visited_slot">특정 슬롯 경유</option>
          <option value="turn_gte">턴 ≥</option>
          <option value="turn_lte">턴 ≤</option>
        </select>
        <input
          placeholder="값/패턴 (예: 탈출)"
          value={draft.value}
          onChange={e=>setDraft(d=>({ ...d, value: e.target.value }))}
        />
        <select
          value={draft.scope}
          onChange={e=>setDraft(d=>({ ...d, scope: e.target.value }))}
        >
          <option value="last1">마지막 1줄</option>
          <option value="last2">마지막 2줄</option>
          <option value="last5">마지막 5줄</option>
          <option value="all">전체</option>
        </select>
      </div>
      <div>
        <button onClick={addDraft} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #d1d5db' }}>
          + 규칙 추가
        </button>
      </div>

      {/* 고급: JSON 편집 */}
      <div>
        <textarea
          rows={6}
          value={jsonText}
          onChange={e=>setJsonText(e.target.value)}
          style={{ width:'100%', fontFamily:'monospace' }}
        />
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:6 }}>
          <button onClick={applyJson} style={{ padding:'6px 10px', borderRadius:8, background:'#111827', color:'#fff' }}>
            JSON 적용
          </button>
        </div>
      </div>
    </div>
  )
}

/* ===========================
   토큰 팔레트(기존 유지)
   =========================== */
function TokenPalette({ onInsert }) {
  const [slot, setSlot] = useState('1')
  const [prop, setProp] = useState('name')
  const [ability, setAbility] = useState('1')

  const token = prop === 'ability'
    ? `{{slot${slot}.ability${ability}}}`
    : `{{slot${slot}.${prop}}}`

  return (
    <div style={{ display:'grid', gap:8, borderTop:'1px solid #e5e7eb', marginTop:12, paddingTop:12 }}>
      <div style={{ fontWeight:700 }}>토큰 팔레트</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <select value={slot} onChange={e=>setSlot(e.target.value)}>
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>슬롯{i+1}</option>)}
        </select>
        <select value={prop} onChange={e=>setProp(e.target.value)}>
          <option value="name">이름</option>
          <option value="description">설명</option>
          <option value="ability">능력</option>
        </select>
        {prop==='ability' && (
          <select value={ability} onChange={e=>setAbility(e.target.value)}>
            {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>능력{i+1}</option>)}
          </select>
        )}
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <button type="button" onClick={()=>onInsert(token)}>선택 토큰 삽입</button>
        <button type="button" onClick={()=>onInsert('{{slot.random}}')}>랜덤 슬롯번호</button>
        <button type="button" onClick={()=>onInsert('{{random.slot.name}}')}>랜덤 슬롯 이름</button>
        <button type="button" onClick={()=>onInsert('{{random.choice:A|B|C}}')}>임의 선택</button>
        <button type="button" onClick={()=>onInsert('{{history.last1}}')}>마지막 줄</button>
        <button type="button" onClick={()=>onInsert('{{history.last2}}')}>마지막 2줄</button>
      </div>
    </div>
  )
}

/* -------------------- 사이드패널 본체 -------------------- */
export default function SidePanel({
  selectedNodeId,
  selectedEdge,
  setEdges,
  setNodes,
  onInsertToken,
  globalRules,
  setGlobalRules,
  selectedNodeData,   // ← 아래 2)에서 함께 씀
}) {
  const [showGlobal, setShowGlobal] = useState(false)
  function saveGlobalRules(next) { setGlobalRules?.(next) }
//엣지 폼(기존)
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

  // ConditionBuilder → 텍스트 JSON 즉시 반영
  function pushToForm(json) {
    setEdgeForm(f => {
      let arr = []
      try { arr = JSON.parse(f.conditions || '[]') } catch {}
      arr.push(json)
      return { ...f, conditions: JSON.stringify(arr) }
    })
  }

  /* --- 상단: 전역 변수 버튼 --- */
  const GlobalToolbar = (
    <div style={{ padding:12, borderBottom:'1px solid #eee', display:'flex', gap:8, alignItems:'center' }}>
      <button
        onClick={()=>setShowGlobal(s=>!s)}
        style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #d1d5db', background:'#fff' }}
      >
        {showGlobal ? '전역 변수 닫기' : '전역 변수 열기'}
      </button>
    </div>
  )

  // 노드 선택 시: 토큰 팔레트 + 로컬 변수 규칙
  if (selectedNodeId) {
    return (
      <div style={{ display:'grid', gridTemplateRows:'auto 1fr', height:'100%' }}>
        {GlobalToolbar}
        {showGlobal && (
          <div style={{ padding:12, borderBottom:'1px solid #eee' }}>
            <VarsEditor
              title="전역 변수 규칙(세트 전체에 반복 적용)"
              value={globalRules}
              onChange={saveGlobalRules}
            />
          </div>
        )}

        <div style={{ padding:12, overflow:'auto' }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>프롬프트 편집</div>
          <div style={{ color:'#64748b' }}>
            프롬프트 텍스트는 카드에서 수정하세요. 아래 버튼으로 토큰을 추가할 수 있어요.
          </div>
          <TokenPalette onInsert={onInsertToken} />

          <div style={{ marginTop:16 }}>
            <VarsEditor
              title="로컬 변수 규칙(이 노드에만 적용)"
              value={/* 선택 노드의 현 상태를 읽어와야 함: 부모에서 내려주는 대신, setNodes만 있으므로 여기서는 안내만 */ []}
              onChange={(arr)=>{
                // 선택 노드 data에 반영
                setNodes(nds => nds.map(n =>
                  n.id===selectedNodeId ? { ...n, data:{ ...n.data, var_rules_local: arr }} : n
                ))
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // 엣지 선택 시: 기존 브릿지 폼 유지
  if (selectedEdge) {
    return (
      <div style={{ display:'grid', gridTemplateRows:'auto 1fr', height:'100%' }}>
        {GlobalToolbar}
        {showGlobal && (
          <div style={{ padding:12, borderBottom:'1px solid #eee' }}>
            <VarsEditor
              title="전역 변수 규칙(세트 전체에 반복 적용)"
              value={globalRules}
              onChange={saveGlobalRules}
            />
          </div>
        )}

        <div style={{ padding:12, overflow:'auto' }}>
          <h3 style={{ marginTop:0 }}>브릿지 조건</h3>

          <ConditionBuilder selectedEdge={selectedEdge} setEdges={setEdges} pushToForm={pushToForm} />

          {/* 고급: JSON 직접 편집 */}
          <div style={{ marginTop:16, borderTop:'1px solid #eee', paddingTop:12 }}>
            <label style={{ fontSize:12 }}>조건(JSON 배열) 고급 편집</label>
            <textarea
              value={edgeForm.conditions}
              onChange={e=>setEdgeForm(f=>({ ...f, conditions: e.target.value }))}
              rows={4}
              style={{ width:'100%', marginBottom:8, fontFamily:'monospace' }}
            />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div>
              <label style={{ fontSize:12 }}>우선순위</label>
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
                type="number" step="0.05" min="0" max="1"
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
            type="button"
            onClick={applyEdgeForm}
            style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700, width:'100%', marginTop:4 }}
          >
            폼 값 반영
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'grid', gridTemplateRows:'auto 1fr', height:'100%' }}>
      {GlobalToolbar}
      {showGlobal && (
        <div style={{ padding:12 }}>
          <VarsEditor
            title="전역 변수 규칙(세트 전체에 반복 적용)"
            value={globalRules}
            onChange={saveGlobalRules}
          />
        </div>
      )}
      {!showGlobal && <div style={{ padding:12, color:'#64748b' }}>노드/브릿지를 선택하세요</div>}
    </div>
  )
}
