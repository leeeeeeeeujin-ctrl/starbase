import { VARIABLE_RULE_COMPARATORS, VARIABLE_RULE_OUTCOMES, VARIABLE_RULE_STATUS, VARIABLE_RULE_SUBJECTS } from '../../../../lib/variableRules'
import { OUTCOME_LABEL, STATUS_LABEL, SUBJECT_LABEL } from './constants'
import SuggestionChips from './SuggestionChips'

function AutoRuleList({ rules, datalistId, onAdd, onUpdate, onRemove, suggestions }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rules.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b' }}>
          역할/상태 조건을 기반으로 자동으로 변수명을 기록할 규칙을 추가하세요.
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
            <label style={{ fontSize: 12, color: '#475569' }}>변수명 (AI가 마지막에서 두 번째 줄에 적어줄 이름)</label>
            <input
              value={rule.variable || ''}
              onChange={(event) => onUpdate(index, { variable: event.target.value })}
              placeholder="예: guardian_protect"
              list={datalistId}
            />
            <SuggestionChips
              suggestions={suggestions}
              onSelect={(token) => onUpdate(index, { variable: token })}
              prefix={`auto-variable-${index}`}
            />
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>승패 처리</span>
              <select
                value={rule.outcome || 'win'}
                onChange={(event) => onUpdate(index, { outcome: event.target.value })}
              >
                {VARIABLE_RULE_OUTCOMES.map((option) => (
                  <option key={option} value={option}>
                    {OUTCOME_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>대상</span>
              <select
                value={rule.subject || 'same'}
                onChange={(event) => onUpdate(index, { subject: event.target.value })}
              >
                {VARIABLE_RULE_SUBJECTS.map((option) => (
                  <option key={option} value={option}>
                    {SUBJECT_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>비교</span>
              <select
                value={rule.comparator || 'gte'}
                onChange={(event) => onUpdate(index, { comparator: event.target.value })}
              >
                {VARIABLE_RULE_COMPARATORS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'gte' ? '이상' : option === 'lte' ? '이하' : '정확히'}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>인원 수</span>
              <input
                type="number"
                min="0"
                value={Number.isFinite(Number(rule.count)) ? rule.count : ''}
                onChange={(event) => onUpdate(index, { count: Number(event.target.value) })}
              />
            </label>
          </div>
          {rule.subject === 'specific' && (
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#475569' }}>역할 이름</label>
              <input
                value={rule.role || ''}
                onChange={(event) => onUpdate(index, { role: event.target.value })}
                placeholder="예: 힐러"
              />
            </div>
          )}
          <div style={{ display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>조건</label>
            <select
              value={rule.status || 'alive'}
              onChange={(event) => onUpdate(index, { status: event.target.value })}
            >
              {VARIABLE_RULE_STATUS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABEL[option]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            style={{ alignSelf: 'start', padding: '6px 10px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' }}
          >
            규칙 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600 }}
      >
        + 자동 변수 추가
      </button>
    </div>
  )
}

export default AutoRuleList

//
