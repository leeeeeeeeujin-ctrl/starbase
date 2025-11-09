export default function ManualResponsePanel({
  manualResponse,
  onChange,
  onManualAdvance,
  onAiAdvance,
  isAdvancing,
  disabled = false,
  disabledReason = '',
  timeRemaining = null,
  turnTimerSeconds,
}) {
  const locked = disabled;
  const remainingText =
    typeof timeRemaining === 'number'
      ? `${timeRemaining.toString().padStart(2, '0')}초 남음`
      : '대기 중';

  return (
    <section
      style={{
        borderRadius: 18,
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(15, 23, 42, 0.65)',
        padding: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>수동 응답</div>
        <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.75)' }}>
          턴 제한 {turnTimerSeconds || 0}초 · {remainingText}
        </div>
      </div>
      <textarea
        value={manualResponse}
        onChange={event => onChange(event.target.value)}
        rows={5}
        disabled={locked}
        placeholder={
          locked
            ? disabledReason || '현재 차례의 플레이어만 응답을 제출할 수 있습니다.'
            : 'AI 대신 사용할 응답을 입력하세요. 마지막 줄에는 승패를 적어야 합니다.'
        }
        style={{
          width: '100%',
          borderRadius: 12,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: locked ? 'rgba(15, 23, 42, 0.35)' : 'rgba(15, 23, 42, 0.45)',
          color: '#e2e8f0',
          fontFamily: 'monospace',
          fontSize: 13,
          padding: 10,
          minHeight: 140,
          resize: 'vertical',
        }}
      />
      {locked && disabledReason ? (
        <div style={{ fontSize: 12, color: '#f97316' }}>{disabledReason}</div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onManualAdvance}
          disabled={locked || isAdvancing}
          style={{
            padding: '10px 16px',
            borderRadius: 999,
            background: locked ? 'rgba(148, 163, 184, 0.25)' : '#0ea5e9',
            color: '#f8fafc',
            fontWeight: 700,
            cursor: locked ? 'not-allowed' : 'pointer',
            border: 'none',
          }}
        >
          수동 응답으로 진행
        </button>
        <button
          type="button"
          onClick={onAiAdvance}
          disabled={isAdvancing || locked}
          style={{
            padding: '10px 16px',
            borderRadius: 999,
            background: isAdvancing || locked ? 'rgba(37, 99, 235, 0.35)' : '#2563eb',
            color: '#f8fafc',
            fontWeight: 700,
            border: 'none',
            cursor: isAdvancing || locked ? 'not-allowed' : 'pointer',
          }}
        >
          {isAdvancing ? '진행 중…' : 'AI 호출'}
        </button>
      </div>
    </section>
  );
}

//
