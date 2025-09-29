export default function TurnInfoPanel({
  turn,
  currentNode,
  activeGlobal,
  activeLocal,
  apiKey,
  onApiKeyChange,
  apiVersion,
  onApiVersionChange,
  realtimeLockNotice,
}) {
  return (
    <section
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        background: '#fff',
        padding: 12,
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 700 }}>진행 정보</div>
      <div style={{ fontSize: 13, color: '#475569', display: 'grid', gap: 4 }}>
        <span>턴: {turn}</span>
        <span>
          현재 노드:{' '}
          {currentNode
            ? `#${currentNode.slot_no ?? '?'} (${currentNode.id})`
            : '없음'}
        </span>
        <span>
          활성 전역 변수:{' '}
          {activeGlobal.length ? activeGlobal.join(', ') : '없음'}
        </span>
        <span>
          최근 로컬 변수:{' '}
          {activeLocal.length ? activeLocal.join(', ') : '없음'}
        </span>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#475569' }}>AI API 키</span>
        <input
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder="API 키를 입력하세요"
          style={{
            flex: 1,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #cbd5f5',
          }}
        />
      </label>
      <label
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 13, color: '#475569' }}>API 버전</span>
        <select
          value={apiVersion}
          onChange={(event) => onApiVersionChange(event.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #cbd5f5',
            background: '#fff',
            fontWeight: 600,
          }}
        >
          <option value="gemini">Google Gemini</option>
          <option value="chat_completions">Chat Completions v1</option>
          <option value="responses">Responses API v2</option>
        </select>
      </label>
      {realtimeLockNotice && (
        <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{realtimeLockNotice}</p>
      )}
    </section>
  )
}

//
