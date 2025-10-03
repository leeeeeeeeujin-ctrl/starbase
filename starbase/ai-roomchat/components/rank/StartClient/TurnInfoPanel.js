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
  apiKeyNotice,
  currentActor,
  timeRemaining,
  turnTimerSeconds,
}) {
  const actorName = currentActor?.name || '미지정'
  const actorRole = currentActor?.role || '역할 미지정'
  const actorLabel = `${actorName} · ${actorRole}`
  const remainingText =
    typeof timeRemaining === 'number'
      ? `${timeRemaining.toString().padStart(2, '0')}초`
      : '대기 중'

  return (
    <section
      style={{
        borderRadius: 18,
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(15, 23, 42, 0.65)',
        padding: 16,
        display: 'grid',
        gap: 12,
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>진행 정보</div>
        <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>
          턴 {turn} · 제한 {turnTimerSeconds || 0}초 · 남은 시간 {remainingText}
        </div>
      </div>
      <div style={{ fontSize: 13, display: 'grid', gap: 6, color: 'rgba(226, 232, 240, 0.85)' }}>
        <span>
          현재 노드:{' '}
          {currentNode
            ? `#${currentNode.slot_no ?? '?'} (${currentNode.id})`
            : '없음'}
        </span>
        <span>현재 주역: {actorLabel}</span>
        <span>
          활성 전역 변수:{' '}
          {activeGlobal.length ? activeGlobal.join(', ') : '없음'}
        </span>
        <span>
          최근 로컬 변수:{' '}
          {activeLocal.length ? activeLocal.join(', ') : '없음'}
        </span>
      </div>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>AI API 키</span>
        <input
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder="API 키를 입력하세요"
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(148, 163, 184, 0.4)',
            background: 'rgba(15, 23, 42, 0.45)',
            color: '#f8fafc',
          }}
        />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>API 버전</span>
        <select
          value={apiVersion}
          onChange={(event) => onApiVersionChange(event.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(148, 163, 184, 0.4)',
            background: 'rgba(15, 23, 42, 0.45)',
            color: '#f8fafc',
            fontWeight: 600,
          }}
        >
          <option value="gemini">Google Gemini</option>
          <option value="chat_completions">Chat Completions v1</option>
          <option value="responses">Responses API v2</option>
        </select>
      </label>
      {realtimeLockNotice && (
        <p style={{ margin: 0, fontSize: 12, color: '#f97316' }}>{realtimeLockNotice}</p>
      )}
      {apiKeyNotice && (
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>{apiKeyNotice}</p>
      )}
    </section>
  )
}

//
