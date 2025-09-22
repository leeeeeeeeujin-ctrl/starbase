// components/maker/SidePanel.js
import { useEffect, useMemo, useState } from 'react'

/** 공통 JSON 편집 블록 */
function JsonArea({ label, value, onChange, rows=4, placeholder='[]' }) {
  const [text, setText] = useState(() => {
    try { return JSON.stringify(value ?? [], null, 2) } catch { return placeholder }
  })
  useEffect(() => {
    try { setText(JSON.stringify(value ?? [], null, 2)) } catch { setText(placeholder) }
  }, [value])

  return (
    <div>
      <label style={{ fontSize:12, color:'#64748b' }}>{label}</label>
      <textarea
        rows={rows}
        value={text}
        placeholder={placeholder}
        onChange={e=>{
          setText(e.target.value)
          try { onChange(JSON.parse(e.target.value || '[]')) } catch {}
        }}
        style={{ width:'100%', fontFamily:'monospace' }}
      />
    </div>
  )
}

/** 조건 빌더(브릿지) */
function ConditionBuilder({ selectedEdge, setEdges, pushToForm }) {
  const [typeIdx, setTypeIdx] = useState(0)
  const [values, setValues] = useState({})

  const DEF = [
    { type:'probability', label:'확률',
      params:[{key:'p',label:'확률(0~1)',type:'number',step:'0.05',min:'0',max:'1',defaultValue:'0.5'}],
      toJSON:v=>({type:'random', p:Number(v.p??0.5)}), toSummary:v=>`확률 ${Math.round((Number(v.p??0.5))*100)}%`
    },
    { type:'turn_gte', label:'턴 ≥', params:[{key:'value',label:'값',type:'number',defaultValue:'2'}],
      toJSON:v=>({type:'turn_gte', value:Number(v.value??1)}), toSummary:v=>`턴 ≥ ${v.value??1}` },
    { type:'turn_lte', label:'턴 ≤', params:[{key:'value',label:'값',type:'number',defaultValue:'5'}],
      toJSON:v=>({type:'turn_lte', value:Number(v.value??1)}), toSummary:v=>`턴 ≤ ${v.value??1}` },
    { type:'prev_ai_contains', label:'이전 AI 포함',
      params:[
        {key:'value',label:'문구',type:'text'},
        {key:'scope',label:'범위',type:'select',options:[
          {value:'last1',label:'마지막 1줄'},{value:'last2',label:'마지막 2줄'},
          {value:'last5',label:'마지막 5줄'},{value:'all',label:'전체'}
        ],defaultValue:'last2'}
      ],
      toJSON:v=>({type:'prev_ai_contains', value:String(v.value||''), scope:v.scope||'last2'}),
      toSummary:v=>`이전응답 ${v.scope||'last2'} "${v.value||''}"`
    },
    { type:'prev_prompt_contains', label:'이전 프롬 포함',
      params:[
        {key:'value',label:'문구',type:'text'},
        {key:'scope',label:'범위',type:'select',options:[
          {value:'last1',label:'마지막 1줄'},{value:'last2',label:'마지막 2줄'},{value:'all',label:'전체'}
        ],defaultValue:'last1'}
      ],
      toJSON:v=>({type:'prev_prompt_contains', value:String(v.value||''), scope:v.scope||'last1'}),
      toSummary:v=>`이전프롬 ${v.scope||'last1'} "${v.value||''}"`
    },
    { type:'prev_ai_regex', label:'이전 AI 정규식',
      params:[
        {key:'pattern',label:'패턴',type:'text'},{key:'flags',label:'플래그',type:'text'},
        {key:'scope',label:'범위',type:'select',options:[
          {value:'last1',label:'마지막 1줄'},{value:'last2',label:'마지막 2줄'},{value:'all',label:'전체'}
        ],defaultValue:'last1'}
      ],
      toJSON:v=>({type:'prev_ai_regex', pattern:String(v.pattern||''), flags:String(v.flags||''), scope:v.scope||'last1'}),
      toSummary:v=>`정규식 /${v.pattern||''}/${v.flags||''} (${v.scope||'last1'})`
    },
    { type:'visited_slot', label:'경유 슬롯', params:[{key:'slot_id',label:'슬롯ID',type:'text'}],
      toJSON:v=>({type:'visited_slot', slot_id: String(v.slot_id||'')}),
      toSummary:v=>`경유 #${v.slot_id||''}` },
    { type:'var_on', label:'변수 활성', params:[
        {key:'names',label:'변수명들(공백)',type:'text',placeholder:'A B C'},
        {key:'mode',label:'모드',type:'select',options:[
          {value:'any',label:'하나 이상'},{value:'all',label:'모두'}
        ],defaultValue:'any'},
        {key:'scope',label:'스코프',type:'select',options:[
          {value:'both',label:'전역+로컬'},{value:'global',label:'전역'},{value:'local',label:'로컬'}
        ],defaultValue:'both'},
      ],
      toJSON:v=>({type:'var_on', names:String(v.names||'').split(/\s+/).filter(Boolean), mode:v.mode||'any', scope:v.scope||'both'}),
      toSummary:v=>`변수(${v.scope||'both'}) ${v.mode||'any'}: ${v.names||''}` },
    { type:'count', label:'역할/상태 카운트', params:[
        {key:'who',label:'대상',type:'select',options:[
          {value:'same',label:'같은 역할'},{value:'other',label:'다른 역할'},{value:'role',label:'특정 역할'},{value:'all',label:'전체'}
        ],defaultValue:'role'},
        {key:'role',label:'역할명(특정 역할)',type:'text'},
        {key:'status',label:'상태',type:'select',options:[
          {value:'alive',label:'생존'},{value:'defeated',label:'탈락'}
        ],defaultValue:'alive'},
        {key:'cmp',label:'비교',type:'select',options:[
          {value:'gte',label:'≥'},{value:'lte',label:'≤'},{value:'eq',label:'='}
        ],defaultValue:'gte'},
        {key:'value',label:'값',type:'number',defaultValue:'1'}
      ],
      toJSON:v=>({type:'count', who:v.who||'role', role:v.role||null, status:v.status||'alive', cmp:v.cmp||'gte', value:Number(v.value||1)}),
      toSummary:v=>`카운트(${v.who||'role'}/${v.status||'alive'}) ${v.cmp||'gte'} ${v.value||1}${v.role?` @${v.role}`:''}` },
    { type:'fallback', label:'Fallback', params:[], toJSON:()=>({type:'fallback'}), toSummary:()=>`Fallback` }
  ]

  const def = DEF[typeIdx]
  function buildEdgeLabel(data) {
    const parts=[]
    const conds = data?.conditions || []
    conds.forEach(c=>{
      if (c.type==='turn_gte') parts.push(`턴 ≥ ${c.value}`)
      if (c.type==='turn_lte') parts.push(`턴 ≤ ${c.value}`)
      if (c.type==='prev_ai_contains') parts.push(`이전응답 "${c.value}"`)
      if (c.type==='prev_prompt_contains') parts.push(`이전프롬 "${c.value}"`)
      if (c.type==='prev_ai_regex') parts.push(`정규식 /${c.pattern}/${c.flags||''}`)
      if (c.type==='visited_slot') parts.push(`경유 #${c.slot_id}`)
      if (c.type==='var_on') parts.push(`변수(${c.scope}) ${c.mode}: ${c.names?.join(' ')}`)
      if (c.type==='count') parts.push(`카운트(${c.who}/${c.status}) ${c.cmp} ${c.value}${c.role?` @${c.role}`:''}`)
      if (c.type==='fallback') parts.push('Fallback')
    })
    if (data?.probability!=null && data.probability!==1) parts.push(`확률 ${Math.round(Number(data.probability)*100)}%`)
    return parts.join(' | ')
  }

  function addCondition() {
    if (!selectedEdge) return
    const json = def.toJSON(values)
    setEdges(eds => eds.map(e=>{
      if (e.id !== selectedEdge.id) return e
      const conditions = [ ...(e.data?.conditions || []), json ]
      const data = { ...(e.data||{}), conditions }
      return { ...e, data, label: buildEdgeLabel(data) }
    }))
    pushToForm?.(json)
    setValues({})
  }

  return (
    <div style={{ display:'grid', gap:8 }}>
      <div style={{ fontWeight:700 }}>브릿지 조건 만들기</div>
      <select value={String(typeIdx)} onChange={e=>{ setTypeIdx(Number(e.target.value)); setValues({}) }}>
        {DEF.map((d,i)=><option key={d.type} value={i}>{d.label}</option>)}
      </select>
      <div style={{ display:'grid', gap:6 }}>
        {def.params.map(p=>{
          if (p.type==='select') {
            return (
              <label key={p.key} style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:12, color:'#555' }}>{p.label}</span>
                <select value={values[p.key] ?? p.defaultValue ?? ''} onChange={e=>setValues(v=>({ ...v, [p.key]: e.target.value }))}>
                  {(p.options||[]).map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </label>
            )
          }
          return (
            <label key={p.key} style={{ display:'grid', gap:4 }}>
              <span style={{ fontSize:12, color:'#555' }}>{p.label}</span>
              <input
                type={p.type} step={p.step} min={p.min} max={p.max} placeholder={p.placeholder}
                value={values[p.key] ?? p.defaultValue ?? ''} onChange={e=>setValues(v=>({ ...v, [p.key]: e.target.value }))}
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

/** 토큰 팔레트 */
function TokenPalette({ onInsert }) {
  const [slot, setSlot] = useState('1')
  const [prop, setProp] = useState('name')
  const [ability, setAbility] = useState('1')
  const token = prop==='ability' ? `{{slot${slot}.ability${ability}}}` : `{{slot${slot}.${prop}}}`
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
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>능력{n}</option>)}
          </select>
        )}
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <button type="button" onClick={()=>onInsert(token)}>선택 토큰</button>
        <button type="button" onClick={()=>onInsert('{{slot.random}}')}>랜덤 슬롯</button>
        <button type="button" onClick={()=>onInsert('{{random.ability}}')}>랜덤 능력(현재 슬롯)</button>
        <button type="button" onClick={()=>onInsert('{{random.choice:A|B|C}}')}>임의 선택</button>
        <button type="button" onClick={()=>onInsert('{{history.last1}}')}>마지막 줄</button>
        <button type="button" onClick={()=>onInsert('{{history.last2}}')}>마지막 2줄</button>
        <button type="button" onClick={()=>onInsert('{{history.last5}}')}>마지막 5줄</button>
      </div>
    </div>
  )
}

