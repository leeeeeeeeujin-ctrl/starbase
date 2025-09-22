// components/maker/SidePanel.js
// 선택된 노드/엣지에 따라 편집 패널 표시
// - 노드: 토큰 팔레트, 변수(JSON) 간편편집(전역/로컬, 수동/적극), 가시성 옵션 등
// - 엣지: 조건 빌더, 트리거 단어, 우선순위/확률/fallback/액션

import React, { useEffect, useState } from 'react'

/* =========================
 *  간단 조건 빌더 (확장 가능)
 * ========================= */
function ConditionBuilder({ selectedEdge, setEdges, pushToForm }) {
  const [typeIdx, setTypeIdx] = useState(0)
  const [values, setValues] = useState({})

  const CONDITION_DEFS = [
    // 확률
    {
      type: 'random',
      label: '확률로 진행',
      params: [{ key:'p', label:'확률(0~1)', type:'number', step:'0.05', min:'0', max:'1', defaultValue:'0.3' }],
      toJSON: v => ({ type:'random', p: Number(v.p ?? 0.3) }),
      toSummary: v => `확률 ${Math.round((Number(v.p ?? 0.3))*100)}%`,
    },
    // 턴 범위
    {
      type: 'turn_gte',
      label: '특정 턴 이상',
      params: [{ key:'value', label:'턴 ≥', type:'number', defaultValue:'3' }],
      toJSON: v => ({ type:'turn_gte', value: Number(v.value ?? 1) }),
      toSummary: v => `턴 ≥ ${v.value ?? 1}`
    },
    {
      type: 'turn_lte',
      label: '특정 턴 이하',
      params: [{ key:'value', label:'턴 ≤', type:'number', defaultValue:'5' }],
      toJSON: v => ({ type:'turn_lte', value: Number(v.value ?? 1) }),
      toSummary: v => `턴 ≤ ${v.value ?? 1}`
    },
    // 히스토리 포함/정규식
    {
      type: 'prev_ai_contains',
      label: '이전 AI 응답에 단어 포함',
      params: [
        { key:'value', label:'단어', type:'text', placeholder:'예) 승리' },
        { key:'scope', label:'대상 구간', type:'select', options:[
          {value:'last1', label:'마지막 1줄'},
          {value:'last2', label:'마지막 2줄'},
          {value:'last5', label:'마지막 5줄'},
          {value:'all',   label:'전체'},
        ], defaultValue:'last2' }
      ],
      toJSON: v => ({ type:'prev_ai_contains', value:String(v.value||''), scope:v.scope||'last2' }),
      toSummary: v => `이전응답 (${v.scope||'last2'}) "${v.value||''}" 포함`
    },
    {
      type: 'prev_prompt_contains',
      label: '이전 프롬프트에 문구 포함',
      params: [
        { key:'value', label:'문구', type:'text', placeholder:'예) 탈출' },
        { key:'scope', label:'대상 구간', type:'select', options:[
          {value:'last1', label:'마지막 1줄'},
          {value:'last2', label:'마지막 2줄'},
          {value:'all',   label:'전체'},
        ], defaultValue:'last1' }
      ],
      toJSON: v => ({ type:'prev_prompt_contains', value:String(v.value||''), scope:v.scope||'last1' }),
      toSummary: v => `이전프롬프트 (${v.scope||'last1'}) "${v.value||''}" 포함`
    },
    {
      type: 'prev_ai_regex',
      label: '이전 AI 응답 정규식',
      params: [
        { key:'pattern', label:'패턴', type:'text', placeholder:'예) ^패배\\b' },
        { key:'flags',   label:'플래그', type:'text', placeholder:'예) i' },
        { key:'scope',   label:'대상 구간', type:'select', options:[
          {value:'last1', label:'마지막 1줄'},
          {value:'last2', label:'마지막 2줄'},
          {value:'all',   label:'전체'},
        ], defaultValue:'last1' }
      ],
      toJSON: v => ({ type:'prev_ai_regex', pattern:String(v.pattern||''), flags:String(v.flags||''), scope:v.scope||'last1' }),
      toSummary: v => `이전응답 (${v.scope||'last1'}) /${v.pattern||''}/${v.flags||''}`
    },
    // 방문 슬롯/변수 온
    {
      type: 'visited_slot',
      label: '특정 프롬프트(슬롯) 경유',
      params: [{ key:'slot_id', label:'슬롯 ID', type:'text', placeholder:'예) 12' }],
      toJSON: v => ({ type:'visited_slot', slot_id: v.slot_id ? String(v.slot_id) : null }),
      toSummary: v => `경유 슬롯 #${v.slot_id ?? '?'}`
    },
    {
      type: 'var_on',
      label: '변수 ON(전역/로컬)',
      params: [
        { key:'names', label:'변수명들(콤마)', type:'text', placeholder:'power_up, haste' },
        { key:'scope', label:'범위', type:'select', options:[
          {value:'global', label:'전역'},
          {value:'local',  label:'로컬'},
          {value:'both',   label:'둘다'},
        ], defaultValue:'both' },
        { key:'mode', label:'조건', type:'select', options:[
          {value:'all', label:'모두 켜져있음'},
          {value:'any', label:'하나라도 켜짐'},
        ], defaultValue:'any' }
      ],
      toJSON: v => ({ type:'var_on', names: String(v.names||'').split(',').map(s=>s.trim()).filter(Boolean), scope: v.scope||'both', mode: v.mode||'any' }),
      toSummary: v => `변수 ${v.scope||'both'} ${v.mode||'any'}: ${v.names||''}`
    },
    // 역할/상태 카운트
    {
      type: 'count',
      label: '역할/상태 카운트 비교',
      params: [
        { key:'who',    label:'대상', type:'select', options:[
          {value:'all',     label:'전체'},
          {value:'same',    label:'내 역할과 동일'},
          {value:'other',   label:'내 역할과 다름'},
          {value:'specific',label:'특정 역할명'},
        ], defaultValue:'all' },
        { key:'role',   label:'역할명(특정 선택 시)', type:'text', placeholder:'수비' },
        { key:'status', label:'상태', type:'select', options:[
          {value:'alive', label:'생존'},
          {value:'dead',  label:'탈락'},
          {value:'won',   label:'승리'},
          {value:'lost',  label:'패배'},
        ], defaultValue:'alive' },
        { key:'cmp',    label:'비교', type:'select', options:[
          {value:'gte', label:'≥'},
          {value:'lte', label:'≤'},
          {value:'eq',  label:'='},
        ], defaultValue:'gte' },
        { key:'value',  label:'값', type:'number', defaultValue:'2' },
      ],
      toJSON: v => ({ type:'count', who:v.who||'all', role:(v.role||'').trim(), status:v.status||'alive', cmp:v.cmp||'gte', value:Number(v.value||0) }),
      toSummary: v => `count(${v.who}${v.role?`:${v.role}`:''}, ${v.status}) ${v.cmp||'gte'} ${v.value||0}`
    },
    // 폴백
    {
      type: 'fallback',
      label: '모두 불일치 시 이 경로',
      params: [],
      toJSON: _ => ({ type:'fallback' }),
      toSummary: _ => 'Fallback'
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
      if (c?.type==='var_on') parts.push(`var_on(${c.scope||'both'}:${(c.names||[]).join('|')})`)
      if (c?.type==='count') parts.push(`count ${c.cmp} ${c.value}`)
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

/* ===============
 *  토큰 팔레트
 * =============== */
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

/* =========================
 *  사이드 패널 본체
 * ========================= */
export default function SidePanel({ selectedNodeId, selectedEdge, setEdges, setNodes, onInsertToken }) {
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
      if (c?.type==='var_on') parts.push(`var_on(${c.scope||'both'}:${(c.names||[]).join('|')})`)
      if (c?.type==='count') parts.push(`count ${c.cmp} ${c.value}`)
    })
    const p = data?.probability
    if (p != null && p !== 1) parts.push(`확률 ${Math.round(Number(p)*100)}%`)
    if (data?.fallback) parts.push('Fallback')
    if (data?.action && data.action !== 'continue') parts.push(data.action)
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

  // ConditionBuilder → 텍스트폼에 즉시 반영
  function pushToForm(json) {
    setEdgeForm(f => {
      let arr = []
      try { arr = JSON.parse(f.conditions || '[]') } catch {}
      arr.push(json)
      return { ...f, conditions: JSON.stringify(arr) }
    })
  }

  // 노드 데이터 갱신 헬퍼
  function patchNode(partial) {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n => n.id===selectedNodeId ? { ...n, data:{ ...n.data, ...partial } } : n))
  }

  if (selectedNodeId) {
    // 노드 패널
    return (
      <div style={{ padding:12, display:'grid', gap:12 }}>
        <div style={{ fontWeight:700 }}>프롬프트 편집</div>
        <div style={{ color:'#64748b' }}>
          프롬프트 텍스트는 카드에서 직접 수정합니다. 아래에서 변수/가시성/토큰을 설정하세요.
        </div>

        {/* 변수(간편 JSON) */}
        <div style={{ borderTop:'1px solid #eee', paddingTop:10, display:'grid', gap:10 }}>
          <b>변수(전역/로컬, 수동/적극)</b>
          <small style={{ color:'#6b7280' }}>
            수동변수 예) <code>[{"{조건 설명}"}]을 만족하면 둘째 줄에 {"{변수명}"} 출력</code><br/>
            적극변수 예) <code>[{"{변수명}"}]이 ON이면 규칙 텍스트 추가</code>
          </small>

          <label style={{ fontSize:12 }}>전역·수동(JSON 배열)</label>
          <textarea rows={3}
            onChange={e=>{
              try { patchNode({ manual_vars_global: JSON.parse(e.target.value||'[]') }) } catch {}
            }}
            placeholder='[{"name":"win_point","instruction":"승리조건을 만족하면"}, ...]'
            style={{ width:'100%', fontFamily:'monospace' }}
          />

          <label style={{ fontSize:12 }}>전역·적극(JSON 배열)</label>
          <textarea rows={3}
            onChange={e=>{
              try { patchNode({ active_vars_global: JSON.parse(e.target.value||'[]') }) } catch {}
            }}
            placeholder='[{"name":"nerf_mercy","ruleText":"약자 배려 금지"}, ...]'
            style={{ width:'100%', fontFamily:'monospace' }}
          />

          <label style={{ fontSize:12 }}>로컬·수동(JSON 배열)</label>
          <textarea rows={3}
            onChange={e=>{
              try { patchNode({ manual_vars_local: JSON.parse(e.target.value||'[]') }) } catch {}
            }}
            placeholder='[{"name":"combo_ready","instruction":"콤보 조건 만족 시"}, ...]'
            style={{ width:'100%', fontFamily:'monospace' }}
          />

          <label style={{ fontSize:12 }}>로컬·적극(JSON 배열)</label>
          <textarea rows={3}
            onChange={e=>{
              try { patchNode({ active_vars_local: JSON.parse(e.target.value||'[]') }) } catch {}
            }}
            placeholder='[{"name":"fair_balance","ruleText":"언더도그 배제"}, ...]'
            style={{ width:'100%', fontFamily:'monospace' }}
          />
        </div>

        {/* 토큰 팔레트 */}
        <TokenPalette onInsert={onInsertToken} />
      </div>
    )
  }

  if (selectedEdge) {
    // 엣지 패널
    return (
      <div style={{ padding:12, display:'grid', gap:12 }}>
        <h3 style={{ marginTop:0 }}>브릿지 조건</h3>
        <ConditionBuilder selectedEdge={selectedEdge} setEdges={setEdges} pushToForm={pushToForm} />

        {/* 원하면 직접 JSON 편집 */}
        <div style={{ marginTop:6, borderTop:'1px solid #eee', paddingTop:10 }}>
          <label style={{ fontSize:12 }}>조건(JSON 배열) 고급 편집</label>
          <textarea
            value={edgeForm.conditions}
            onChange={e=>setEdgeForm(f=>({ ...f, conditions: e.target.value }))}
            rows={5}
            style={{ width:'100%', fontFamily:'monospace' }}
          />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <label style={{ fontSize:12 }}>
            우선순위
            <input
              type="number"
              value={edgeForm.priority}
              onChange={e=>setEdgeForm(f=>({ ...f, priority: e.target.value }))}
              style={{ width:'100%' }}
            />
          </label>
          <label style={{ fontSize:12 }}>
            확률(0~1)
            <input
              type="number" step="0.05" min="0" max="1"
              value={edgeForm.probability}
              onChange={e=>setEdgeForm(f=>({ ...f, probability: e.target.value }))}
              style={{ width:'100%' }}
            />
          </label>
        </div>

        <label style={{ fontSize:12 }}>
          트리거 단어(콤마)
          <input
            value={edgeForm.trigger_words}
            onChange={e=>setEdgeForm(f=>({ ...f, trigger_words: e.target.value }))}
            placeholder="승리, 탈출"
            style={{ width:'100%' }}
          />
        </label>

        <label style={{ display:'flex', alignItems:'center', gap:8 }}>
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
          style={{ width:'100%' }}
        >
          <option value="continue">일반 진행</option>
          <option value="win">승리</option>
          <option value="lose">패배</option>
          <option value="goto_set">다른 세트로 이동(확장)</option>
        </select>

        <button
          type="button"
          onClick={applyEdgeForm}
          style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700 }}
        >
          폼 값 반영
        </button>
      </div>
    )
  }

  return <div style={{ padding:12, color:'#64748b' }}>노드 또는 브릿지를 선택하세요</div>
}
