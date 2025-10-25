export default function HeaderControls({
  onBack,
  title,
  description,
  preflight,
  onStart,
  onAdvance,
  isAdvancing,
  advanceDisabled = false,
  advanceLabel,
  consensus,
  startDisabled = false,
  isStarting = false,
  showAdvance = true,
}) {
  const nextLabel = advanceLabel || (isAdvancing ? '진행 중…' : '다음 턴');
  const startLabel = isStarting ? '준비 중…' : preflight ? '게임 시작' : '다시 시작';
  const startButtonDisabled = isStarting || startDisabled;
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        borderRadius: 20,
        padding: '16px 20px',
        background: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        color: '#e2e8f0',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          padding: '10px 16px',
          borderRadius: 999,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'rgba(15, 23, 42, 0.45)',
          color: '#e2e8f0',
          cursor: 'pointer',
        }}
      >
        ← 로비로
      </button>
      <div style={{ flex: '1 1 240px' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{title || '랭킹 게임'}</h2>
        <div style={{ fontSize: 13, color: 'rgba(226, 232, 240, 0.7)' }}>
          {description || '등록된 설명이 없습니다.'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onStart}
          disabled={startButtonDisabled}
          style={{
            padding: '10px 16px',
            borderRadius: 999,
            background: startButtonDisabled ? 'rgba(17, 24, 39, 0.55)' : '#111827',
            color: startButtonDisabled ? 'rgba(248, 250, 252, 0.6)' : '#f8fafc',
            fontWeight: 700,
            border: 'none',
            cursor: startButtonDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {startLabel}
        </button>
        {showAdvance ? (
          <button
            type="button"
            onClick={onAdvance}
            disabled={isAdvancing || advanceDisabled}
            style={{
              padding: '10px 16px',
              borderRadius: 999,
              background: isAdvancing || advanceDisabled ? 'rgba(37, 99, 235, 0.35)' : '#2563eb',
              color: '#f8fafc',
              fontWeight: 700,
              border: 'none',
              cursor: isAdvancing || advanceDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {nextLabel}
          </button>
        ) : null}
        {consensus?.active ? (
          <span
            style={{
              alignSelf: 'center',
              fontSize: 12,
              color: consensus.viewerEligible
                ? consensus.viewerHasConsented
                  ? 'rgba(34, 197, 94, 0.9)'
                  : 'rgba(226, 232, 240, 0.75)'
                : 'rgba(148, 163, 184, 0.75)',
            }}
          >
            {consensus.viewerEligible
              ? consensus.viewerHasConsented
                ? '내 동의 완료'
                : '내 동의 필요'
              : '동의 대상 아님'}
          </span>
        ) : null}
      </div>
    </header>
  );
}

//
