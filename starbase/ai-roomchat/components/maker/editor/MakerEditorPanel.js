'use client'

import SidePanel from '../SidePanel'

export default function MakerEditorPanel({
  open,
  onClose,
  selectedNode,
  selectedNodeId,
  selectedEdge,
  onMarkAsStart,
  onToggleInvisible,
  onDeleteSelected,
  onOpenVariables,
  onInsertToken,
  setNodes,
  setEdges,
}) {
  if (!open) return null

  const data = selectedNode?.data || {}

  return (
    <aside
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(420px, 92vw)',
        background: 'rgba(10, 15, 24, 0.96)',
        color: '#e2e8f0',
        zIndex: 90,
        boxShadow: '-32px 0 120px -64px rgba(15, 23, 42, 0.95)',
        borderLeft: '1px solid rgba(148, 163, 184, 0.18)',
        backdropFilter: 'blur(18px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 22px 12px',
        }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 16 }}>
            {selectedNode ? '프롬프트 편집' : selectedEdge ? '브릿지 편집' : '항목 선택'}
          </strong>
          <span style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>
            변경 사항은 닫을 때 자동으로 저장됩니다.
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            background: 'rgba(148, 163, 184, 0.16)',
            color: '#e2e8f0',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            fontWeight: 600,
          }}
        >
          닫기
        </button>
      </div>

      <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '8px 22px 24px', display: 'grid', gap: 18 }}>
        {selectedNode && (
          <div style={{ display: 'grid', gap: 16 }}>
            <section style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.75)' }}>슬롯 유형</label>
              <select
                value={data.slot_type || 'ai'}
                onChange={(event) => data.onChange?.({ slot_type: event.target.value })}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  background: 'rgba(15, 23, 42, 0.6)',
                  color: '#f8fafc',
                  fontWeight: 600,
                }}
              >
                <option value="ai">AI</option>
                <option value="user_action">유저 행동</option>
                <option value="system">시스템</option>
              </select>
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.75)' }}>템플릿</label>
              <textarea
                rows={10}
                value={data.template || ''}
                onChange={(event) => data.onChange?.({ template: event.target.value })}
                style={{
                  width: '100%',
                  minHeight: 200,
                  borderRadius: 14,
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  color: '#f1f5f9',
                  padding: '14px 16px',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  resize: 'vertical',
                }}
              />
              <p style={{ fontSize: 12, color: 'rgba(148, 163, 184, 0.9)', margin: 0 }}>
                변수·토큰은 아래 도구 또는 우측 하단 변수 패널에서 추가할 수 있습니다.
              </p>
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => onMarkAsStart?.(selectedNodeId)}
                  disabled={!selectedNodeId}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    background: data.isStart ? 'rgba(96, 165, 250, 0.35)' : 'rgba(148, 163, 184, 0.15)',
                    color: '#e2e8f0',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    fontWeight: 600,
                    opacity: selectedNodeId ? 1 : 0.5,
                  }}
                >
                  {data.isStart ? '시작 노드' : '시작 지정'}
                </button>
                <button
                  type="button"
                  onClick={onToggleInvisible}
                  disabled={!selectedNodeId}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    background: data.invisible ? 'rgba(248, 113, 113, 0.25)' : 'rgba(148, 163, 184, 0.15)',
                    color: '#e2e8f0',
                    border: '1px solid rgba(248, 113, 113, 0.35)',
                    fontWeight: 600,
                    opacity: selectedNodeId ? 1 : 0.5,
                  }}
                >
                  {data.invisible ? '숨김 해제' : '숨김 모드'}
                </button>
                <button
                  type="button"
                  onClick={onOpenVariables}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    background: 'rgba(167, 139, 250, 0.25)',
                    color: '#ede9fe',
                    border: '1px solid rgba(167, 139, 250, 0.4)',
                    fontWeight: 600,
                  }}
                >
                  변수 패널 열기
                </button>
              </div>
              <button
                type="button"
                onClick={onDeleteSelected}
                disabled={!selectedNodeId}
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  background: 'rgba(248, 113, 113, 0.2)',
                  color: '#fecaca',
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  fontWeight: 700,
                  opacity: selectedNodeId ? 1 : 0.5,
                }}
              >
                프롬프트 삭제
              </button>
            </section>

            <section
              style={{
                borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                paddingTop: 16,
              }}
            >
              <SidePanel
                selectedNodeId={selectedNodeId}
                selectedEdge={null}
                setEdges={setEdges}
                setNodes={setNodes}
                onInsertToken={onInsertToken}
              />
            </section>
          </div>
        )}

        {selectedEdge && (
          <SidePanel
            selectedNodeId={null}
            selectedEdge={selectedEdge}
            setEdges={setEdges}
            setNodes={setNodes}
            onInsertToken={onInsertToken}
          />
        )}

        {!selectedNode && !selectedEdge && (
          <div style={{ color: 'rgba(148, 163, 184, 0.7)', fontSize: 14 }}>
            편집할 프롬프트나 브릿지를 선택해 주세요.
          </div>
        )}
      </div>
    </aside>
  )
}
