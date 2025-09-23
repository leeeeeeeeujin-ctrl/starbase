// components/maker/SidePanel.js
// 선택된 노드/엣지에 따라 편집 패널 표시
// - 노드: 토큰 팔레트, 변수(JSON) 간편편집(전역/로컬, 수동/적극), 가시성 옵션 등
// - 엣지: 조건 빌더, 트리거 단어, 우선순위/확률/fallback/액션

import React, { useEffect, useState } from 'react'
import ConditionBuilder from './ConditionBuilder'
import TokenPalette from './TokenPalette'

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

  function saveEdge() {
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

  if (selectedNodeId) {
    // 노드 패널
    return (
      <div style={{ padding:12, display:'grid', gap:12 }}>
        <div style={{ fontWeight:700 }}>프롬프트 편집</div>
        <div style={{ color:'#64748b', fontSize:12 }}>
          카드에서 바로 텍스트를 수정하고, 아래에서 변수·토큰을 다듬어 보세요.
        </div>

        <div style={{ borderTop:'1px solid #eee', paddingTop:10, fontSize:12, color:'#6b7280' }}>
          세부 전역/로컬 변수 규칙은 화면 우측의 <b>변수</b> 버튼을 눌러 전용 패널에서 편집하세요.
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
      </div>
    )
  }

  return null
}
