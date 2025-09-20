// components/maker/SidePanel.js
import { useEffect, useMemo, useState } from 'react'

/* -------------------- 공용 버튼 -------------------- */
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

/* -------------------- 프롬프트 토큰 팔레트 -------------------- */
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

      {/* 보기 쉬운 라벨을 클릭하면 실제 토큰 문자열이 삽입됨 */}
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

/* -------------------- 트리거 단어 팔레트(엣지용) -------------------- */
function TriggerPalette({ selectedEdge, setEdges }) {
  // 자주 쓰는 키워드 예시(원하면 확장/교체 가능)
  const COMMON = ['승리', '패배', '도망', '무승부', '피해', '치유', '크리티컬', '스턴', '버프', '디버프']

  function addWord(w) {
    if (!selectedEdge) return
    setEdges(eds => eds.map(e => {
      if (e.id !== selectedEdge.id) return e
      const prev = e.data?.trigger_words || []
      if (prev.includes(w)) return e
      const trigger_words = [...prev, w]
      return {
        ...e,
        label: [
          trigger_words.join(', '),
          (e.data?.conditions?.length ? 'cond' : null),
          (e.data?.probability !== 1 ? `p=${e.data?.probability}` : null),
          (e.data?.fallback ? 'fallback' : null),
          (e.data?.action && e.data?.action !== 'continue' ? e.data?.action : null)
        ].filter(Boolean).join(' | '),
        data: { ...(e.data || {}), trigger_words }
      }
    }))
  }

  return (
    <div style={{ display:'grid', gap:8, borderTop:'1px solid #e5e7eb', marginTop:12, paddingTop:12 }}>
      <div style={{ fontWeight:700 }}>트리거 단어 팔레트</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {COMMON.map(w => <Chip key={w} onClick={()=>addWord(w)}>{w}</Chip>)}
      </div>
    </div>
  )
}

/* -------------------- 조건 변수 팔레트(엣지용) -------------------- */
function ConditionPalette({ selectedEdge, setEdges }) {
  // 자주 쓰는 조건 템플릿 (라벨 클릭 → conditions JSON에 push)
  const PRESETS = [
    { label: '확률 30%', json: { type:'random', p:0.3 } },
    { label: '확률 50%', json: { type:'random', p:0.5 } },
    { label: '우선순위 높음', json: { type:'priority', value: -10 } },
    { label: '이전 브릿지 미발동', json: { type:'notTriggered', target:'<bridgeId>' } },
    { label: '턴≥3', json: { type:'turn', gte:3 } },
    { label: 'Fallback', json: { type:'fallback' } }
  ]

  function addCond(obj) {
    if (!selectedEdge) return
    setEdges(eds => eds.map(e => {
      if (e.id !== selectedEdge.id) return e
      const prev = e.data?.conditions || []
      const conditions = [...prev, obj]
      return {
        ...e,
        label: [
          (e.data?.trigger_words || []).join(', '),
          (conditions.length ? 'cond' : null),
          (e.data?.probability !== 1 ? `p=${e.data?.probability}` : null),
          (e.data?.fallback ? 'fallback' : null),
          (e.data?.action && e.data?.action !== 'continue' ? e.data?.action : null)
        ].filter(Boolean).join(' | '),
        data: { ...(e.data || {}), conditions }
      }
    }))
  }

  return (
    <div style={{ display:'grid', gap:8, borderTop:'1px solid #e5e7eb', marginTop:12, paddingTop:12 }}>
      <div style={{ fontWeight:700 }}>조건 변수 팔레트</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {PRESETS.map(p => (
          <Chip key={p.label} onClick={()=>addCond(p.json)} title={JSON.stringify(p.json)}>
            {p.label}
          </Chip>
        ))}
      </div>
      <div style={{ color:'#6b7280', fontSize:12 }}>
        * &quot;이전 브릿지 미발동&quot;의 &lt;bridgeId&gt;는 저장 후 생성된 브릿지 ID로 교체하세요.
      </div>
    </div>
  )
}

/* -------------------- 사이드패널 본체 -------------------- */
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
      ? {
          ...e,
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

  // --- 노드 선택 시: 토큰 팔레트만 보여주기 ---
  if (selectedNodeId) {
    return (
      <div style={{ padding:12 }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>노드 {selectedNodeId}</div>
        <div style={{ color:'#64748b' }}>프롬프트 텍스트는 카드 안에서 직접 수정합니다. 아래에서 “이름/설명/능력/랜덤” 토큰을 클릭해 추가할 수 있어요.</div>
        <TokenPalette onInsert={onInsertToken} />
      </div>
    )
  }

  // --- 엣지 선택 시: 폼 + 팔레트 2종(트리거/조건) ---
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

        <label style={{ fontSize: 12 }}>
  조건(JSON 배열) 예:&nbsp;
  <code>[{'{'}"type":"contains","value":"승리"{'}'}]</code>
</label>
        <textarea
          value={edgeForm.conditions}
          onChange={e=>setEdgeForm(f=>({ ...f, conditions: e.target.value }))}
          rows={4}
          style={{ width:'100%', marginBottom:8, fontFamily:'monospace' }}
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
          type="button"
          onClick={applyEdgeForm}
          style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700, width:'100%', marginBottom:12 }}
        >
          폼 값 반영
        </button>

        {/* 클릭-추가 팔레트들 */}
        <TriggerPalette selectedEdge={selectedEdge} setEdges={setEdges} />
        <ConditionPalette selectedEdge={selectedEdge} setEdges={setEdges} />
      </div>
    )
  }

  return <div style={{ padding:12, color:'#64748b' }}>노드/브릿지를 선택하세요</div>
}
