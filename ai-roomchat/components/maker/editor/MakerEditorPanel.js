'use client';

import SidePanel from '../SidePanel';
import EditorMonaco from '../../EditorMonaco.jsx';
import { useStudioTemplate } from '../../../contexts/StudioStore';

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
  onRequestAdvancedTools = () => {},
  onAddPrompt,
}) {
  const nodeData = selectedNode?.data || null;
  // Optional: unify edits with Studio template JSON if provider exists
  let studio = null;
  try {
    studio = useStudioTemplate();
  } catch {}

  // Fallback to global actions if prop not provided
  const addPrompt = typeof onAddPrompt === 'function'
    ? onAddPrompt
    : (typeof window !== 'undefined' && window.__makerActions && typeof window.__makerActions.addPromptNode === 'function'
        ? window.__makerActions.addPromptNode
        : null);

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
      {/* 프롬프트 생성 툴바 (패널 열기 버튼 위) */}
      {addPrompt && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => addPrompt('ai', '')}
            style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', fontWeight: 700, fontSize: 12 }}
          >
            + AI 프롬프트
          </button>
          <button
            type="button"
            onClick={() => addPrompt('user_action', '')}
            style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #bae6fd', background: '#e0f2fe', color: '#075985', fontWeight: 700, fontSize: 12 }}
          >
            + 유저 프롬프트
          </button>
          <button
            type="button"
            onClick={() => addPrompt('system', '')}
            style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #fecaca', background: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: 12 }}
          >
            + 시스템
          </button>
        </div>
      )}

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
          {tabs.map(tab => {
            const active = tab.id === activeTab;
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
            );
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
                  <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                    슬롯 타입
                  </label>
                  <select
                    value={nodeData.slot_type || 'ai'}
                    onChange={event => nodeData.onChange?.({ slot_type: event.target.value })}
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
                  <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                    프롬프트 내용
                  </label>
                  <div style={{ height: 220, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                    <EditorMonaco
                      value={nodeData.template || ''}
                      onChange={val => {
                        // local graph update
                        nodeData.onChange?.({ template: val });
                        // studio JSON update
                        if (studio && typeof studio.setTemplateText === 'function') {
                          try {
                            const obj = JSON.parse(studio.templateText || '{}');
                            if (Array.isArray(obj.nodes)) {
                              const idx = obj.nodes.findIndex(n => n?.id === selectedNodeId);
                              if (idx >= 0) {
                                const n = obj.nodes[idx] || {};
                                const data = { ...(n.data || {}), template: val };
                                obj.nodes[idx] = { ...n, data };
                                studio.setTemplateText(JSON.stringify(obj, null, 2));
                              }
                            }
                          } catch {}
                        }
                      }}
                      language="markdown"
                      theme="vs-light"
                      height="100%"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'guide' && (
          <div style={{ display: 'grid', gap: 8, color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>
              • 노드를 선택해 템플릿과 변수 규칙을 다듬고, 필요하면 Invisible 토글로 노출 범위를
              조정하세요.
            </p>
            <p style={{ margin: 0 }}>
              • 브릿지를 선택하면 조건 빌더에서 턴/변수 조건과 확률을 설정할 수 있습니다.
            </p>
            <p style={{ margin: 0 }}>
              • 오른쪽 하단의 변수 버튼을 눌러 전역·로컬 변수 규칙을 언제든지 확인할 수 있습니다.
            </p>
          </div>
        )}

        {activeTab === 'history' && (
          <div
            style={{ display: 'grid', gap: 12, fontSize: 13, lineHeight: 1.6, color: '#475569' }}
          >
            <p style={{ margin: 0 }}>
              자동 버전 업그레이드 히스토리는 이제 고급 도구 패널에서 확인하고 내보낼 수 있습니다.
              아래 버튼을 눌러 고급 도구를 열어보세요.
            </p>
            <button
              type="button"
              onClick={onRequestAdvancedTools}
              style={{
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid #94a3b8',
                background: '#f1f5f9',
                color: '#0f172a',
                fontWeight: 600,
                fontSize: 12,
                justifySelf: 'start',
              }}
            >
              고급 도구 열기
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
