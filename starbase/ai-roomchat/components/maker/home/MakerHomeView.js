'use client'

function formatTimestamp(value) {
  if (!value) return '기록 없음'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '기록 없음'
  return parsed.toLocaleString()
}

function PromptSetCard({
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

export default function MakerHomeView({
  listHeader,
  errorMessage,
  loading,
  rows,
  editingId,
  editingName,
  savingRename,
  actionSheetOpen,
  onEditingNameChange,
  onBeginRename,
  onSubmitRename,
  onCancelRename,
  onDeleteSet,
  onOpenSet,
  onExportSet,
  onImportFile,
  onCreateSet,
  onRefresh,
  onToggleActionSheet,
  onGoBack,
  onOpenRanking,
  SharedChatDock,
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1f2937 28%, #f8fafc 100%)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: '1 1 auto',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '24px 16px 140px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <header
            style={{
              background: '#111827',
              color: '#f8fafc',
              borderRadius: 20,
              padding: '18px 20px',
              boxShadow: '0 30px 60px -38px rgba(15, 23, 42, 0.75)',
              display: 'grid',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={onGoBack}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  background: 'rgba(15, 23, 42, 0.55)',
                  border: '1px solid rgba(148, 163, 184, 0.4)',
                  color: '#f8fafc',
                  fontWeight: 600,
                }}
              >
                ← 로비로
              </button>
              <div style={{ display: 'grid', gap: 4 }}>
                <h1 style={{ margin: 0, fontSize: 24 }}>프롬프트 메이커</h1>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#cbd5f5' }}>
                  터치 기반 워크플로우에 맞게 세트 목록을 중앙에 배치했어요. 빠른 작업은 우측 하단 버튼을 눌러 열 수
                  있습니다.
                </p>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{listHeader}</span>
              {errorMessage && <span style={{ fontSize: 12, color: '#fca5a5' }}>{errorMessage}</span>}
            </div>
          </header>

          <section
            style={{
              background: '#ffffff',
              borderRadius: 24,
              boxShadow: '0 28px 62px -48px rgba(15, 23, 42, 0.55)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              minHeight: 420,
            }}
          >
            <div
              style={{
                flex: '1 1 auto',
                maxHeight: '60vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {loading && (
                <div
                  style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#64748b',
                    fontWeight: 600,
                  }}
                >
                  불러오는 중…
                </div>
              )}

              {!loading && rows.length === 0 && !errorMessage && (
                <div
                  style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontWeight: 600,
                    lineHeight: 1.6,
                  }}
                >
                  아직 세트가 없습니다. 빠른 작업 버튼을 눌러 첫 세트를 만들어 보세요.
                </div>
              )}

              {!loading &&
                rows.map((row) => (
                  <PromptSetCard
                    key={row.id}
                    row={row}
                    isEditing={editingId === row.id}
                    editingName={editingName}
                    onEditingNameChange={onEditingNameChange}
                    onBeginRename={onBeginRename}
                    onSubmitRename={onSubmitRename}
                    onCancelRename={onCancelRename}
                    onOpenSet={onOpenSet}
                    onExportSet={onExportSet}
                    onDeleteSet={onDeleteSet}
                    savingRename={savingRename}
                  />
                ))}
            </div>

            <div
              style={{
                borderTop: '1px solid #e2e8f0',
                paddingTop: 14,
                display: 'grid',
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={onRefresh}
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px solid #cbd5f5',
                  background: '#f8fafc',
                  fontWeight: 600,
                }}
              >
                목록 새로고침
              </button>
              <button
                type="button"
                onClick={onOpenRanking}
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px solid #0f172a',
                  background: '#0f172a',
                  color: '#fff',
                  fontWeight: 600,
                }}
              >
                랭킹 허브로 이동
              </button>
            </div>
          </section>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onToggleActionSheet(true)}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          width: 64,
          height: 64,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
          color: '#fff',
          fontSize: 28,
          fontWeight: 700,
          boxShadow: '0 24px 60px -28px rgba(37, 99, 235, 0.65)',
          zIndex: 60,
        }}
        aria-label="빠른 작업 열기"
      >
        ＋
      </button>

      <div style={{ position: 'fixed', left: 16, bottom: 24, width: 360, maxWidth: 'calc(100% - 32px)' }}>
        <SharedChatDock height={260} />
      </div>

      {actionSheetOpen && (
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onToggleActionSheet(false)
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
                onClick={() => onToggleActionSheet(false)}
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
                onToggleActionSheet(false)
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
                onToggleActionSheet(false)
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
      )}
    </div>
  )
}

//
