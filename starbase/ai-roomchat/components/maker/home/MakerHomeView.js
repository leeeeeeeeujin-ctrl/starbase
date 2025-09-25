'use client'

import MakerHomeHeader from './MakerHomeHeader'
import PromptSetCard from './PromptSetCard'
import QuickActionsSheet from './QuickActionsSheet'

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
          <MakerHomeHeader listHeader={listHeader} errorMessage={errorMessage} onGoBack={onGoBack} />

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

      <QuickActionsSheet
        open={actionSheetOpen}
        onClose={() => onToggleActionSheet(false)}
        onCreateSet={onCreateSet}
        onImportFile={onImportFile}
        onRefresh={onRefresh}
        onOpenRanking={onOpenRanking}
      />
    </div>
  )
}
