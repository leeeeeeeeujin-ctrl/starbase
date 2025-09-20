// components/maker/SidePanel.js
import { useEffect, useMemo, useState } from 'react'

/* ---------- 공용 ---------- */
function Chip({ children, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:999,
        background:'#fff', cursor:'pointer'
      }}
    >
      {children}
    </button>
  )
}

/* ---------- 프롬프트 토큰 팔레트 (그대로 유지) ---------- */
function TokenPalette({ onInsert }) {
  const [slot, setSlot] = useState('1')
  const [prop, setProp] = useState('name')
  const [ability, setAbility] = useState('1')

  const token = useMemo(() =>
    prop === 'ability'
      ? `{{slot${slot}.ability${ability}}}`
      : `{{slot${slot}.${prop}}}`,
    [slot, prop, ability]
  )

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
        <Chip onClick={()=>onInsert(token)}>선택 토큰 삽입</Chip>
        <Chip onClick={()=>onInsert('{{slot.random}}')}>랜덤 슬롯번호</Chip>
        <Chip onClick={()=>onInsert('{{random.slot.name}}')}>랜덤 슬롯 이름</Chip>
        <Chip onClick={()=>onInsert('{{random.choice:A|B|C}}')}>임의 선택</Chip>
        <Chip onClick={()=>onInsert('{{history.last1}}')}>마지막 줄</Chip>
        <Chip onClick={()=>onInsert('{{history.last2}}')}>마지막 2줄</Chip>
      </div>
    </div>
  )
}

/* ---------- 엣지 라벨 빌더: 확률/턴/이전응답/이전프롬프트/경유 ---------- */
function buildEdgeLabel(data) {
  const parts = []
  const conds = data?.conditions || []

  for (const c of conds) {
    // 턴
    if (c?.type === 'turn_gte' && (c.value ?? c.gte) != null) parts.push(`T≥${c.value ?? c.gte}`)
    if (c?.type === 'turn_lte' && (c.value ?? c.lte) != null) parts.push(`T≤${c.value ?? c.lte}`)

    // 이전 AI 응답/이전 프롬프트 (값은 플레이스홀더 허용)
    if (c?.type === 'prev_ai_contains') {
      const s = c.scope ? `(${c.scope})` : ''
      parts.push(`prev:"${c.value ?? '<단어>'}"${s}`)
    }
    if (c?.type === 'prev_prompt_contains') {
      const s = c.scope ? `(${c.scope})` : ''
      parts.push(`pp:"${c.value ?? '<문구>'}"${s}`)
    }
    if (c?.type === 'prev_ai_regex') {
      const s = c.scope ? `(${c.scope})` : ''
      parts.push(`prev:/…/${c.flags||''}${s}`)
    }

    // 특정 프롬프트(슬롯) 경유 여부
    if (c?.type === 'visited_slot') {
      parts.push(`via:#${c.slot_id ?? '??'}`)
    }
  }

  // 확률
  if ((data?.probability ?? 1) !== 1) parts.push(`p=${data.probability}`)

  return parts.join(' | ')
}

