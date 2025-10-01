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
  onDeleteSelected,
  onInsertToken,
  setNodes,
  setEdges,
  saveHistory = [],
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
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                background: '#f8fafc',
                padding: 12,
              }}
            >
              <SidePanel
                selectedNodeId={selectedNodeId}
                selectedEdge={selectedEdge}
                setEdges={setEdges}
                setNodes={setNodes}
                onInsertToken={onInsertToken}
              />
            </div>
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
              </div>
            )}
          </div>
        )}

        {activeTab === 'guide' && (
          <div style={{ display: 'grid', gap: 8, color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>• 노드를 선택해 템플릿과 변수 규칙을 다듬고, 필요하면 Invisible 토글로 노출 범위를 조정하세요.</p>
            <p style={{ margin: 0 }}>• 브릿지를 선택하면 조건 빌더에서 턴/변수 조건과 확률을 설정할 수 있습니다.</p>
            <p style={{ margin: 0 }}>• 오른쪽 하단의 변수 버튼을 눌러 전역·로컬 변수 규칙을 언제든지 확인할 수 있습니다.</p>
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {saveHistory.length === 0 ? (
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
                아직 자동 버전 업그레이드 내역이 없습니다. 저장 후 자동 갱신이 실행되면 이곳에 기록이 쌓입니다.
              </p>
            ) : (
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  display: 'grid',
                  gap: 12,
                  fontSize: 13,
                  color: '#0f172a',
                }}
              >
                {saveHistory.map((entry) => (
                  <li key={entry.id} style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{entry.message}</strong>
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        {new Date(entry.timestamp).toLocaleString('ko-KR', {
                          hour12: false,
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    {entry.summary && (
                      <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{entry.summary}</p>
                    )}
                    {Array.isArray(entry.details) && entry.details.length > 0 && (
                      <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.5, color: '#1f2937' }}>
                        {entry.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
