// components/maker/SidePanel.js
import React, { useState, useEffect } from 'react'
import ConditionBuilder from './ConditionBuilder'
import TokenPalette from './TokenPalette'

export default function SidePanel({ selectedNodeId, selectedEdge, setEdges, setNodes }) {
  const [edgeForm, setEdgeForm] = useState({
    conditions: '[]',
    trigger_words: '',
    priority: 0,
    probability: 1,
    fallback: false,
    action: 'continue',
  })

  useEffect(() => {
    if (selectedEdge) {
      const d = selectedEdge.data || {}
      setEdgeForm({
        conditions: JSON.stringify(d.conditions || []),
        trigger_words: (d.trigger_words || []).join(', '),
        priority: d.priority ?? 0,
        probability: d.probability ?? 1,
        fallback: !!d.fallback,
        action: d.action ?? 'continue',
      })
    }
  }, [selectedEdge])

  function rebuildLabel(data) {
    const triggers = data.trigger_words?.length ? data.trigger_words.join(',') : ''
    const condCount = Array.isArray(data.conditions) ? data.conditions.length : 0
    return `${triggers}${condCount ? ` (${condCount} 조건)` : ''}`
  }

  function onInsertToken(token) {
    if (!selectedNodeId) return
    setNodes(nds =>
      nds.map(n =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, template: (n.data.template || '') + token } }
          : n,
      ),
    )
  }

  function applyEdgeForm() {
    let cond = []
    try {
      cond = JSON.parse(edgeForm.conditions || '[]')
    } catch (_) {
      cond = []
    }

    const trigger_words = edgeForm.trigger_words.split(',').map(s => s.trim()).filter(Boolean)
    const priority = parseInt(edgeForm.priority) || 0
    const probability = Math.max(0, Math.min(1, parseFloat(edgeForm.probability) || 0))
    const fallback = !!edgeForm.fallback
    const action = edgeForm.action

    setEdges(eds =>
      eds.map(e => {
        if (e.id !== selectedEdge.id) return e
        const data = {
          ...(e.data || {}),
          trigger_words,
          conditions: cond,
          priority,
          probability,
          fallback,
          action,
        }
        return { ...e, data, label: rebuildLabel(data) }
      }),
    )
  }

  // ConditionBuilder → 텍스트폼에 즉시 반영
  function pushToForm(json) {
    setEdgeForm(f => {
      let arr = []
      try {
        arr = JSON.parse(f.conditions || '[]')
      } catch {}
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
        <ConditionBuilder
          selectedEdge={selectedEdge}
          setEdges={setEdges}
          pushToForm={pushToForm}
        />

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

        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12 }}>트리거 단어 (쉼표로 구분)</label>
          <input
            value={edgeForm.trigger_words}
            onChange={e => setEdgeForm(f => ({ ...f, trigger_words: e.target.value }))}
            style={{ width: '100%' }}
          />

          <label style={{ fontSize: 12 }}>우선순위</label>
          <input
            type="number"
            value={edgeForm.priority}
            onChange={e => setEdgeForm(f => ({ ...f, priority: e.target.value }))}
            style={{ width: '100%' }}
          />

          <label style={{ fontSize: 12 }}>발동 확률 (0~1)</label>
          <input
            type="number"
            step="0.01"
            value={edgeForm.probability}
            onChange={e => setEdgeForm(f => ({ ...f, probability: e.target.value }))}
            style={{ width: '100%' }}
          />

          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={edgeForm.fallback}
              onChange={e => setEdgeForm(f => ({ ...f, fallback: e.target.checked }))}
            />{' '}
            fallback 브릿지
          </label>

          <label style={{ fontSize: 12 }}>동작</label>
          <select
            value={edgeForm.action}
            onChange={e => setEdgeForm(f => ({ ...f, action: e.target.value }))}
          >
            <option value="continue">계속</option>
            <option value="end">종료</option>
          </select>

          <button
            onClick={applyEdgeForm}
            style={{
              marginTop: 8,
              padding: '8px 12px',
              background: '#2563eb',
              color: '#fff',
              borderRadius: 8,
            }}
          >
            변경 적용
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 12, color: '#94a3b8' }}>
      노드나 엣지를 선택하면 상세 패널이 표시됩니다.
    </div>
  )
}
