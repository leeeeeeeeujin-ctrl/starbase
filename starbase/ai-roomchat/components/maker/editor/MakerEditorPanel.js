'use client'

import { useEffect, useState } from 'react'

import SidePanel from '../SidePanel'
import TokenPalette from '../TokenPalette'
import TutorialHint from './TutorialHint'

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
  const [showPalette, setShowPalette] = useState(false)

  useEffect(() => {
    if (selectedNodeId) {
      setShowPalette(true)
    } else {
      setShowPalette(false)
    }
  }, [selectedNodeId])

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
        background: 'rgba(248, 250, 252, 0.96)',
        color: '#0f172a',
        zIndex: 90,
        boxShadow: '-32px 0 120px -64px rgba(15, 23, 42, 0.75)',
        borderLeft: '1px solid rgba(148, 163, 184, 0.3)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 22px 12px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.25)',
        }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 16 }}>
            {selectedNode ? '프롬프트 편집' : selectedEdge ? '브릿지 편집' : '항목 선택'}
          </strong>
          <span style={{ fontSize: 12, color: '#475569' }}>
            변경 사항은 닫을 때 자동으로 저장됩니다.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TutorialHint
            label="패널 도움말"
            description="텍스트를 입력하면 위 토큰 팔레트가 자동으로 열립니다. 노드 속성과 연결 설정을 조정해 흐름을 완성하세요."
          />
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, rgba(226, 232, 240, 0.9), rgba(203, 213, 225, 0.85))',
              color: '#0f172a',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              fontWeight: 600,
            }}
          >
            닫기
          </button>
        </div>
      </div>

      <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '12px 22px 24px', display: 'grid', gap: 18 }}>
        {selectedNode && (
          <div style={{ display: 'grid', gap: 20 }}>
            {showPalette && (
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 5,
                  background: 'rgba(248, 250, 252, 0.98)',
                  borderRadius: 18,
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  boxShadow: '0 24px 42px -32px rgba(15, 23, 42, 0.4)',
                  padding: '14px 16px',
                }}
              >
                <TokenPalette onInsert={onInsertToken} />
              </div>
            )}

            <section style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>슬롯 유형</label>
              <select
                value={data.slot_type || 'ai'}
                onChange={(event) => data.onChange?.({ slot_type: event.target.value })}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: '#fff',
                  color: '#0f172a',
                  fontWeight: 600,
                }}
              >
                <option value="ai">AI</option>
                <option value="user_action">유저 행동</option>
                <option value="system">시스템</option>
              </select>
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>템플릿</label>
              <textarea
                rows={10}
                value={data.template || ''}
                onChange={(event) => data.onChange?.({ template: event.target.value })}
                onFocus={() => setShowPalette(true)}
                style={{
                  width: '100%',
                  minHeight: 200,
                  borderRadius: 14,
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: '#fff',
                  color: '#0f172a',
                  padding: '14px 16px',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  resize: 'vertical',
                }}
              />
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                텍스트 안에서 {'{{ }}'} 토큰을 사용해 캐릭터 정보를 불러올 수 있습니다.
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
                    background: data.isStart
                      ? 'linear-gradient(135deg, rgba(191, 219, 254, 0.9), rgba(96, 165, 250, 0.85))'
                      : 'linear-gradient(135deg, rgba(226, 232, 240, 0.9), rgba(203, 213, 225, 0.85))',
                    color: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.4)',
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
                    background: data.invisible
                      ? 'linear-gradient(135deg, rgba(254, 205, 211, 0.9), rgba(248, 113, 113, 0.75))'
                      : 'linear-gradient(135deg, rgba(226, 232, 240, 0.9), rgba(203, 213, 225, 0.85))',
                    color: '#0f172a',
                    border: '1px solid rgba(248, 113, 113, 0.4)',
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
                    background: 'linear-gradient(135deg, rgba(221, 214, 254, 0.92), rgba(196, 181, 253, 0.88))',
                    color: '#312e81',
                    border: '1px solid rgba(167, 139, 250, 0.45)',
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
                  background: 'linear-gradient(135deg, rgba(254, 202, 202, 0.95), rgba(248, 113, 113, 0.85))',
                  color: '#7f1d1d',
                  border: '1px solid rgba(248, 113, 113, 0.45)',
                  fontWeight: 700,
                  opacity: selectedNodeId ? 1 : 0.5,
                }}
              >
                프롬프트 삭제
              </button>
            </section>

            <section
              style={{
                borderTop: '1px solid rgba(148, 163, 184, 0.2)',
                paddingTop: 16,
              }}
            >
              <SidePanel
                selectedNodeId={selectedNodeId}
                selectedEdge={null}
                setEdges={setEdges}
                setNodes={setNodes}
                onInsertToken={onInsertToken}
                showTokenPalette={false}
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
            showTokenPalette
          />
        )}

        {!selectedNode && !selectedEdge && (
          <div style={{ color: '#64748b', fontSize: 14 }}>
            편집할 프롬프트나 브릿지를 선택해 주세요.
          </div>
        )}
      </div>
    </aside>
  )
}
