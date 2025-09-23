// components/maker/SidePanel.js
// 선택된 노드/엣지에 따라 편집 패널 표시
// - 노드: 토큰 팔레트, 변수(JSON) 간편편집(전역/로컬, 수동/적극), 가시성 옵션 등
// - 엣지: 조건 빌더, 트리거 단어, 우선순위/확률/fallback/액션

import React, { useEffect, useState } from 'react'
import ConditionBuilder from './compononts/maker/ConditionBuilder'
import TokenPalette from './compononts/maker/TokenPalette'

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

  function rebuildLabel(data) {
    const parts = []
    if (data.trigger_words?.length) {
      parts.push(`단어: ${data.trigger_words.join(',')}`)
    }
    if (data.conditions?.length) {
      parts.push(`조건 ${data.conditions.length}개`)
    }
    if (data.priority) {
      parts.push(`우선순위 ${data.priority}`)
    }
    if (data.probability != null && data.probability !== 1) {
      parts.push(`확률 ${Math.round(Number(data.probability) * 100)}%`)
    }
    if (data.fallback) {
      parts.push('Fallback')
    }
    return parts.join(' | ')
  }

  function saveEdge() {
    let cond = []
    try { cond = JSON.parse(edgeForm.conditions || '[]') } catch (_) { cond = [] }

    const trigger_words = edgeForm.trigger_words.split(',').map(s => s.trim()).filter(Boolean)
    const priority = parseInt(edgeForm.priority) || 0
    const probability = Math.max(0, Math.min(1, parseFloat(edgeForm.probability) || 0))
    const fallback = !!edgeForm.fallback
    const action = edgeForm.action

    setEdges(eds => eds.map(e => {
      if (e.id !== selectedEdge.id) return e
      const data = { ...(e.data || {}), trigger_words, conditions: cond, priority, probability, fallback, action }
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
      <div style={{ padding: 12, display: 'grid', gap: 12 }}>
        <div style={{ fontWeight: 700 }}>프롬프트 편집</div>
        <div style={{ color: '#64748b' }}>
          프롬프트 텍스트는 카드에서 직접 수정합니다. 아래에서 변수/가시성/토큰을 설정하세요.
        </div>

        <div style={{ borderTop: '1px solid #eee', paddingTop: 10, fontSize: 12, color: '#6b7280' }}>
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
      <div style={{ padding: 12, display: 'grid', gap: 12 }}>
        <h3 style={{ marginTop: 0 }}>브릿지 조건</h3>
        <ConditionBuilder selectedEdge={selectedEdge} setEdges={setEdges} pushToForm={pushToForm} />

        {/* 원하면 직접 JSON 편집 */}
        <div style={{ marginTop: 6, borderTop: '1px solid #eee', paddingTop: 10 }}>
          <label style={{ fontSize: 12 }}>조건(JSON 배열) 고급 편집</label>
          <textarea
            value={edgeForm.conditions}
            onChange={e => setEdgeForm(f => ({ ...f, conditions: e.target.value }))}
            rows={5}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 12 }}>트리거 단어(콤마 구분)</label>
          <input
            type="text"
            value={edgeForm.trigger_words}
            onChange={e => setEdgeForm(f => ({ ...f, trigger_words: e.target.value }))}
          />

          <label style={{ fontSize: 12 }}>우선순위</label>
          <input
            type="number"
            value={edgeForm.priority}
            onChange={e => setEdgeForm(f => ({ ...f, priority: e.target.value }))}
          />

          <label style={{ fontSize: 12 }}>확률(0~1)</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={edgeForm.probability}
            onChange={e => setEdgeForm(f => ({ ...f, probability: e.target.value }))}
          />

          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={edgeForm.fallback}
              onChange={e => setEdgeForm(f => ({ ...f, fallback: e.target.checked }))}
            />
            {' '}Fallback
          </label>

          <label style={{ fontSize: 12 }}>액션</label>
          <select
            value={edgeForm.action}
            onChange={e => setEdgeForm(f => ({ ...f, action: e.target.value }))}
          >
            <option value="continue">continue</option>
            <option value="end">end</option>
            <option value="custom">custom</option>
          </select>
        </div>

        <button
          type="button"
          onClick={saveEdge}
          style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#111827', color: '#fff' }}
        >
          저장
        </button>
      </div>
    )
  }

  return <div style={{ padding: 12 }}>선택된 요소 없음</div>
}
