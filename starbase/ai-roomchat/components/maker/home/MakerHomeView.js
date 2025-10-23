'use client';

import MakerHomeHeader from './MakerHomeHeader';
import PromptSetCard from './PromptSetCard';
import QuickActionsSheet from './QuickActionsSheet';

export default function MakerHomeView({
  backgroundImage,
  listHeader,
  errorMessage,
  noticeMessage,
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
}) {
  const pageBackground = backgroundImage
    ? {
        minHeight: '100vh',
        backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.86) 0%, rgba(15,23,42,0.92) 38%, rgba(15,23,42,0.96) 100%), url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        display: 'flex',
        flexDirection: 'column',
      }
    : {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1f2937 28%, #0f172a 100%)',
        display: 'flex',
        flexDirection: 'column',
      };

  return (
    <div style={pageBackground}>
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
          <MakerHomeHeader
            listHeader={listHeader}
            errorMessage={errorMessage}
            noticeMessage={noticeMessage}
            onGoBack={onGoBack}
          />

          <section
            style={{
              background: 'rgba(15,23,42,0.78)',
              borderRadius: 24,
              boxShadow: '0 28px 62px -48px rgba(15, 23, 42, 0.7)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              minHeight: 420,
              color: '#e2e8f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                borderBottom: '1px solid rgba(148,163,184,0.25)',
                paddingBottom: 12,
              }}
            >
              <div style={{ display: 'grid', gap: 6 }}>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>내 프롬프트 세트</p>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#cbd5f5' }}>
                  캐릭터 화면과 동일한 배경 위에서 세트를 정리할 수 있도록 레이아웃을 간결하게
                  정리했습니다. 아래 목록에서 편집할 세트를 골라보세요.
                </p>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                style={{
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.45)',
                  background: 'rgba(15,23,42,0.55)',
                  color: '#e2e8f0',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                목록 새로고침
              </button>
            </div>
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
                    color: '#cbd5f5',
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
                    color: '#cbd5f5',
                    fontWeight: 600,
                    lineHeight: 1.6,
                  }}
                >
                  아직 세트가 없습니다. 빠른 작업 버튼을 눌러 첫 세트를 만들어 보세요.
                </div>
              )}

              {!loading &&
                rows.map(row => (
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

      <QuickActionsSheet
        open={actionSheetOpen}
        promptSets={rows}
        onClose={() => onToggleActionSheet(false)}
        onCreateSet={onCreateSet}
        onImportFile={onImportFile}
        onExportSet={onExportSet}
      />
    </div>
  );
}
