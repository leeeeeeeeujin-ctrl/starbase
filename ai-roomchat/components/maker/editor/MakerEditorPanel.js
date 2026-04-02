'use client';

import EditorMonaco from '../../EditorMonaco.jsx';
import {
  parseTurnTemplate,
  serializeTurnTemplate,
  TURN_STATE_WRITE_SOURCES,
} from '../../../lib/battle/turnTemplate';

const ACTOR_SCOPE_OPTIONS = [
  { value: 'self', label: '현재 슬롯' },
  { value: 'enemies', label: '다른 팀' },
  { value: 'allies', label: '같은 팀' },
  { value: 'all', label: '모든 슬롯' },
  { value: 'role:', label: '특정 역할' },
  { value: 'custom', label: '직접 입력' },
];
const CONDITION_OPERATORS = [
  { value: 'equals', label: '같다' },
  { value: 'not_equals', label: '다르다' },
  { value: 'exists', label: '값이 있다' },
  { value: 'not_exists', label: '값이 없다' },
];
const VISIBILITY_SCOPE_PRESETS = [
  { value: 'all', label: '전체' },
  { value: 'self', label: '현재 주체' },
  { value: 'winners', label: '승리자' },
  { value: 'losers', label: '패배자' },
  { value: 'survivors', label: '생존자' },
  { value: 'eliminated', label: '탈락자' },
];
const PARTICIPANT_SCOPE_PRESETS = [
  { value: 'self', label: '현재 슬롯' },
  { value: 'enemies', label: '다른 팀' },
  { value: 'allies', label: '같은 팀' },
  { value: 'all', label: '모든 슬롯' },
  { value: 'winners', label: '승리자' },
  { value: 'losers', label: '패배자' },
];
const VARIABLE_KEY_PRESETS = [
  { value: 'gameResult', label: '게임 종료 여부' },
  { value: 'result.winnerTeam', label: '승리 팀' },
  { value: 'state.enemyDown', label: '상대 탈락' },
  { value: 'state.surrendered', label: '항복 여부' },
  { value: 'state.lastChoice', label: '마지막 선택' },
];

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function toggleCsvValue(list, value) {
  const current = Array.isArray(list) ? list.filter(Boolean) : [];
  if (!value) return current;
  if (current.includes(value)) {
    return current.filter(item => item !== value);
  }
  return [...current, value];
}

function buildChoiceSchema(choiceCount = 3) {
  return JSON.stringify(
    {
      choices: Array.from({ length: Math.max(1, Math.min(8, Number(choiceCount) || 3)) }, (_, index) => ({
        id: `choice_${index + 1}`,
        label: `선택지 ${index + 1}`,
        value: `choice_${index + 1}`,
      })),
    },
    null,
    2
  );
}

function buildChoiceBodyHint(choiceCount = 3, choicePrompt = '') {
  const count = Math.max(1, Math.min(8, Number(choiceCount) || 3));
  const guide = String(choicePrompt || '').trim();
  return [
    '',
    '[선택지 생성 규칙]',
    `- 반드시 ${count}개의 선택지를 구조화된 JSON 배열로 반환한다.`,
    '- 자유 텍스트로 나열하지 말고 choices 배열만 사용한다.',
    '- 각 선택지는 id, label, value를 모두 포함한다.',
    guide ? `- 선택지 조건: ${guide}` : '- 선택지 조건: 현재 장면과 요건에 맞는 선택지를 만든다.',
  ].join('\n');
}

