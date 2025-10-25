import SuggestionChips from './SuggestionChips';

function ActiveRuleList({ rules, onAdd, onUpdate, onRemove, suggestions, appendToken }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rules.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b' }}>
          적극 변수는 AI에게 특정 지시를 직접 전달할 때 사용합니다. 조건을 만족하면 실행할 지시문을
          작성하세요.
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
            <label style={{ fontSize: 12, color: '#475569' }}>조건 (자연어 또는 규칙 설명)</label>
            <textarea
              rows={3}
              value={rule.condition || ''}
              onChange={event => onUpdate(index, { condition: event.target.value })}
              placeholder="예: 이번 턴에 방어 성공이라는 단어가 포함되면"
            />
            <SuggestionChips
              suggestions={suggestions}
              onSelect={token =>
                onUpdate(index, { condition: appendToken(rule.condition || '', token) })
              }
              prefix={`active-condition-${index}`}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>AI에게 전달할 지시</label>
            <textarea
              rows={3}
              value={rule.directive || ''}
              onChange={event => onUpdate(index, { directive: event.target.value })}
              placeholder="예: 다음 턴에는 적의 약점을 분석하라"
            />
            <SuggestionChips
              suggestions={suggestions}
              onSelect={token =>
                onUpdate(index, { directive: appendToken(rule.directive || '', token) })
              }
              prefix={`active-directive-${index}`}
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
            지시 삭제
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
        + 적극 변수 추가
      </button>
    </div>
  );
}

export default ActiveRuleList;

//
