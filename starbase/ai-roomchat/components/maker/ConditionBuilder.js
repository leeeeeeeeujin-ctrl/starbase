import { useState } from 'react'

/** 조건 사전:
 * - label: 사용자에게 보일 문구
 * - params: 입력필드 정의
 * - toJSON(values): UI값 -> 내부 JSON
 * - toSummary(values): 엣지 라벨(사람이 읽는 한 줄 요약)
 */
const CONDITION_DEFS = [
  {
    type: 'probability',
    label: '확률로 진행',
    params: [{ key:'p', label:'확률(0~1)', type:'number', step:'0.05', min:'0', max:'1', defaultValue:'0.3' }],
    toJSON: v => ({ type:'random', p: Number(v.p ?? 0.3) }),
    toSummary: v => `확률 ${Math.round((Number(v.p ?? 0.3))*100)}%`,
  },
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
    toSummary: v => `이전응답 ( ${v.scope||'last2'} ) "${v.value||''}" 포함`
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
    toSummary: v => `이전프롬프트 ( ${v.scope||'last1'} ) "${v.value||''}" 포함`
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
    toSummary: v => `이전응답 ( ${v.scope||'last1'} ) /${v.pattern||''}/${v.flags||''}`
  },
  {
    type: 'visited_slot',
    label: '특정 프롬프트(슬롯) 경유',
    params: [{ key:'slot_id', label:'슬롯 ID', type:'text', placeholder:'예) 12' }],
    toJSON: v => ({ type:'visited_slot', slot_id: v.slot_id ? String(v.slot_id) : null }),
    toSummary: v => `경유 슬롯 #${v.slot_id ?? '?'}`
  },
  {
    type: 'fallback',
    label: '모두 불일치 시 이 경로',
    params: [],
    toJSON: _ => ({ type:'fallback' }),
    toSummary: _ => '기본 경로(Fallback)'
  },
]

export default function ConditionBuilder({ selectedEdge, setEdges, pushToForm }) {
  const [typeIdx, setTypeIdx] = useState(0)
  const def = CONDITION_DEFS[typeIdx]
  const [values, setValues] = useState({})

  function addCondition() {
    if (!selectedEdge) return
    const json = def.toJSON(values)
    const summary = def.toSummary(values)

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

      <button type="button" onClick={addCondition} style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff', fontWeight:700 }}>
        조건 추가
      </button>
    </div>
  )
}
