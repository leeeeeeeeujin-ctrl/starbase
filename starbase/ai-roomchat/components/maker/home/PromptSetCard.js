'use client'

function formatTimestamp(value) {
  if (!value) return '기록 없음'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '기록 없음'
  return parsed.toLocaleString()
}

export default function PromptSetCard({
  row,
  isEditing,
  editingName,
  onEditingNameChange,
  onBeginRename,
  onSubmitRename,
  onCancelRename,
  onOpenSet,
  onExportSet,
  onDeleteSet,
  savingRename,
}) {
  const timestamp = formatTimestamp(row.updated_at ?? row.created_at)

  if (isEditing) {
    return (
      <form
        onSubmit={onSubmitRename}
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          padding: '18px 18px 16px',
          background: '#f8fafc',
          display: 'grid',
          gap: 12,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>세트 이름</span>
          <input
            value={editingName}
            onChange={(event) => onEditingNameChange(event.target.value)}
            placeholder="세트 이름"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid #cbd5f5',
              fontSize: 15,
            }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={savingRename}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              opacity: savingRename ? 0.65 : 1,
            }}
          >
            저장
          </button>
          <button
            type="button"
            onClick={onCancelRename}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid #cbd5f5',
              background: '#fff',
              fontWeight: 600,
            }}
          >
            취소
          </button>
        </div>
      </form>
    )
  }

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 18,
        padding: '18px 18px 16px',
        display: 'grid',
        gap: 12,
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 18, color: '#0f172a' }}>{row.name || '이름 없는 세트'}</strong>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>최근 수정: {timestamp}</span>
        </div>
        <button
          type="button"
          onClick={() => onOpenSet(row.id)}
          style={{
            padding: '10px 14px',
            borderRadius: 999,
            border: 'none',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#fff',
            fontWeight: 700,
            boxShadow: '0 18px 48px -28px rgba(37, 99, 235, 0.55)',
          }}
        >
          편집하기 →
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button
          type="button"
          onClick={() => onBeginRename(row)}
          style={{
            flex: '1 1 120px',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #cbd5f5',
            background: '#f8fafc',
            fontWeight: 600,
            color: '#1e293b',
          }}
        >
          이름 바꾸기
        </button>
        <button
          type="button"
          onClick={() => onExportSet(row.id)}
          style={{
            flex: '1 1 120px',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #cbd5f5',
            background: '#fff',
            fontWeight: 600,
            color: '#1e293b',
          }}
        >
          JSON 내보내기
        </button>
        <button
          type="button"
          onClick={() => onDeleteSet(row.id)}
          style={{
            flex: '1 1 120px',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            fontWeight: 600,
            color: '#b91c1c',
          }}
        >
          삭제하기
        </button>
      </div>
    </div>
  )
}
