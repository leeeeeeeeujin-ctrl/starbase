// components/maker/SidePanel.js
import { useEffect, useState } from 'react'

/* ─────────────────────────────────────────
   공통: 토큰 팔레트(프롬프트에 변수 삽입)
   ───────────────────────────────────────── */
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
        <button type="button" onClick={()=>onInsert('{{random.choice:A|B|C}}')}>임의 선택</button>
        <button type="button" onClick={()=>onInsert('{{history.last1}}')}>마지막 줄</button>
        <button type="button" onClick={()=>onInsert('{{history.last2}}')}>마지막 2줄</button>
        <button type="button" onClick={()=>onInsert('{{history.last5}}')}>마지막 5줄</button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────
   노드 옵션: 수동 변수/적극 변수 에디터
   - options.manual_vars: [{name, instruction}]
   - options.active_vars: [{name, ruleText}]
   ───────────────────────────────────────── */
function VarListEditor({ kind, read, write }) {
  const [list, setLocal] = useState([])

  useEffect(()=>{ setLocal(read() || []) }, [read])

  function add() {
    setLocal(prev => {
      const next = [...prev, kind === 'manual'
        ? { name:'', instruction:'' }
        : { name:'', ruleText:'' }
      ]
      write(next)
      return next
    })
  }
  function update(i, field, val) {
    setLocal(prev => {
      const next = prev.map((row, idx)=> idx===i ? { ...row, [field]: val } : row)
      write(next)
      return next
    })
  }
  function remove(i) {
    setLocal(prev => {
      const next = prev.filter((_,idx)=> idx!==i)
      write(next)
      return next
    })
  }

  return (
    <div style={{ display:'grid', gap:8 }}>
      {(list||[]).map((row, i)=>(
        <div key={i} style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:8, display:'grid', gap:6 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
            <input
              placeholder="변수명 (예: VAR_A)"
              value={row.name || ''}
              onChange={e=>update(i,'name',e.target.value)}
            />
            <button onClick={()=>remove(i)} style={{ padding:'6px 10px' }}>삭제</button>
          </div>
          {kind==='manual' ? (
            <textarea
              rows={2}
              placeholder="변수 내용/조건 (예: '상대 수비 2명 탈락 시')"
              value={row.instruction || ''}
              onChange={e=>update(i,'instruction',e.target.value)}
              style={{ width:'100%', fontFamily:'inherit' }}
            />
          ) : (
            <textarea
              rows={2}
              placeholder="규칙 텍스트 (예: '수비 묘사 가중치 0.7, 도덕 서술 금지')"
              value={row.ruleText || ''}
              onChange={e=>update(i,'ruleText',e.target.value)}
              style={{ width:'100%', fontFamily:'inherit' }}
            />
          )}
        </div>
      ))}
      <button onClick={add} style={{ padding:'6px 10px', borderRadius:8, background:'#0ea5e9', color:'#fff' }}>
        + {kind==='manual' ? '수동 변수' : '적극 변수'} 추가
      </button>
    </div>
  )
}

