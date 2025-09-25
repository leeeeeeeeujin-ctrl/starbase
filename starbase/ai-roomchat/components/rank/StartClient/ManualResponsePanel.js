export default function ManualResponsePanel({
  manualResponse,
  onChange,
  onManualAdvance,
  onAiAdvance,
  isAdvancing,
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
      <div style={{ fontWeight: 700 }}>수동 응답</div>
      <textarea
        value={manualResponse}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        placeholder="AI 대신 사용할 응답을 입력하세요. 마지막 줄에는 승패를 적어야 합니다."
        style={{
          width: '100%',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          fontFamily: 'monospace',
          fontSize: 13,
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onManualAdvance}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#0ea5e9',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          수동 응답으로 진행
        </button>
        <button
          type="button"
          onClick={onAiAdvance}
          disabled={isAdvancing}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: isAdvancing ? '#cbd5f5' : '#2563eb',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          {isAdvancing ? '진행 중…' : 'AI 호출'}
        </button>
      </div>
    </section>
  )
}

//
