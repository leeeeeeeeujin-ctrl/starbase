'use client'

import SidePanel from '../SidePanel'

export default function MakerEditorPanel({
  tabs,
  activeTab,
  onTabChange,
  onOpenVariables,
  selectedNode,
  selectedNodeId,
  selectedEdge,
  onMarkAsStart,
  onToggleInvisible,
  onDeleteSelected,
  onInsertToken,
  rebuildEdgeLabel,
  setNodes,
  setEdges,
}) {
  return (
    <section
      style={{
        background: '#ffffff',
        borderRadius: 18,
        padding: '12px 16px',
        boxShadow: '0 16px 36px -32px rgba(15, 23, 42, 0.45)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tabs.map((tab) => {
            const active = tab.id === activeTab
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: active ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  background: active ? '#e0f2fe' : '#f8fafc',
                  color: active ? '#1d4ed8' : '#475569',
                  fontWeight: 600,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onOpenVariables}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: '#0ea5e9',
            color: '#fff',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          변수 설정
        </button>
      </div>

      <div
        style={{
          border: '1px solid #eef2f6',
          borderRadius: 14,
          padding: '12px 14px',
          minHeight: 140,
          maxHeight: '40vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          background: '#fdfdff',
        }}
      >
        {activeTab === 'selection' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>
              {selectedNode
                ? '선택한 프롬프트를 편집 중입니다.'
                : selectedEdge
                ? '선택한 브릿지를 편집 중입니다.'
                : '편집할 프롬프트 또는 브릿지를 선택하세요.'}
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => selectedNodeId && onMarkAsStart(selectedNodeId)}
                disabled={!selectedNodeId}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  background: selectedNode?.data?.isStart ? '#dbeafe' : '#e2e8f0',
                  color: '#0f172a',
                  fontWeight: 600,
                  opacity: selectedNodeId ? 1 : 0.6,
                }}
              >
                시작 지정
              </button>
              <button
                onClick={onToggleInvisible}
                disabled={!selectedNodeId}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  background: '#f8fafc',
                  border: '1px solid #cbd5f5',
                  color: '#0f172a',
                  fontWeight: 600,
                  opacity: selectedNodeId ? 1 : 0.6,
                }}
              >
                {selectedNode?.data?.invisible ? '숨김 해제' : '숨김 모드'}
              </button>
              <button
                onClick={onDeleteSelected}
                disabled={!selectedNodeId}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  background: '#fee2e2',
                  color: '#b91c1c',
                  fontWeight: 600,
                  opacity: selectedNodeId ? 1 : 0.6,
                }}
              >
                삭제
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
              AI 응답 가이드: 마지막 줄에는 승·패·탈락 결과를, 마지막에서 두 번째 줄에는 조건을 만족한 변수명만 기재하고 필요할 때만 위 줄을 채워 주세요.
            </p>
          </div>
        )}

        {activeTab === 'tools' && (
          <div style={{ minHeight: 160 }}>
            <SidePanel
              selectedNodeId={selectedNodeId}
              selectedEdge={selectedEdge}
              setEdges={setEdges}
              setNodes={setNodes}
              onInsertToken={onInsertToken}
              rebuildEdgeLabel={rebuildEdgeLabel}
            />
          </div>
        )}

        {activeTab === 'guide' && (
          <div style={{ display: 'grid', gap: 8, color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>• 노드를 선택해 템플릿과 변수 규칙을 다듬고, 필요하면 Invisible 토글로 노출 범위를 조정하세요.</p>
            <p style={{ margin: 0 }}>• 브릿지를 선택하면 조건 빌더에서 턴/변수 조건과 확률을 설정할 수 있습니다.</p>
            <p style={{ margin: 0 }}>• 오른쪽 하단의 변수 버튼을 눌러 전역·로컬 변수 규칙을 언제든지 확인할 수 있습니다.</p>
          </div>
        )}
      </div>
    </section>
  )
}

//
