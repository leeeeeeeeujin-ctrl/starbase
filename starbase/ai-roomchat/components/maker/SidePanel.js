import { useEffect, useState } from 'react'

export default function SidePanel({ selectedNodeId, selectedEdge, setEdges }) {
  const [edgeForm, setEdgeForm] = useState({
    trigger_words: '',
    probability: 1.0,
    fallback: false,
    action: 'continue'
  })

  useEffect(() => {
    if (!selectedEdge) return
    setEdgeForm({
      trigger_words: (selectedEdge.data?.trigger_words || []).join(','),
      probability: selectedEdge.data?.probability ?? 1.0,
      fallback: selectedEdge.data?.fallback ?? false,
      action: selectedEdge.data?.action || 'continue'
    })
  }, [selectedEdge])

  function applyEdgeForm() {
    if (!selectedEdge) return
    setEdges((eds) =>
      eds.map((e) =>
        e.id === selectedEdge.id
          ? {
              ...e,
              data: {
                ...edgeForm,
                trigger_words: edgeForm.trigger_words
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              }
            }
          : e
      )
    )
  }

  if (selectedNodeId) {
    return (
      <div style={{ padding: 12 }}>
        <h3>노드 {selectedNodeId}</h3>
        <p>노드 속성 편집은 추후 추가 예정</p>
      </div>
    )
  }
  if (selectedEdge) {
    return (
      <div style={{ padding: 12 }}>
        <h3>브릿지 설정</h3>
        <label>트리거 단어</label>
        <input
          value={edgeForm.trigger_words}
          onChange={(e) =>
            setEdgeForm((f) => ({ ...f, trigger_words: e.target.value }))
          }
        />
        <label>확률</label>
        <input
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={edgeForm.probability}
          onChange={(e) =>
            setEdgeForm((f) => ({ ...f, probability: e.target.value }))
          }
        />
        <label>
          <input
            type="checkbox"
            checked={edgeForm.fallback}
            onChange={(e) =>
              setEdgeForm((f) => ({ ...f, fallback: e.target.checked }))
            }
          />
          Fallback
        </label>
        <select
          value={edgeForm.action}
          onChange={(e) =>
            setEdgeForm((f) => ({ ...f, action: e.target.value }))
          }
        >
          <option value="continue">진행</option>
          <option value="win">승리</option>
          <option value="lose">패배</option>
        </select>
        <button onClick={applyEdgeForm}>반영</button>
      </div>
    )
  }
  return <div style={{ padding: 12 }}>노드/브릿지를 선택하세요</div>
}
