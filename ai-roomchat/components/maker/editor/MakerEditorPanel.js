'use client';

import SidePanel from '../SidePanel';
import EditorMonaco from '../../EditorMonaco.jsx';
import { useStudioTemplate } from '../../../contexts/StudioStore';

const TURN_META_VERSION = 1;
const TURN_INPUT_MODES = ['none', 'text', 'choice', 'ability', 'target'];

function getDefaultTurnMeta(slotType = 'ai') {
  const common = {
    version: TURN_META_VERSION,
    title: '',
    display: '',
    inputMode: 'none',
    inputLabel: '',
    inputPlaceholder: '',
    resultKey: '',
    participantScope: [],
  };

  if (slotType === 'user_action') {
    return {
      ...common,
      title: '유저 입력 턴',
      inputMode: 'text',
    };
  }

  if (slotType === 'system') {
    return {
      ...common,
      title: '시스템 턴',
    };
  }

  return {
    ...common,
    title: 'AI 턴',
  };
}

function normalizeTurnMeta(rawMeta, slotType = 'ai') {
  const base = getDefaultTurnMeta(slotType);
  const source = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
  const participantScope = Array.isArray(source.participantScope)
    ? source.participantScope
        .map(value => String(value || '').trim())
        .filter(Boolean)
    : [];

  const inputMode = TURN_INPUT_MODES.includes(source.inputMode) ? source.inputMode : base.inputMode;

  return {
    ...base,
    ...source,
    version: TURN_META_VERSION,
    title: String(source.title ?? base.title),
    display: String(source.display ?? ''),
    inputMode,
    inputLabel: String(source.inputLabel ?? ''),
    inputPlaceholder: String(source.inputPlaceholder ?? ''),
    resultKey: String(source.resultKey ?? ''),
    participantScope,
  };
}

function parseTurnTemplate(rawTemplate, slotType = 'ai') {
  const text = typeof rawTemplate === 'string' ? rawTemplate : '';
  const fallback = {
    meta: getDefaultTurnMeta(slotType),
    body: text,
  };

  if (!text.startsWith('---\n')) {
    return fallback;
  }

  const closingIndex = text.indexOf('\n---\n', 4);
  if (closingIndex < 0) {
    return fallback;
  }

  const rawMeta = text.slice(4, closingIndex).trim();
  const body = text.slice(closingIndex + 5);

  try {
    const parsedMeta = JSON.parse(rawMeta);
    return {
      meta: normalizeTurnMeta(parsedMeta, slotType),
      body,
    };
  } catch {
    return fallback;
  }
}

function serializeTurnTemplate(meta, body, slotType = 'ai') {
  const normalizedMeta = normalizeTurnMeta(meta, slotType);
  return `---\n${JSON.stringify(normalizedMeta, null, 2)}\n---\n${body || ''}`;
}

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
  onRequestAdvancedTools = () => {},
  onAddPrompt,
}) {
  const nodeData = selectedNode?.data || null;
  const parsedTurn = nodeData ? parseTurnTemplate(nodeData.template || '', nodeData.slot_type || 'ai') : null;
  const turnMeta = parsedTurn?.meta || null;
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
      {/* 코드 패널은 상위 MakerEditor에서 렌더되며, 여기서는 프롬프트·노드 UI만 관리 */}
      {/* 프롬프트 생성 툴바 (패널 열기 버튼 위) */}
      {addPrompt && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => addPrompt('ai', '')}
            style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', fontWeight: 700, fontSize: 12 }}
          >
            + AI 턴
          </button>
          <button
            type="button"
            onClick={() => addPrompt('user_action', '')}
            style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #bae6fd', background: '#e0f2fe', color: '#075985', fontWeight: 700, fontSize: 12 }}
          >
            + 유저 입력 턴
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
                ? '선택한 턴 정의를 편집 중입니다.'
                : selectedEdge
                  ? '선택한 흐름 연결을 편집 중입니다.'
                  : '편집할 턴 또는 연결을 선택하세요.'}
            </span>
            <span style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
              메이커의 그래프는 배틀 흐름의 기준선입니다. 각 노드에서 유저 입력, AI 호출,
              시스템 안내를 순서대로 정의하고 저장된 내용이 세션 런타임으로 전달됩니다.
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
