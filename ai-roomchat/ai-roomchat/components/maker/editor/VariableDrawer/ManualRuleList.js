import SuggestionChips from './SuggestionChips';

function ManualRuleList({
  rules,
  datalistId,
  onAdd,
  onUpdate,
  onRemove,
  suggestions,
  appendToken,
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rules.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b' }}>
          AI에게 지정된 변수명을 그대로 적도록 안내하려면 아래에 직접 규칙을 작성하세요.
        </div>
      )}
      {rules.map((rule, index) => (
        <div
          key={rule.id || index}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 12,
            background: '#fff',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>변수명</label>
            <input
              value={rule.variable || ''}
              onChange={event => onUpdate(index, { variable: event.target.value })}
              placeholder="예: combo_strike"
              list={datalistId}
            />
            <SuggestionChips
              suggestions={suggestions}
              onSelect={token => onUpdate(index, { variable: token })}
              prefix={`manual-variable-${index}`}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>조건 설명</label>
            <textarea
              rows={3}
              value={rule.condition || ''}
              onChange={event => onUpdate(index, { condition: event.target.value })}
              placeholder="예: 이번 턴에 적의 약점을 언급하면"
            />
            <SuggestionChips
              suggestions={suggestions}
              onSelect={token =>
                onUpdate(index, { condition: appendToken(rule.condition || '', token) })
              }
              prefix={`manual-condition-${index}`}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>AI 안내 문구</label>
            <textarea
              rows={3}
              value={rule.instruction || ''}
              onChange={event => onUpdate(index, { instruction: event.target.value })}
              placeholder="예: combo_strike를 두 번째 줄에 기록하라"
            />
            <SuggestionChips
              suggestions={suggestions}
              onSelect={token =>
                onUpdate(index, { instruction: appendToken(rule.instruction || '', token) })
              }
              prefix={`manual-instruction-${index}`}
            />
          </div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            style={{
              alignSelf: 'start',
              padding: '6px 10px',
              borderRadius: 8,
              background: '#fee2e2',
              color: '#b91c1c',
            }}
          >
            규칙 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: '#2563eb',
          color: '#fff',
          fontWeight: 600,
        }}
      >
        + 수동 변수 추가
      </button>
    </div>
  );
}

export default ManualRuleList;

//
