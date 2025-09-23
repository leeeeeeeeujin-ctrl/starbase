// ...중략 (앞부분 동일)...

export default function SidePanel({ selectedNodeId, selectedEdge, setEdges, setNodes }) {
  // ... 기존 로직들 ...

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
        <div style={{ color:'#64748b' }}>
          프롬프트 텍스트는 카드에서 직접 수정합니다. 아래에서 변수/가시성/토큰을 설정하세요.
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

  return (
    <div style={{ padding:12, color:'#94a3b8' }}>노드나 엣지를 선택하면 상세 패널이 표시됩니다.</div>
  )
}
