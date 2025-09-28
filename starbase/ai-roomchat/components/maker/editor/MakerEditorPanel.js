'use client'

import SidePanel from '../SidePanel'

function SlotVisibilityControl({ suggestions, visibility, onVisibilityChange, onToggleInvisible }) {
  const visibleSet = new Set(visibility?.visible_slots || [])

  const toggleSlot = (slotNo) => {
    onVisibilityChange((current) => {
      const base = new Set(current.visible_slots || [])
      if (base.has(slotNo)) {
        base.delete(slotNo)
      } else {
        base.add(slotNo)
      }
      return {
        invisible: current.invisible,
        visible_slots: Array.from(base).sort((a, b) => a - b),
      }
    })
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>노출 범위</span>
        <button
          type="button"
          onClick={onToggleInvisible}
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            border: '1px solid #dbeafe',
            background: visibility?.invisible ? '#fee2e2' : '#f1f5f9',
            color: visibility?.invisible ? '#b91c1c' : '#1e293b',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {visibility?.invisible ? '숨김 해제' : '숨김 전환'}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: '#475569', lineHeight: 1.5 }}>
        숨김 모드일 때 공개할 슬롯을 선택하세요. 선택하지 않으면 누구에게도 노출되지 않습니다.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {suggestions.length === 0 && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>아직 등록된 슬롯이 없습니다.</span>
        )}
        {suggestions.map((option) => {
          const checked = visibleSet.has(option.value)
          return (
            <label
              key={option.value}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 8,
                border: checked ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
                background: checked ? 'rgba(37,99,235,0.08)' : '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleSlot(option.value)}
                style={{ width: 14, height: 14 }}
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

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
  slotSuggestions,
  selectedVisibility,
  onVisibilityChange,
}) {
  const nodeData = selectedNode?.data || null

  return (
    <section
      style={{
        background: '#ffffff',
        borderRadius: 18,
        padding: '10px 14px',
        boxShadow: '0 14px 34px -30px rgba(15, 23, 42, 0.4)',
        display: 'grid',
        gap: 10,
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
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
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: active ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  background: active ? '#dbeafe' : '#f8fafc',
                  color: active ? '#1d4ed8' : '#475569',
                  fontWeight: 600,
                  fontSize: 13,
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
            padding: '5px 12px',
            borderRadius: 999,
            background: '#0ea5e9',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          변수 설정
        </button>
      </div>

      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: '12px 14px',
          minHeight: 160,
          maxHeight: '45vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          background: '#fdfdff',
          display: 'grid',
          gap: 12,
        }}
      >
        {activeTab === 'selection' && (
          <div style={{ display: 'grid', gap: 12 }}>
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
                  padding: '5px 10px',
                  borderRadius: 10,
                  background: selectedNode?.data?.isStart ? '#dbeafe' : '#e2e8f0',
                  color: '#0f172a',
                  fontWeight: 600,
                  fontSize: 13,
                  opacity: selectedNodeId ? 1 : 0.6,
                }}
              >
                시작 지정
              </button>
              <button
                onClick={onDeleteSelected}
                disabled={!selectedNodeId}
                style={{
                  padding: '5px 10px',
                  borderRadius: 10,
                  background: '#fee2e2',
                  color: '#b91c1c',
                  fontWeight: 600,
                  fontSize: 13,
                  opacity: selectedNodeId ? 1 : 0.6,
                }}
              >
                삭제
              </button>
            </div>

            {nodeData && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>슬롯 타입</label>
                  <select
                    value={nodeData.slot_type || 'ai'}
                    onChange={(event) => nodeData.onChange?.({ slot_type: event.target.value })}
                    style={{
                      borderRadius: 10,
                      border: '1px solid #cbd5f5',
                      padding: '6px 10px',
                      fontSize: 13,
                      fontWeight: 600,
                      background: '#fff',
                    }}
                  >
                    <option value="ai">AI</option>
                    <option value="user_action">유저 행동</option>
                    <option value="system">시스템</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>프롬프트 내용</label>
                  <textarea
                    rows={7}
                    value={nodeData.template || ''}
                    onChange={(event) => nodeData.onChange?.({ template: event.target.value })}
                    style={{
                      width: '100%',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      padding: '10px 12px',
                      fontSize: 13,
                      lineHeight: 1.5,
                      resize: 'vertical',
                    }}
                    placeholder="프롬프트 텍스트를 입력하세요"
                  />
                </div>

                <SlotVisibilityControl
                  suggestions={slotSuggestions}
                  visibility={selectedVisibility}
                  onVisibilityChange={onVisibilityChange}
                  onToggleInvisible={onToggleInvisible}
                />
              </div>
            )}

            <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
              토큰 팔레트는 도구 탭에서 확인할 수 있고, Invisible 설정은 위 노출 범위 컨트롤로 관리하세요.
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