export default function SidePanel({
  selectedNodeId,
  selectedEdge,
  setNodes,
  setEdges,
  onInsertToken,
}) {
  // 엣지 폼
  const [edgeForm, setEdgeForm] = useState({
    trigger_words: '',
    conditions: '[]',
    priority: 0,
    probability: 1.0,
    fallback: false,
    action: 'continue'
  })

  // 선택된 엣지 → 폼 동기화
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

  // 라벨 재생성
  function rebuildLabel(data){
    const parts = []
    const conds = data?.conditions || []
    conds.forEach(c => {
      if (c?.type==='turn_gte' && (c.value ?? c.gte) != null) parts.push(`턴 ≥ ${c.value ?? c.gte}`)
      if (c?.type==='turn_lte' && (c.value ?? c.lte) != null) parts.push(`턴 ≤ ${c.value ?? c.lte}`)
      if (c?.type==='prev_ai_contains') parts.push(`이전응답 "${c.value}"`)
      if (c?.type==='prev_prompt_contains') parts.push(`이전프롬 "${c.value}"`)
      if (c?.type==='prev_ai_regex') parts.push(`이전응답 /${c.pattern}/${c.flags||''}`)
      if (c?.type==='visited_slot') parts.push(`경유 #${c.slot_id ?? '?'}`)
      if (c?.type==='fallback') parts.push('Fallback')
    })
    const p = data?.probability
    if (p != null && p !== 1) parts.push(`확률 ${Math.round(Number(p)*100)}%`)
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

  // ── 노드(프롬프트) 선택 시: 인비저블/가시 슬롯 + 변수 에디터/토큰 팔레트
  if (selectedNodeId) {
    // 선택 노드 data 읽기/쓰기(부모 nodes에 직접 반영)
    const readOptions = () => {
      let opt = {}
      // 최신 값을 보여주기 위해 nodes에서 직접 읽어옴
      // (setNodes는 읽을 수 없으므로 window 전역을 parent에서 갱신해둠)
      if (typeof window !== 'undefined' && window.__RF_NODE_DATA && window.__RF_NODE_DATA.options) {
        opt = window.__RF_NODE_DATA.options
      }
      return opt
    }
    const writeOptions = (patch) => {
      setNodes(nds => nds.map(n => {
        if (n.id !== selectedNodeId) return n
        const nextOptions = { ...(n.data.options||{}), ...patch }
        // 사이드패널 새로고침용 스냅샷
        if (typeof window !== 'undefined') {
          window.__RF_NODE_DATA = { ...n.data, options: nextOptions }
        }
        return { ...n, data: { ...n.data, options: nextOptions } }
      }))
    }

    const opt = readOptions()
    const visibleValue = Array.isArray(opt?.visible_slots) ? opt.visible_slots.join(',') : ''

    return (
      <div style={{ padding:12 }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>프롬프트 편집</div>
        <div style={{ color:'#64748b' }}>프롬프트 텍스트는 카드에서 수정하세요. 아래 버튼으로 토큰을 추가할 수 있어요.</div>
        <TokenPalette onInsert={onInsertToken} />

        {/* 가시성 */}
        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #eee' }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>가시성</div>
          <label style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input
              type="checkbox"
              checked={!!opt?.invisible}
              onChange={e=>writeOptions({ invisible: e.target.checked })}
            />
            인비저블(특정 슬롯에서만 보이게)
          </label>
          <div style={{ fontSize:12, color:'#64748b', margin:'6px 0 4px' }}>
            허용 슬롯 번호(콤마 구분, 예: 1,3,5). 비우면 전부 비가시.
          </div>
          <input
            placeholder="예: 1,3,5"
            value={visibleValue}
            onChange={e=>{
              const arr = e.target.value.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n))
              writeOptions({ visible_slots: arr })
            }}
            style={{ width:'100%' }}
          />
        </div>

        {/* 수동 변수 */}
        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #eee' }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>수동 변수</div>
          <VarListEditor
            kind="manual"
            read={()=> (readOptions().manual_vars || [])}
            write={(list)=> writeOptions({ manual_vars: list })}
          />
        </div>

        {/* 적극 변수 */}
        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #eee' }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>적극 변수</div>
          <VarListEditor
            kind="active"
            read={()=> (readOptions().active_vars || [])}
            write={(list)=> writeOptions({ active_vars: list })}
          />
        </div>
      </div>
    )
  }

  // ── 엣지 선택 시: 브릿지 폼
  if (selectedEdge) {
    return (
      <div style={{ padding:12 }}>
        <h3 style={{ marginTop:0 }}>브릿지 조건</h3>

        {/* 고급: JSON 직접 편집 */}
        <div style={{ marginTop:8 }}>
          <label style={{ fontSize:12 }}>조건(JSON 배열)</label>
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

        <div style={{ marginTop:8 }}>
          <label style={{ fontSize:12 }}>트리거 단어(콤마)</label>
          <input
            value={edgeForm.trigger_words}
            onChange={e=>setEdgeForm(f=>({ ...f, trigger_words: e.target.value }))}
            style={{ width:'100%' }}
          />
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

  return <div style={{ padding:12, color:'#64748b' }}>노드/브릿지를 선택하세요</div>
}
