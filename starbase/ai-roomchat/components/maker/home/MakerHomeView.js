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
      <main
        style={{
          flex: '1 1 auto',
          width: '100%',
          padding: '32px 16px 140px',
          boxSizing: 'border-box',
          maxWidth: 1120,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <MakerHomeHeader listHeader={listHeader} errorMessage={errorMessage} onGoBack={onGoBack} />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 24,
            alignItems: 'stretch',
          }}
        >
          <section
            style={{
              flex: '1 1 520px',
              minWidth: 0,
              background: '#ffffff',
              borderRadius: 24,
              boxShadow: '0 28px 62px -48px rgba(15, 23, 42, 0.55)',
              padding: 20,
              display: 'grid',
              gap: 16,
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 18, color: '#0f172a' }}>프롬프트 세트</strong>
                <span style={{ fontSize: 13, color: '#64748b' }}>{listHeader}</span>
              </div>
              {errorMessage && (
                <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>{errorMessage}</span>
              )}
            </header>

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
          </section>

          <aside
            style={{
              flex: '1 1 260px',
              maxWidth: 340,
              minWidth: 240,
              display: 'grid',
              gap: 16,
            }}
          >
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.92)',
                color: '#f8fafc',
                borderRadius: 24,
                padding: 20,
                boxShadow: '0 24px 56px -40px rgba(15, 23, 42, 0.9)',
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ display: 'grid', gap: 6 }}>
                <strong style={{ fontSize: 17 }}>작업 요약</strong>
                <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5', lineHeight: 1.5 }}>
                  빠른 작업으로 새 세트를 만들거나 JSON을 가져와서 협업 흐름을 이어갈 수 있어요.
                </p>
              </div>
              <dl style={{ margin: 0, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <dt style={{ fontSize: 13, color: 'rgba(248, 250, 252, 0.75)' }}>현재 세트 수</dt>
                  <dd style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{rows.length}</dd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <dt style={{ fontSize: 13, color: 'rgba(248, 250, 252, 0.75)' }}>상태</dt>
                  <dd style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                    {loading ? '동기화 중' : errorMessage ? '확인이 필요해요' : '정상'}
                  </dd>
                </div>
              </dl>
            </div>

            <div
              style={{
                background: '#ffffff',
                borderRadius: 24,
                padding: 20,
                boxShadow: '0 24px 56px -48px rgba(15, 23, 42, 0.45)',
                display: 'grid',
                gap: 12,
              }}
            >
              <strong style={{ fontSize: 15, color: '#0f172a' }}>빠른 실행</strong>
              <button
                type="button"
                onClick={onRefresh}
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px solid #cbd5f5',
                  background: '#f8fafc',
                  fontWeight: 600,
                  color: '#0f172a',
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
          </aside>
        </div>
      </main>

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
