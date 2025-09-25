'use client'

export default function QuickActionsSheet({
  open,
  onClose,
  onCreateSet,
  onImportFile,
  onRefresh,
  onOpenRanking,
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

        <button
          type="button"
          onClick={() => {
            onClose()
            onRefresh()
          }}
          style={{
            padding: '12px 14px',
            borderRadius: 16,
            background: '#e2e8f0',
            color: '#0f172a',
            fontWeight: 600,
            border: 'none',
          }}
        >
          목록 새로고침
        </button>

        <button
          type="button"
          onClick={() => {
            onClose()
            onOpenRanking()
          }}
          style={{
            padding: '12px 14px',
            borderRadius: 16,
            background: '#0f172a',
            color: '#fff',
            fontWeight: 600,
            border: 'none',
          }}
        >
          랭킹 허브로 이동
        </button>
      </div>
    </div>
  )
}