/* ---------- 조건 프리셋: 4종만(확률/턴/이전응답/경유) ---------- */
function ConditionPalette({ selectedEdge, setEdges, setEdgeForm }) {
  const PRESETS = [
    // 확률: 조건이 아니라 엣지 속성 → 바로 data.probability 수정
    { label: 'p=0.3', onClick: () => setEdges(eds => eds.map(e => {
      if (e.id !== selectedEdge.id) return e
      const data = { ...(e.data||{}), probability: 0.3 }
      return { ...e, data, label: buildEdgeLabel(data) }
    })) },

    // 턴 조건
    { label: 'T≥3', json: { type:'turn_gte', value:3 } },
    { label: 'T≤5', json: { type:'turn_lte', value:5 } },

    // 이전 응답/프롬프트 (값은 플레이스홀더)
    { label: 'prev:"<단어>"(last2)', json: { type:'prev_ai_contains', value:'<단어>', scope:'last2' } },
    { label: 'pp:"<문구>"(last1)',   json: { type:'prev_prompt_contains', value:'<문구>', scope:'last1' } },
    { label: 'prev:/…/i(last1)',     json: { type:'prev_ai_regex', pattern:'.+', flags:'i', scope:'last1' } },

    // 특정 프롬프트(슬롯) 경유
    { label: 'via:#<slot_id>', json: { type:'visited_slot', slot_id:null } },
  ]

  function addCond(obj) {
    if (!selectedEdge) return
    setEdges(eds => eds.map(e => {
      if (e.id !== selectedEdge.id) return e
      const prev = e.data?.conditions || []
      const conditions = [...prev, obj]
      const data = { ...(e.data || {}), conditions }
      return { ...e, data, label: buildEdgeLabel(data) }
    }))
    // 텍스트 필드에도 반영(편집 편의)
    setEdgeForm(f => {
      let arr = []
      try { arr = JSON.parse(f.conditions || '[]') } catch {}
      arr.push(obj)
      return { ...f, conditions: JSON.stringify(arr) }
    })
  }

  return (
    <div style={{ display:'grid', gap:8, borderTop:'1px solid #e5e7eb', marginTop:12, paddingTop:12 }}>
      <div style={{ fontWeight:700 }}>조건 프리셋</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {PRESETS.map((p, i) => (
          <Chip
            key={i}
            onClick={() => p.json ? addCond(p.json) : p.onClick()}
            title={p.json ? JSON.stringify(p.json) : '확률 설정'}
          >
            {p.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

/* ---------- 사이드패널 본체 ---------- */
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

    setEdges(eds => eds.map(e => {
      if (e.id !== selectedEdge.id) return e
      const data = { ...(e.data||{}), trigger_words, conditions: cond, priority, probability, fallback, action }
      return { ...e, data, label: buildEdgeLabel(data) }
    }))
  }

  // 노드 선택 → 토큰 팔레트만
  if (selectedNodeId) {
    return (
      <div style={{ padding:12 }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>노드 {selectedNodeId}</div>
        <div style={{ color:'#64748b' }}>
          프롬프트 텍스트는 카드 안에서 직접 수정합니다. 아래에서 토큰을 클릭해 추가할 수 있어요.
        </div>
        <TokenPalette onInsert={onInsertToken} />
      </div>
    )
  }

  // 엣지 선택 → 폼 + 조건 팔레트
  if (selectedEdge) {
    return (
      <div style={{ padding:12 }}>
        <h3 style={{ marginTop:0 }}>브릿지 설정</h3>

        {/* 트리거 단어 입력은 남겨두되, 라벨에는 사용하지 않음 */}
        <label style={{ fontSize:12 }}>트리거 단어(쉼표로 구분)</label>
        <input
          value={edgeForm.trigger_words}
          onChange={e=>setEdgeForm(f=>({ ...f, trigger_words: e.target.value }))}
          style={{ width:'100%', marginBottom:8 }}
        />

        <label style={{ fontSize: 12 }}>
          조건(JSON 배열) 예:&nbsp;
          <code>[{'{'}"type":"prev_ai_contains","value":"&lt;단어&gt;","scope":"last2"{'}'}]</code>
        </label>
        <textarea
          value={edgeForm.conditions}
          onChange={e=>setEdgeForm(f=>({ ...f, conditions: e.target.value }))}
          rows={4}
          style={{ width:'100%', marginBottom:8, fontFamily:'monospace' }}
        />

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
          type="button"
          onClick={applyEdgeForm}
          style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700, width:'100%', marginBottom:12 }}
        >
          폼 값 반영
        </button>

        <ConditionPalette selectedEdge={selectedEdge} setEdges={setEdges} setEdgeForm={setEdgeForm} />
      </div>
    )
  }

  return <div style={{ padding:12, color:'#64748b' }}>노드/브릿지를 선택하세요</div>
}