/** 사이드패널 메인 */
export default function SidePanel({
  selectedNode,              // {id, data}
  selectedEdge,
  setEdges,
  onInsertToken,
  globalOpts, setGlobalOpts, // 세트 전역 옵션(state는 상위에서)
  updateNodeOptions          // (nodeId, patch) => void
}) {
  const [tab, setTab] = useState('global') // 'global' | 'node' | 'edge'

  // 엣지 폼
  const [edgeForm, setEdgeForm] = useState({
    trigger_words:'', conditions:'[]', priority:0, probability:1.0, fallback:false, action:'continue'
  })
  useEffect(()=>{
    if (!selectedEdge) return
    setEdgeForm({
      trigger_words: (selectedEdge.data?.trigger_words || []).join(','),
      conditions: JSON.stringify(selectedEdge.data?.conditions || []),
      priority: selectedEdge.data?.priority ?? 0,
      probability: selectedEdge.data?.probability ?? 1.0,
      fallback: !!selectedEdge.data?.fallback,
      action: selectedEdge.data?.action || 'continue',
    })
  }, [selectedEdge])

  function applyEdgeForm() {
    if (!selectedEdge) return
    let cond = []
    try { cond = JSON.parse(edgeForm.conditions || '[]') } catch {}
    const trigger_words = edgeForm.trigger_words.split(',').map(s=>s.trim()).filter(Boolean)
    const priority = parseInt(edgeForm.priority) || 0
    const probability = Math.max(0, Math.min(1, parseFloat(edgeForm.probability) || 0))
    const fallback = !!edgeForm.fallback
    const action = edgeForm.action

    setEdges(eds => eds.map(e=>{
      if (e.id !== selectedEdge.id) return e
      const data = { ...(e.data||{}), trigger_words, conditions: cond, priority, probability, fallback, action }
      return { ...e, data, label: rebuildLabel(data) }
    }))
  }
  function rebuildLabel(data){
    const parts=[]
    const conds = data?.conditions || []
    conds.forEach(c=>{
      if (c.type==='turn_gte') parts.push(`턴 ≥ ${c.value}`)
      if (c.type==='turn_lte') parts.push(`턴 ≤ ${c.value}`)
      if (c.type==='prev_ai_contains') parts.push(`이전응답 "${c.value}"`)
      if (c.type==='prev_prompt_contains') parts.push(`이전프롬 "${c.value}"`)
      if (c.type==='prev_ai_regex') parts.push(`정규식 /${c.pattern}/${c.flags||''}`)
      if (c.type==='visited_slot') parts.push(`경유 #${c.slot_id}`)
      if (c.type==='var_on') parts.push(`변수(${c.scope}) ${c.mode}: ${c.names?.join(' ')}`)
      if (c.type==='count') parts.push(`카운트(${c.who}/${c.status}) ${c.cmp} ${c.value}${c.role?` @${c.role}`:''}`)
      if (c.type==='fallback') parts.push('Fallback')
    })
    if (data?.probability!=null && data.probability!==1) parts.push(`확률 ${Math.round(Number(data.probability)*100)}%`)
    if (data?.fallback) parts.push('Fallback')
    return parts.join(' | ')
  }

  // 전역 변수 편집기
  function GlobalVars() {
    return (
      <div style={{ display:'grid', gap:10 }}>
        <b>세트 전역 변수</b>
        <JsonArea
          label="전역 수동변수(JSON 배열: {name,instruction})"
          value={globalOpts.manual_vars_global}
          onChange={(v)=>setGlobalOpts(o=>({ ...(o||{}), manual_vars_global:v }))}
        />
        <JsonArea
          label="전역 적극변수(JSON 배열: {name,ruleText})"
          value={globalOpts.active_vars_global}
          onChange={(v)=>setGlobalOpts(o=>({ ...(o||{}), active_vars_global:v }))}
        />
      </div>
    )
  }

  // 노드 로컬 변수 편집기 + 가시성
  function NodeVars() {
    if (!selectedNode) return <div style={{ color:'#64748b' }}>노드를 선택하세요</div>
    const opts = selectedNode.data?.options || {}
    const onOpt = (patch) => updateNodeOptions?.(selectedNode.id, patch)
    return (
      <div style={{ display:'grid', gap:10 }}>
        <b>노드 로컬 변수 & 가시성</b>

        <label style={{ display:'flex', alignItems:'center', gap:8 }}>
          <input
            type="checkbox"
            checked={!!opts.invisible}
            onChange={e=>onOpt({ invisible: e.target.checked })}
          />
          인비저블(특정 슬롯에만 노출)
        </label>
        {opts.invisible && (
          <div>
            <label style={{ fontSize:12, color:'#64748b' }}>보이는 슬롯(쉼표): 예) 1,3,5</label>
            <input
              value={Array.isArray(opts.visible_slots) ? opts.visible_slots.join(',') : ''}
              onChange={e=>{
                const arr = e.target.value.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n))
                onOpt({ visible_slots: arr })
              }}
              style={{ width:'100%' }}
            />
          </div>
        )}

        <JsonArea
          label="로컬 수동변수(JSON 배열: {name,instruction})"
          value={opts.manual_vars_local}
          onChange={(v)=>onOpt({ manual_vars_local:v })}
        />
        <JsonArea
          label="로컬 적극변수(JSON 배열: {name,ruleText})"
          value={opts.active_vars_local}
          onChange={(v)=>onOpt({ active_vars_local:v })}
        />
      </div>
    )
  }

  // 엣지 탭(조건 + 고급 폼)
  function EdgeEditor() {
    if (!selectedEdge) return <div style={{ color:'#64748b' }}>브릿지를 선택하세요</div>
    return (
      <div style={{ display:'grid', gap:10 }}>
        <ConditionBuilder selectedEdge={selectedEdge} setEdges={setEdges}
          pushToForm={(json)=>setEdgeForm(f=>{
            let arr=[]; try{arr=JSON.parse(f.conditions||'[]')}catch{}
            arr.push(json); return { ...f, conditions: JSON.stringify(arr) }
          })} />
        <div style={{ borderTop:'1px solid #eee', paddingTop:10 }}>
          <label style={{ fontSize:12 }}>조건(JSON 배열) 고급 편집</label>
          <textarea
            rows={4}
            value={edgeForm.conditions}
            onChange={e=>setEdgeForm(f=>({ ...f, conditions:e.target.value }))}
            style={{ width:'100%', fontFamily:'monospace' }}
          />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <label style={{ fontSize:12 }}>우선순위</label>
            <input type="number" value={edgeForm.priority}
              onChange={e=>setEdgeForm(f=>({ ...f, priority:e.target.value }))} style={{ width:'100%' }}/>
          </div>
          <div>
            <label style={{ fontSize:12 }}>확률(0~1)</label>
            <input type="number" step="0.05" min="0" max="1" value={edgeForm.probability}
              onChange={e=>setEdgeForm(f=>({ ...f, probability:e.target.value }))} style={{ width:'100%' }}/>
          </div>
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:8 }}>
          <input type="checkbox" checked={edgeForm.fallback}
            onChange={e=>setEdgeForm(f=>({ ...f, fallback:e.target.checked }))}/>
          Fallback(어느 조건도 안 맞을 때)
        </label>
        <label style={{ fontSize:12 }}>액션</label>
        <select value={edgeForm.action} onChange={e=>setEdgeForm(f=>({ ...f, action:e.target.value }))} style={{ width:'100%' }}>
          <option value="continue">일반 진행</option>
          <option value="win">승리</option>
          <option value="lose">패배</option>
          <option value="goto_set">다른 세트로 이동</option>
        </select>
        <button type="button" onClick={applyEdgeForm}
          style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700 }}>
          폼 값 반영
        </button>
      </div>
    )
  }

  // 탭 헤더 + 본문
  const tabs = useMemo(()=>[
    { key:'global', name:'세트 전역 변수', body:<GlobalVars/> },
    { key:'node',   name:'노드 로컬 변수', body:<NodeVars/> },
    { key:'edge',   name:'브릿지 조건',   body:<EdgeEditor/> },
  ], [selectedNode, selectedEdge, globalOpts])

  return (
    <div style={{ padding:12, display:'grid', gap:12, gridTemplateRows:'auto auto 1fr auto' }}>
      {/* 탭 */}
      <div style={{ display:'flex', gap:6 }}>
        {tabs.map(t=>(
          <button key={t.key}
            onClick={()=>setTab(t.key)}
            style={{ padding:'6px 10px', borderRadius:8, background: t.key===tab ? '#111827' : '#f3f4f6',
                     color: t.key===tab ? '#fff' : '#111827' }}>
            {t.name}
          </button>
        ))}
      </div>

      {/* 설명 */}
      {tab!=='edge' && (
        <div style={{ color:'#64748b' }}>
          응답의 마지막 줄은 결론, 마지막에서 두 번째 줄은 만족 변수명(공백 구분)입니다.
          전역/로컬 수동변수는 “둘째 줄에 이름을 적으라”는 지시문, 적극변수는 “둘째 줄에 이름이 있을 때 규칙을 추가”합니다.
        </div>
      )}

      {/* 본문 */}
      <div style={{ overflow:'auto' }}>
        {tabs.find(t=>t.key===tab)?.body}
      </div>

      {/* 토큰 팔레트(항상 노출) */}
      <TokenPalette onInsert={onInsertToken} />
    </div>
  )
}
