'use client'

export default function QuickActionsSheet({
  open,
  promptSets = [],
  onClose,
  onCreateSet,
  onImportFile,
  onExportSet,
}) {
  if (!open) {
    return null
  }

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        zIndex: 80,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        padding: '0 16px 32px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#ffffff',
          borderRadius: 28,
          boxShadow: '0 32px 80px -40px rgba(15, 23, 42, 0.65)',
          padding: '20px 20px 28px',
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 16, color: '#0f172a' }}>빠른 작업</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#64748b',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            닫기
          </button>
        </div>

        <button
          type="button"
          onClick={onCreateSet}
          style={{
            padding: '12px 14px',
            borderRadius: 16,
            background: '#2563eb',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
          }}
        >
          새 세트 만들기
        </button>

        <label
          style={{
            padding: '12px 14px',
            borderRadius: 16,
            border: '1px dashed #94a3b8',
            background: '#f8fafc',
            color: '#0f172a',
            fontWeight: 600,
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          JSON 가져오기
          <input
            type="file"
            accept="application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              try {
                await onImportFile(file)
              } finally {
                event.target.value = ''
              }
            }}
            style={{ display: 'none' }}
          />
        </label>

        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 16,
            background: '#f8fafc',
            border: '1px solid rgba(148,163,184,0.35)',
          }}
        >
          <strong style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>세트 내보내기</strong>
          {promptSets.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.5,
                color: '#64748b',
              }}
            >
              내보낼 세트가 아직 없습니다. 먼저 세트를 만든 뒤 다시 시도하세요.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 8,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {promptSets.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    onExportSet?.(row.id)
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(148,163,184,0.5)',
                    background: '#fff',
                    color: '#0f172a',
                    textAlign: 'left',
                    fontWeight: 600,
                  }}
                >
                  {row.name || '이름 없는 세트'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
