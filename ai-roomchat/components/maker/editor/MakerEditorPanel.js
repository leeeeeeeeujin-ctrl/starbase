'use client';

import EditorMonaco from '../../EditorMonaco.jsx';
import { parseTurnTemplate, serializeTurnTemplate } from '../../../lib/battle/turnTemplate';

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export default function MakerEditorPanel({
  selectedNode,
  selectedNodeId,
  selectedEdge,
  onMarkAsStart,
  onDeleteSelected,
  setNodes,
  setEdges,
}) {
  const nodeData = selectedNode?.data || null;
  const turn = nodeData ? parseTurnTemplate(nodeData.template || '', nodeData.slot_type || 'ai') : null;
  const meta = turn?.meta || null;

  const updateNodeTemplate = nextTemplate => {
    if (!selectedNodeId) return;
    setNodes(current =>
      current.map(node =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, template: nextTemplate } } : node
      )
    );
  };

  const updateMeta = partial => {
    if (!meta || !nodeData) return;
    updateNodeTemplate(
      serializeTurnTemplate(
        {
          ...meta,
          ...partial,
        },
        turn.body || '',
        nodeData.slot_type || 'ai'
      )
    );
  };

  const updateBody = nextBody => {
    if (!meta || !nodeData) return;
    updateNodeTemplate(serializeTurnTemplate(meta, nextBody, nodeData.slot_type || 'ai'));
  };

  const updateEdge = updater => {
    if (!selectedEdge) return;
    setEdges(current =>
      current.map(edge => {
        if (edge.id !== selectedEdge.id) return edge;
        const nextData = updater(edge.data || {});
        return { ...edge, data: nextData, label: buildRouteLabel(nextData) };
      })
    );
  };

  if (selectedEdge) {
    const edgeData = selectedEdge.data || {};
    const currentConditions = Array.isArray(edgeData.conditions) ? edgeData.conditions : [];
    const currentKey = currentConditions[0]?.key || '';
    const currentValue = currentConditions[0]?.equals || '';

    return (
      <section
        style={{
          background: '#ffffff',
          borderRadius: 20,
          padding: 16,
          display: 'grid',
          gap: 14,
          border: '1px solid #cbd5e1',
        }}
      >
        <strong style={{ fontSize: 15, color: '#0f172a' }}>분기 조건</strong>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle}>조건 키</label>
          <input
            name="route-condition-key"
            type="text"
            value={currentKey}
            onChange={event =>
              updateEdge(data => ({
                ...data,
                conditions: event.target.value
                  ? [{ key: event.target.value, equals: currentValue }]
                  : [],
              }))
            }
            style={inputStyle}
            placeholder="예: branch_hint"
          />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle}>조건 값</label>
          <input
            name="route-condition-value"
            type="text"
            value={currentValue}
            onChange={event =>
              updateEdge(data => ({
                ...data,
                conditions: currentKey
                  ? [{ key: currentKey, equals: event.target.value }]
                  : [],
              }))
            }
            style={inputStyle}
            placeholder="예: attack"
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
          <input
            name="route-fallback"
            type="checkbox"
            checked={!!edgeData.fallback}
            onChange={event =>
              updateEdge(data => ({
                ...data,
                fallback: event.target.checked,
              }))
            }
          />
          다른 조건이 모두 실패했을 때 쓰는 기본 분기
        </label>
      </section>
    );
  }

  if (!selectedNode || !meta) {
    return (
      <section
        style={{
          background: '#ffffff',
          borderRadius: 20,
          padding: 18,
          border: '1px solid #cbd5e1',
          color: '#475569',
          lineHeight: 1.7,
        }}
      >
        노드나 연결선을 선택하세요. 노드는 실행 내용, 연결선은 분기 조건을 편집합니다.
      </section>
    );
  }

  return (
    <section
      style={{
        background: '#ffffff',
        borderRadius: 20,
        padding: 16,
        display: 'grid',
        gap: 16,
        border: '1px solid #cbd5e1',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15, color: '#0f172a' }}>실행 노드 편집</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onMarkAsStart(selectedNodeId)} style={chipButtonStyle('#fef3c7', '#92400e')}>
            시작 지정
          </button>
          <button type="button" onClick={onDeleteSelected} style={chipButtonStyle('#fee2e2', '#b91c1c')}>
            삭제
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="노드 이름">
          <input
            name="execute-title"
            type="text"
            value={meta.title || ''}
            onChange={event => updateMeta({ title: event.target.value })}
            style={inputStyle}
          />
        </Field>

        <Field label="실행 종류">
          <select
            name="execute-type"
            value={meta.executionType || 'ai_prompt'}
            onChange={event =>
              updateMeta({
                executionType: event.target.value,
                outputFormat: event.target.value === 'user_response' ? 'text' : meta.outputFormat,
              })
            }
            style={inputStyle}
          >
            <option value="ai_prompt">AI 프롬프트 실행</option>
            <option value="user_response">유저 응답 받기</option>
          </select>
        </Field>

        <Field label="행동 주체">
          <input
            name="execute-actor-scope"
            type="text"
            value={meta.actorScope || 'self'}
            onChange={event => updateMeta({ actorScope: event.target.value })}
            style={inputStyle}
            placeholder="self, opponent, role:judge"
          />
        </Field>

        <Field label="저장 키">
          <input
            name="execute-result-key"
            type="text"
            value={meta.resultKey || ''}
            onChange={event => updateMeta({ resultKey: event.target.value })}
            style={inputStyle}
            placeholder="예: action_result"
          />
        </Field>
      </div>

      <Field label="설명 문구">
        <textarea
          name="execute-display"
          value={meta.display || ''}
          onChange={event => updateMeta({ display: event.target.value })}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="입력 방식">
          <select
            name="execute-input-mode"
            value={meta.inputMode || 'none'}
            onChange={event => updateMeta({ inputMode: event.target.value })}
            style={inputStyle}
          >
            <option value="none">없음</option>
            <option value="text">텍스트</option>
            <option value="choice">선택지</option>
            <option value="ability">능력 선택</option>
            <option value="target">대상 선택</option>
          </select>
        </Field>
        <Field label="출력 형식">
          <select
            name="execute-output-format"
            value={meta.outputFormat || 'json'}
            onChange={event => updateMeta({ outputFormat: event.target.value })}
            style={inputStyle}
          >
            <option value="json">JSON</option>
            <option value="text">텍스트</option>
          </select>
        </Field>
        <Field label="입력 라벨">
          <input
            name="execute-input-label"
            type="text"
            value={meta.inputLabel || ''}
            onChange={event => updateMeta({ inputLabel: event.target.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="입력 placeholder">
          <input
            name="execute-input-placeholder"
            type="text"
            value={meta.inputPlaceholder || ''}
            onChange={event => updateMeta({ inputPlaceholder: event.target.value })}
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="AI에 같이 넘길 참가자 범위">
        <input
          name="execute-participant-scope"
          type="text"
          value={(meta.participantScope || []).join(', ')}
          onChange={event => updateMeta({ participantScope: parseCsv(event.target.value) })}
          style={inputStyle}
          placeholder="self, opponent, allies"
        />
      </Field>

      <Field label="문구를 보여줄 범위">
        <input
          name="execute-visibility-scope"
          type="text"
          value={(meta.visibilityScope || []).join(', ')}
          onChange={event => updateMeta({ visibilityScope: parseCsv(event.target.value) })}
          style={inputStyle}
          placeholder="all, self, role:judge"
        />
      </Field>

      <Field label="기대하는 JSON 구조 설명">
        <textarea
          name="execute-output-schema"
          value={meta.outputSchema || ''}
          onChange={event => updateMeta({ outputSchema: event.target.value })}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder='예: {"branch_hint":"attack|defend","narration":"..."}'
        />
      </Field>

      <Field label="실행 본문">
        <div style={{ height: 220, borderRadius: 14, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
          <EditorMonaco
            value={turn.body || ''}
            onChange={value => updateBody(value)}
            language="markdown"
            theme="vs-dark"
            height="100%"
          />
        </div>
      </Field>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function buildRouteLabel(data) {
  if (data?.fallback) return 'fallback';
  const first = Array.isArray(data?.conditions) ? data.conditions[0] : null;
  if (!first?.key) return '다음';
  return `${first.key} = ${first.equals ?? ''}`.trim();
}

const labelStyle = {
  fontSize: 12,
  color: '#475569',
  fontWeight: 700,
};

const inputStyle = {
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  padding: '10px 12px',
  fontSize: 13,
  color: '#0f172a',
};

function chipButtonStyle(background, color) {
  return {
    border: 'none',
    borderRadius: 999,
    background,
    color,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  };
}