export default function MakerEditorPanel({
  rolePresets = [],
  slotPresets = [],
  selectedNode,
  selectedNodeId,
  selectedEdge,
  onMarkAsStart,
  onDeleteSelected,
  setNodes,
  setEdges,
  compact = false,
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

  const updateStateWrites = updater => {
    if (!meta || !nodeData) return;
    const currentRules = Array.isArray(meta.stateWrites) ? meta.stateWrites : [];
    updateMeta({ stateWrites: updater(currentRules) });
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
    const addCondition = () => {
      updateEdge(data => ({
        ...data,
        conditions: [
          ...(Array.isArray(data.conditions) ? data.conditions : []),
          { key: '', equals: '' },
        ],
      }));
    };

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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ fontSize: 15, color: '#0f172a' }}>분기 슬롯</strong>
            <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              이전 턴에서 기록한 변수나 결과를 읽고, 이 선을 탈 조건을 정합니다.
            </span>
          </div>
          <button type="button" onClick={addCondition} style={chipButtonStyle('#dbeafe', '#1d4ed8')}>
            조건 추가
          </button>
        </div>

        {(currentConditions || []).length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {currentConditions.map((condition, index) => (
              <div
                key={`route-condition-${index}`}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 14,
                  background: '#f8fafc',
                  padding: 12,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <strong style={{ fontSize: 12, color: '#0f172a' }}>조건 슬롯 {index + 1}</strong>
                  <button
                    type="button"
                    onClick={() =>
                      updateEdge(data => ({
                        ...data,
                        conditions: (Array.isArray(data.conditions) ? data.conditions : []).filter(
                          (_, conditionIndex) => conditionIndex !== index
                        ),
                      }))
                    }
                    style={chipButtonStyle('#fee2e2', '#b91c1c')}
                  >
                    삭제
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <Field label="조건 변수">
                    <input
                      name={`route-condition-key-${index}`}
                      type="text"
                      value={condition?.key || ''}
                      onChange={event =>
                        updateEdge(data => ({
                          ...data,
                          conditions: (Array.isArray(data.conditions) ? data.conditions : []).map(
                            (entry, conditionIndex) =>
                              conditionIndex === index ? { ...entry, key: event.target.value } : entry
                          ),
                        }))
                      }
                      style={inputStyle}
                      placeholder="예: state.enemyDown"
                    />
                    <PresetRow
                      items={VARIABLE_KEY_PRESETS}
                      activeValues={[condition?.key || '']}
                      onToggle={value =>
                        updateEdge(data => ({
                          ...data,
                          conditions: (Array.isArray(data.conditions) ? data.conditions : []).map(
                            (entry, conditionIndex) =>
                              conditionIndex === index ? { ...entry, key: value } : entry
                          ),
                        }))
                      }
                    />
                  </Field>
                  <Field label="비교 방식">
                    <select
                      name={`route-condition-op-${index}`}
                      value={condition?.op || 'equals'}
                      onChange={event =>
                        updateEdge(data => ({
                          ...data,
                          conditions: (Array.isArray(data.conditions) ? data.conditions : []).map(
                            (entry, conditionIndex) =>
                              conditionIndex === index ? { ...entry, op: event.target.value } : entry
                          ),
                        }))
                      }
                      style={inputStyle}
                    >
                      {CONDITION_OPERATORS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="만족 값">
                    <input
                      name={`route-condition-value-${index}`}
                      type="text"
                      value={condition?.equals || ''}
                      onChange={event =>
                        updateEdge(data => ({
                          ...data,
                          conditions: (Array.isArray(data.conditions) ? data.conditions : []).map(
                            (entry, conditionIndex) =>
                              conditionIndex === index ? { ...entry, equals: event.target.value } : entry
                          ),
                        }))
                      }
                      style={inputStyle}
                      placeholder={
                        condition?.op === 'exists' || condition?.op === 'not_exists'
                          ? '이 비교 방식에선 비워둡니다'
                          : '예: true / win / attack'
                      }
                      disabled={condition?.op === 'exists' || condition?.op === 'not_exists'}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              borderRadius: 14,
              border: '1px dashed #cbd5e1',
              background: '#f8fafc',
              padding: 12,
              fontSize: 12,
              color: '#64748b',
              lineHeight: 1.6,
            }}
          >
            조건이 없으면 이 선은 기본 진행선처럼 동작합니다. 필요하면 조건 슬롯을 추가해
            <code style={{ marginLeft: 4 }}>state.enemyDown = true</code> 같은 값을 읽게 하세요.
          </div>
        )}

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

  const actorMode = getActorMode(meta.actorScope);
  const actorRole = actorMode === 'role:' ? String(meta.actorScope || '').slice(5).trim() : '';
  const actorCustom = actorMode === 'custom' ? String(meta.actorScope || '') : '';
  const roleScopePresetItems = (Array.isArray(rolePresets) ? rolePresets : [])
    .map(role => String(role?.name || '').trim())
    .filter(Boolean)
    .map(name => ({ value: `role:${name}`, label: name }));
  const slotScopePresetItems = (Array.isArray(slotPresets) ? slotPresets : [])
    .map(slot => {
      const slotLabel = String(slot?.slotLabel || '').trim();
      const roleName = String(slot?.roleName || '').trim();
      const value = slotLabel ? `slot:${slotLabel}` : '';
      return value ? { value, label: roleName ? `${roleName} · ${slotLabel}` : slotLabel } : null;
    })
    .filter(Boolean);

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

      <Section
        title="기본"
        description="이 노드에서 어느 슬롯이 행동하는지, 그리고 어떤 장면을 보여줄지 정합니다."
      >
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

          <Field label="실행 방식">
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
              <option value="ai_prompt">AI가 행동한다</option>
              <option value="user_response">플레이어가 입력한다</option>
            </select>
          </Field>

          <Field label="행동 주체">
            <select
              name="execute-actor-mode"
              value={actorMode}
              onChange={event => {
                const nextMode = event.target.value;
                if (nextMode === 'role:') {
                  updateMeta({ actorScope: actorRole ? `role:${actorRole}` : 'role:' });
                  return;
                }
                if (nextMode === 'custom') {
                  updateMeta({ actorScope: actorCustom || '' });
                  return;
                }
                updateMeta({ actorScope: nextMode });
              }}
              style={inputStyle}
            >
              {ACTOR_SCOPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {actorMode === 'role:' ? (
          <Field label="행동 역할">
            <input
              name="execute-actor-role"
              type="text"
              value={actorRole}
              onChange={event => updateMeta({ actorScope: `role:${event.target.value}` })}
              style={inputStyle}
              placeholder="예: 수비"
            />
            <PresetRow
              items={roleScopePresetItems.map(item => ({ ...item, value: item.value.replace(/^role:/, '') }))}
              activeValues={actorRole ? [actorRole] : []}
              onToggle={value => updateMeta({ actorScope: `role:${value}` })}
            />
          </Field>
        ) : null}

        {actorMode === 'custom' ? (
          <Field label="행동 대상 직접 입력">
            <input
              name="execute-actor-custom"
              type="text"
              value={actorCustom}
              onChange={event => updateMeta({ actorScope: event.target.value })}
              style={inputStyle}
              placeholder="예: team:1 / role:judge / slot:1역할-1슬롯"
            />
          </Field>
        ) : null}

        <Field label="플레이어에게 보여줄 문구">
          <textarea
            name="execute-display"
            value={meta.display || ''}
            onChange={event => updateMeta({ display: event.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        {compact ? (
          <Field label="보여줄 대상">
            <input
              name="execute-visibility-scope-compact"
              type="text"
              value={(meta.visibilityScope || []).join(', ')}
              onChange={event => updateMeta({ visibilityScope: parseCsv(event.target.value) })}
              style={inputStyle}
              placeholder="all, role:수비, slot:1-1, winners"
            />
            <PresetRow
              items={VISIBILITY_SCOPE_PRESETS}
              activeValues={meta.visibilityScope || []}
              onToggle={value => updateMeta({ visibilityScope: toggleCsvValue(meta.visibilityScope, value) })}
            />
            <PresetRow
              items={roleScopePresetItems}
              activeValues={meta.visibilityScope || []}
              onToggle={value => updateMeta({ visibilityScope: toggleCsvValue(meta.visibilityScope, value) })}
            />
            <PresetRow
              items={slotScopePresetItems}
              activeValues={meta.visibilityScope || []}
              onToggle={value => updateMeta({ visibilityScope: toggleCsvValue(meta.visibilityScope, value) })}
            />
          </Field>
        ) : (
          <Field label="결과 이름">
            <input
              name="execute-result-key"
              type="text"
              value={meta.resultKey || ''}
              onChange={event => updateMeta({ resultKey: event.target.value })}
              style={inputStyle}
              placeholder="예: result.winnerTeam"
            />
          </Field>
        )}
      </Section>

      <Section
        title="입력"
        description="이 노드에서 어느 슬롯에게 입력을 받을지, 어떤 방식으로 받을지 정합니다."
      >
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Field label="입력 방식">
            <select
              name="execute-input-mode"
              value={meta.inputMode || 'none'}
              onChange={event => updateMeta({ inputMode: event.target.value })}
              style={inputStyle}
            >
              <option value="none">입력 없음</option>
              <option value="text">텍스트 입력</option>
              <option value="choice">선택지 고르기</option>
              <option value="ability">능력 선택</option>
              <option value="target">대상 선택</option>
            </select>
          </Field>
          <Field label="결과 형식">
            <select
              name="execute-output-format"
              value={meta.outputFormat || 'json'}
              onChange={event => updateMeta({ outputFormat: event.target.value })}
              style={inputStyle}
            >
              <option value="json">구조화된 결과</option>
              <option value="text">텍스트 결과</option>
            </select>
          </Field>
          <Field label="입력 안내">
            <input
              name="execute-input-label"
              type="text"
              value={meta.inputLabel || ''}
              onChange={event => updateMeta({ inputLabel: event.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="입력 예시 문구">
            <input
              name="execute-input-placeholder"
              type="text"
              value={meta.inputPlaceholder || ''}
              onChange={event => updateMeta({ inputPlaceholder: event.target.value })}
              style={inputStyle}
            />
          </Field>
        </div>

        {compact && meta.executionType === 'user_response' ? (
          <Field label="응답할 슬롯">
            <input
              name="execute-participant-scope-compact"
              type="text"
              value={(meta.participantScope || []).join(', ')}
              onChange={event => updateMeta({ participantScope: parseCsv(event.target.value) })}
              style={inputStyle}
              placeholder="self, role:공격, slot:1역할-1슬롯"
            />
            <PresetRow
              items={PARTICIPANT_SCOPE_PRESETS}
              activeValues={meta.participantScope || []}
              onToggle={value => updateMeta({ participantScope: toggleCsvValue(meta.participantScope, value) })}
            />
            <PresetRow
              items={roleScopePresetItems}
              activeValues={meta.participantScope || []}
              onToggle={value => updateMeta({ participantScope: toggleCsvValue(meta.participantScope, value) })}
            />
            <PresetRow
              items={slotScopePresetItems}
              activeValues={meta.participantScope || []}
              onToggle={value => updateMeta({ participantScope: toggleCsvValue(meta.participantScope, value) })}
            />
          </Field>
        ) : null}

        {meta.inputMode === 'choice' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '160px minmax(0, 1fr)' }}>
              <Field label="선택지 수">
                <select
                  name="execute-choice-count"
                  value={Number(meta.choiceCount) || 3}
                  onChange={event => updateMeta({ choiceCount: Number(event.target.value) })}
                  style={inputStyle}
                >
                  {Array.from({ length: 6 }, (_, index) => index + 2).map(count => (
                    <option key={`choice-count-${count}`} value={count}>
                      {count}개
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="선택지 생성 조건">
                <input
                  name="execute-choice-prompt"
                  type="text"
                  value={meta.choiceGenerationPrompt || ''}
                  onChange={event => updateMeta({ choiceGenerationPrompt: event.target.value })}
                  style={inputStyle}
                  placeholder="예: 공격적이지 않은 선택지만, 생존 가능한 선택지 우선"
                />
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  const nextCount = Number(meta.choiceCount) || 3;
                  updateMeta({
                    outputFormat: 'json',
                    outputSchema: buildChoiceSchema(nextCount),
                  });
                  const hint = buildChoiceBodyHint(nextCount, meta.choiceGenerationPrompt);
                  const body = String(turn.body || '');
                  updateBody(body.includes('[선택지 생성 규칙]') ? body : `${body}${hint}`.trim());
                }}
                style={chipButtonStyle('#dcfce7', '#166534')}
              >
                구조화 선택지 규칙 넣기
              </button>
            </div>

            <div
              style={{
                borderRadius: 14,
                border: '1px dashed #cbd5e1',
                background: '#f8fafc',
                padding: 12,
                fontSize: 12,
                color: '#64748b',
                lineHeight: 1.6,
              }}
            >
              선택지는 자유 텍스트가 아니라
              <code style={{ margin: '0 4px' }}>choices: []</code>
              배열로 돌려주게 맞춥니다. 버튼을 누르면 본문과 결과 예시를 같이 채웁니다.
            </div>
          </div>
        ) : null}
      </Section>

      {!compact ? (
        <Section
          title="참조 범위"
          description="이 노드가 누구 정보를 참고하고, 누구에게 문구를 보여줄지 정합니다."
        >
          <Field label="같이 참조할 참가자">
            <input
              name="execute-participant-scope"
              type="text"
              value={(meta.participantScope || []).join(', ')}
              onChange={event => updateMeta({ participantScope: parseCsv(event.target.value) })}
              style={inputStyle}
              placeholder="self, opponent, allies"
            />
          </Field>

          <Field label="문구 공개 범위">
            <input
              name="execute-visibility-scope"
              type="text"
              value={(meta.visibilityScope || []).join(', ')}
              onChange={event => updateMeta({ visibilityScope: parseCsv(event.target.value) })}
              style={inputStyle}
              placeholder="all, self, role:judge"
            />
          </Field>
        </Section>
      ) : null}

      <Section
        title="기록 슬롯"
        description="이 노드 결과를 변수로 남겨, 다음 분기나 다음 턴에서 재사용합니다."
      >
        {!compact ? (
          <details
            style={{
              borderRadius: 14,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              padding: '10px 12px',
            }}
          >
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#475569', fontWeight: 700 }}>
              고급 설정: AI 결과 예시
            </summary>
            <div style={{ marginTop: 10 }}>
              <Field label="AI가 돌려주길 기대하는 예시 형태">
                <textarea
                  name="execute-output-schema"
                  value={meta.outputSchema || ''}
                  onChange={event => updateMeta({ outputSchema: event.target.value })}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  placeholder='예: {"branch_hint":"attack","gameResult":"ongoing"}'
                />
              </Field>
            </div>
          </details>
        ) : null}

        <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <label style={labelStyle}>기록 슬롯</label>
          <button
            type="button"
            onClick={() =>
              updateStateWrites(current => [
                ...current,
                {
                  id: `state-write-${Date.now()}`,
                  sourceType: 'always',
                  sourceKey: '',
                  equals: '',
                  key: '',
                  value: '',
                },
              ])
            }
            style={chipButtonStyle('#dbeafe', '#1d4ed8')}
          >
            슬롯 추가
          </button>
        </div>
        {(meta.stateWrites || []).length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {(meta.stateWrites || []).map((rule, index) => (
              <div
                key={rule.id || `state-write-${index}`}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 14,
                  background: '#f8fafc',
                  padding: 12,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <strong style={{ fontSize: 12, color: '#0f172a' }}>기록 슬롯 {index + 1}</strong>
                  <button
                    type="button"
                    onClick={() =>
                      updateStateWrites(current => current.filter((_, currentIndex) => currentIndex !== index))
                    }
                    style={chipButtonStyle('#fee2e2', '#b91c1c')}
                  >
                    삭제
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <Field label={compact ? '조건 종류' : '기록 시점'}>
                    <select
                      name={`state-write-source-${index}`}
                      value={rule.sourceType || 'always'}
                      onChange={event =>
                        updateStateWrites(current =>
                          current.map((entry, currentIndex) =>
                            currentIndex === index ? { ...entry, sourceType: event.target.value } : entry
                          )
                        )
                      }
                      style={inputStyle}
                    >
                      {TURN_STATE_WRITE_SOURCES.map(sourceType => (
                        <option key={sourceType} value={sourceType}>
                          {formatStateWriteSourceLabel(sourceType)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label={compact ? '조건 대상' : '대상 키'}>
                    <input
                      name={`state-write-source-key-${index}`}
                      type="text"
                      value={rule.sourceKey || ''}
                      onChange={event =>
                        updateStateWrites(current =>
                          current.map((entry, currentIndex) =>
                            currentIndex === index ? { ...entry, sourceKey: event.target.value } : entry
                          )
                        )
                      }
                      style={inputStyle}
                      placeholder="team 1 / participant-1"
                    />
                  </Field>

                  <Field label="만족 값">
                    <input
                      name={`state-write-equals-${index}`}
                      type="text"
                      value={rule.equals || ''}
                      onChange={event =>
                        updateStateWrites(current =>
                          current.map((entry, currentIndex) =>
                            currentIndex === index ? { ...entry, equals: event.target.value } : entry
                          )
                        )
                      }
                      style={inputStyle}
                      placeholder="win / eliminated / attack"
                    />
                  </Field>
                </div>

                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <Field label={compact ? '만족시 출력할 변수' : '기록 변수'}>
                    <input
                      name={`state-write-key-${index}`}
                      type="text"
                      value={rule.key || ''}
                      onChange={event =>
                        updateStateWrites(current =>
                          current.map((entry, currentIndex) =>
                            currentIndex === index ? { ...entry, key: event.target.value } : entry
                          )
                        )
                      }
                      style={inputStyle}
                      placeholder="state.enemyDown"
                    />
                    <PresetRow
                      items={VARIABLE_KEY_PRESETS}
                      activeValues={[rule.key || '']}
                      onToggle={value =>
                        updateStateWrites(current =>
                          current.map((entry, currentIndex) =>
                            currentIndex === index ? { ...entry, key: value } : entry
                          )
                        )
                      }
                    />
                  </Field>

                  <Field label={compact ? '출력 값' : '기록 값'}>
                    <input
                      name={`state-write-value-${index}`}
                      type="text"
                      value={rule.value || ''}
                      onChange={event =>
                        updateStateWrites(current =>
                          current.map((entry, currentIndex) =>
                            currentIndex === index ? { ...entry, value: event.target.value } : entry
                          )
                        )
                      }
                      style={inputStyle}
                      placeholder="true / 1 / red"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              borderRadius: 14,
              border: '1px dashed #cbd5e1',
              background: '#f8fafc',
              padding: 12,
              fontSize: 12,
              color: '#64748b',
              lineHeight: 1.6,
            }}
          >
            결과를 변수로 남겨 분기에 재사용할 수 있습니다. 예: 팀 1이 승리하면
            <code style={{ marginLeft: 4 }}>result.winnerTeam = 1</code>
          </div>
        )}
        </div>
      </Section>

      <Section
        title="실행 본문"
        description="AI에게 직접 보낼 문장이나 플레이어 입력을 유도할 본문을 작성합니다."
      >
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
      </Section>
    </section>
  );
}

function formatStateWriteSourceLabel(sourceType) {
  if (sourceType === 'input') return '입력값';
  if (sourceType === 'gameResult') return '게임 결과';
  if (sourceType === 'teamOutcome') return '팀 결과';
  if (sourceType === 'participantOutcome') return '참가자 결과';
  return '항상 기록';
}

function getActorMode(actorScope = '') {
  const value = String(actorScope || '').trim();
  if (!value || value === 'self' || value === 'enemies' || value === 'allies' || value === 'all') {
    return value || 'self';
  }
  if (value.startsWith('role:')) return 'role:';
  return 'custom';
}

function Section({ title, description, children }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        padding: 14,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 14, color: '#0f172a' }}>{title}</strong>
        {description ? (
          <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
            {description}
          </span>
        ) : null}
      </div>
      {children}
    </div>
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

function PresetRow({ items, activeValues, onToggle }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map(item => {
        const active = Array.isArray(activeValues) ? activeValues.includes(item.value) : false;
        return (
          <button
            key={`${item.value}:${item.label}`}
            type="button"
            onClick={() => onToggle(item.value)}
            style={chipButtonStyle(active ? '#dbeafe' : '#e2e8f0', active ? '#1d4ed8' : '#334155')}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function buildRouteLabel(data) {
  if (data?.fallback) return 'fallback';
  const first = Array.isArray(data?.conditions) ? data.conditions[0] : null;
  if (!first?.key) return '다음';
  const op = first?.op || 'equals';
  if (op === 'exists') return `${first.key} 있음`;
  if (op === 'not_exists') return `${first.key} 없음`;
  if (op === 'not_equals') return `${first.key} != ${first.equals ?? ''}`.trim();
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
