// components/maker/SidePanel.js
import { useEffect, useMemo, useState } from 'react'

/* ===========================
   내장 ConditionBuilder (기존)
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
   내장 ConditionBuilder 끝
   =========================== */

/* 토큰 팔레트 (기존) */
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
        <button type="button" onClick={()=>onInsert('{{history.last5}}')}>마지막 5줄</button>
      </div>
    </div>
  )
}

/* ===== 변수 규칙 에디터 (전역/로컬 공용) ===== */
function VarRuleRow({ value, onChange, onRemove }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr auto', gap:6, alignItems:'center' }}>
      <input
        placeholder="변수명 (예: WIN_TOKEN)"
        value={value?.name ?? ''}
        onChange={e=>onChange({ ...value, name: e.target.value })}
      />
      <input
        placeholder="만족 조건 설명 (엔진에서 해석할 규칙/조건)"
        value={value?.when ?? ''}
        onChange={e=>onChange({ ...value, when: e.target.value })}
      />
      <button type="button" onClick={onRemove}>삭제</button>
    </div>
  )
}

function VarRulesEditor({ title, value = [], onChange }) {
  function add() {
    onChange([...(value||[]), { name:'', when:'' }])
  }
  function updateAt(i, next) {
    const arr = [...(value||[])]
    arr[i] = next
    onChange(arr)
  }
  function removeAt(i) {
    const arr = [...(value||[])]
    arr.splice(i,1)
    onChange(arr)
  }

  return (
    <div style={{ borderTop:'1px solid #e5e7eb', marginTop:12, paddingTop:12 }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>{title}</div>
      <div style={{ display:'grid', gap:6 }}>
        {(value||[]).map((r, i) => (
          <VarRuleRow
            key={i}
            value={r}
            onChange={(next)=>updateAt(i, next)}
            onRemove={()=>removeAt(i)}
          />
        ))}
        <button type="button" onClick={add} style={{ padding:'6px 10px', borderRadius:8, background:'#2563eb', color:'#fff' }}>
          + 규칙 추가
        </button>
      </div>
    </div>
  )
}

/* ===== 사이드패널 본체 =====
   props 추가:
   - globalRules: 전역 변수 규칙 배열 (set 단위)
   - setGlobalRules: setter
   - setNodes: 로컬 규칙을 노드 data에 반영할 때 필요
*/
export default function SidePanel({
  selectedNodeId,
  selectedEdge,
  setEdges,
  setNodes,
  onInsertToken,
  globalRules,
  setGlobalRules,
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

  // ConditionBuilder에서 추가한 JSON을 즉시 텍스트폼에도 반영
  function pushToForm(json) {
    setEdgeForm(f => {
      let arr = []
      try { arr = JSON.parse(f.conditions || '[]') } catch {}
      arr.push(json)
      return { ...f, conditions: JSON.stringify(arr) }
    })
  }

  // 현재 선택 노드 데이터(로컬 변수 규칙 접근용)
  const selectedNode = useMemo(()=>null, []) // 부모에서 주는 게 아니므로, 여기서는 편집만 담당
  // 로컬 규칙 setter 헬퍼
  function setLocalRulesForSelected(updater) {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n => {
      if (n.id !== selectedNodeId) return n
      const prev = n.data?.var_rules_local || []
      const next = typeof updater === 'function' ? updater(prev) : updater
      return { ...n, data: { ...n.data, var_rules_local: next } }
    }))
  }

  /* ====== 렌더링 분기 ====== */

  // 노드 선택 시: 프롬프트 편집 + 로컬 변수 규칙
  if (selectedNodeId) {
    // 선택 노드의 현재 로컬 규칙 읽기
    let localRules = []
    setNodes(nds => {
      const found = nds.find(n => n.id === selectedNodeId)
      localRules = found?.data?.var_rules_local || []
      return nds // no-op (값만 읽고 반환)
    })

    return (
      <div style={{ padding:12 }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>프롬프트 편집</div>
        <div style={{ color:'#64748b' }}>
          프롬프트 텍스트는 카드에서 수정하세요. 아래 버튼으로 토큰을 추가할 수 있어요.
        </div>
        <TokenPalette onInsert={onInsertToken} />

        <VarRulesEditor
          title="로컬 변수 규칙 (이 노드에만 적용)"
          value={localRules}
          onChange={(arr)=>setLocalRulesForSelected(arr)}
        />
      </div>
    )
  }

  // 엣지 선택 시: 브릿지 조건
  if (selectedEdge) {
    return (
      <div style={{ padding:12 }}>
        <h3 style={{ marginTop:0 }}>브릿지 조건</h3>

        <ConditionBuilder selectedEdge={selectedEdge} setEdges={setEdges} pushToForm={pushToForm} />

        {/* 고급: 직접 JSON 수정 */}
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
          Fallback(어느 조건도 안 맞을 때)
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
          <option value="goto_set">다른 세트로 이동</option>
        </select>

        <button
          type="button"
          onClick={applyEdgeForm}
          style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700, width:'100%', marginTop:4 }}
        >
          폼 값 반영
        </button>
      </div>
    )
  }

  // 아무것도 선택 안 됐을 때: 전역 변수 규칙
  return (
    <div style={{ padding:12 }}>
      <div style={{ fontWeight:700, marginBottom:8 }}>전역 변수 규칙 (세트 전체에 반복 적용)</div>
      <div style={{ color:'#64748b', marginBottom:8 }}>
        어떤 프롬프트에서든 공통으로 “만족하면 변수명을 마지막-2번째 줄에 기재”하도록 강제하는 규칙입니다.
      </div>
      <VarRulesEditor
        title="전역 변수 규칙"
        value={globalRules || []}
        onChange={setGlobalRules}
      />
      <div style={{ marginTop:10, color:'#6b7280', fontSize:12 }}>
        * 저장 버튼은 상단 툴바에 있습니다. (세트 저장 시 전역/로컬 규칙이 함께 반영)
      </div>
    </div>
  )
}
