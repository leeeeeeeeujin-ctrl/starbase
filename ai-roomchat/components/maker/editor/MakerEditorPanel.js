'use client';

import SidePanel from '../SidePanel';
import EditorMonaco from '../../EditorMonaco.jsx';
import { useStudioTemplate } from '../../../contexts/StudioStore';
import { parseTurnTemplate, serializeTurnTemplate } from '../../../lib/battle/turnTemplate';

// Keep lightweight and avoid window globals in render path
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
}) {
  const nodeData = selectedNode?.data || null;
  const parsedTurn = nodeData ? parseTurnTemplate(nodeData.template || '', nodeData.slot_type || 'ai') : null;
  const turnMeta = parsedTurn?.meta || null;
  // Optional: unify edits with Studio template JSON if provider exists
  let studio = null;
  try {
    studio = useStudioTemplate();
  } catch {}

  const updateSelectedNodeTemplate = nextTemplate => {
    if (!selectedNodeId) return;

    setNodes(current =>
      current.map(node =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, template: nextTemplate } }
          : node
      )
    );

    if (studio && typeof studio.setTemplateText === 'function') {
      try {
        const obj = JSON.parse(studio.templateText || '{}');
        if (Array.isArray(obj.nodes)) {
          const idx = obj.nodes.findIndex(node => node?.id === selectedNodeId);
          if (idx >= 0) {
            const node = obj.nodes[idx] || {};
            const data = { ...(node.data || {}), template: nextTemplate };
            obj.nodes[idx] = { ...node, data };
            studio.setTemplateText(JSON.stringify(obj, null, 2));
          }
        }
      } catch {}
    }
  };

  const updateTurnMeta = partial => {
    if (!nodeData) return;
    const current = parseTurnTemplate(nodeData.template || '', nodeData.slot_type || 'ai');
    updateSelectedNodeTemplate(
      serializeTurnTemplate(
        {
          ...current.meta,
          ...partial,
        },
        current.body,
        nodeData.slot_type || 'ai'
      )
    );
  };

  const updateTurnBody = value => {
    if (!nodeData) return;
    const current = parseTurnTemplate(nodeData.template || '', nodeData.slot_type || 'ai');
    updateSelectedNodeTemplate(
      serializeTurnTemplate(current.meta, value, nodeData.slot_type || 'ai')
    );
  };

  return (
    <section
      style={{
        background: '#020617',
        borderRadius: 18,
        padding: '10px 12px',
        boxShadow: '0 14px 34px -30px rgba(15, 23, 42, 0.8)',
        display: 'grid',
        gap: 8,
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
                ? '선택한 턴 정의를 편집 중입니다.'
                : selectedEdge
                  ? '선택한 흐름 연결을 편집 중입니다.'
                  : '편집할 턴 또는 연결을 선택하세요.'}
            </span>
            <span style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
              각 노드는 한 턴입니다. 유저 안내문, 입력 방식, AI 프롬프트 본문을 정하고
              연결선으로 다음 턴 흐름을 만듭니다.
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
                    턴 타입
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
                    <option value="ai">AI 턴</option>
                    <option value="user_action">유저 입력 턴</option>
                    <option value="system">시스템</option>
                  </select>
                </div>

                {turnMeta && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                        턴 이름
                      </label>
                      <input
                        type="text"
                        value={turnMeta.title || ''}
                        onChange={event => updateTurnMeta({ title: event.target.value })}
                        style={{
                          borderRadius: 10,
                          border: '1px solid #cbd5f5',
                          padding: '6px 10px',
                          fontSize: 13,
                          background: '#fff',
                        }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                        유저 안내문
                      </label>
                      <textarea
                        value={turnMeta.display || ''}
                        onChange={event => updateTurnMeta({ display: event.target.value })}
                        rows={3}
                        style={{
                          borderRadius: 10,
                          border: '1px solid #cbd5f5',
                          padding: '6px 10px',
                          fontSize: 13,
                          background: '#fff',
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                          입력 방식
                        </label>
                        <select
                          value={turnMeta.inputMode || 'none'}
                          onChange={event => updateTurnMeta({ inputMode: event.target.value })}
                          style={{
                            borderRadius: 10,
                            border: '1px solid #cbd5f5',
                            padding: '6px 10px',
                            fontSize: 13,
                            background: '#fff',
                          }}
                        >
                          <option value="none">입력 없음</option>
                          <option value="text">텍스트 입력</option>
                          <option value="choice">선택지</option>
                          <option value="ability">능력 선택</option>
                          <option value="target">대상 선택</option>
                        </select>
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                          결과 키
                        </label>
                        <input
                          type="text"
                          value={turnMeta.resultKey || ''}
                          onChange={event => updateTurnMeta({ resultKey: event.target.value })}
                          style={{
                            borderRadius: 10,
                            border: '1px solid #cbd5f5',
                            padding: '6px 10px',
                            fontSize: 13,
                            background: '#fff',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1fr 1fr' }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                          입력 라벨
                        </label>
                        <input
                          type="text"
                          value={turnMeta.inputLabel || ''}
                          onChange={event => updateTurnMeta({ inputLabel: event.target.value })}
                          style={{
                            borderRadius: 10,
                            border: '1px solid #cbd5f5',
                            padding: '6px 10px',
                            fontSize: 13,
                            background: '#fff',
                          }}
                        />
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                          입력 placeholder
                        </label>
                        <input
                          type="text"
                          value={turnMeta.inputPlaceholder || ''}
                          onChange={event => updateTurnMeta({ inputPlaceholder: event.target.value })}
                          style={{
                            borderRadius: 10,
                            border: '1px solid #cbd5f5',
                            padding: '6px 10px',
                            fontSize: 13,
                            background: '#fff',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 4 }}>
                      <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                        참가자 범위
                      </label>
                      <input
                        type="text"
                        value={(turnMeta.participantScope || []).join(', ')}
                        onChange={event =>
                          updateTurnMeta({
                            participantScope: event.target.value
                              .split(',')
                              .map(value => value.trim())
                              .filter(Boolean),
                          })
                        }
                        style={{
                          borderRadius: 10,
                          border: '1px solid #cbd5f5',
                          padding: '6px 10px',
                          fontSize: 13,
                          background: '#fff',
                        }}
                      />
                      <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                        쉼표로 구분합니다. 예: `self`, `opponent`, `allies`, `team:red`
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                    AI 프롬프트 본문
                  </label>
                  {nodeData.isStart ? (
                    <div style={{ padding: 12, border: '1px solid #334155', borderRadius: 10, background: '#0f172a', color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
                      ⚠️ <strong>시작 노드는 초기화 전용입니다.</strong><br />
                      시작 노드의 AI 응답은 플레이어에게 표시되지 않습니다.<br />
                      실제 게임 턴은 다음 노드부터 시작됩니다.
                    </div>
                  ) : (
                    <div style={{ height: 180, border: '1px solid #1f2937', borderRadius: 10, overflow: 'hidden', background:'#020617' }}>
                      <EditorMonaco
                        value={parsedTurn?.body || ''}
                        onChange={val => {
                          updateTurnBody(val);
                        }}
                        language="markdown"
                        theme="vs-dark"
                        height="100%"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'guide' && (
          <div style={{ display: 'grid', gap: 8, color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>
              • 턴을 선택해 AI에 보낼 내용, 유저에게 보여줄 안내, 입력이 필요한 시점을 구성하세요.
            </p>
            <p style={{ margin: 0 }}>
              • 턴 설정은 프롬프트 본문과 함께 저장되며, 이후 런타임이 그대로 읽을 수 있는 형태를 목표로 정리 중입니다.
            </p>
            <p style={{ margin: 0 }}>
              • 연결을 선택하면 다음 턴으로 넘어가는 조건과 우선순위를 조정할 수 있습니다.
            </p>
            <p style={{ margin: 0 }}>
              • 변수 설정에서 참가자 정보, 턴 입력, 숨김 상태처럼 런타임에 쓰일 값을 다듬을 수 있습니다.
            </p>
          </div>
        )}

      </div>
    </section>
  );
}
