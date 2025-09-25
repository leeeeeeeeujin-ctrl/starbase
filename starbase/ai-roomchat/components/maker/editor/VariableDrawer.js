import { useMemo } from 'react'

import {
  createActiveRule,
  createAutoRule,
  createManualRule,
  makeEmptyVariableRules,
  VARIABLE_RULE_COMPARATORS,
  VARIABLE_RULE_MODES,
  VARIABLE_RULE_OUTCOMES,
  VARIABLE_RULE_STATUS,
  VARIABLE_RULE_SUBJECTS,
} from '../../../lib/variableRules'

function VariableDrawer({
  open,
  onClose,
  selectedNode,
  globalRules,
  localRules,
  commitGlobalRules,
  commitLocalRules,
  availableNames,
  slotSuggestions,
  characterSuggestions,
  visibility,
  onVisibilityChange,
  onToggleInvisible,
}) {
  if (!open) {
    return null
  }

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.()
    }
  }

  const ready = !!(selectedNode && globalRules && localRules)

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          boxShadow: '-24px 0 60px -30px rgba(15, 23, 42, 0.4)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'grid' }}>
            <strong style={{ color: '#0f172a' }}>변수 규칙 설정</strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>전역/로컬 규칙을 한 번에 관리하세요.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: '#f1f5f9',
              border: '1px solid #cbd5f5',
              color: '#0f172a',
              fontWeight: 600,
            }}
          >
            닫기
          </button>
        </div>
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: 16,
            display: 'grid',
            gap: 16,
          }}
        >
          {ready ? (
            <>
              <div style={{ display: 'grid', gap: 12 }}>
                <VisibilityEditor
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  onToggleInvisible={onToggleInvisible}
                  slotSuggestions={slotSuggestions}
                />
                <VariableScopeEditor
                  scopeKey={`${scopeKeyPrefix(selectedNode?.id)}-global`}
                  label="전역 변수 규칙"
                  rules={globalRules}
                  onCommit={commitGlobalRules}
                  availableNames={availableNames}
                  slotSuggestions={slotSuggestions}
                  characterSuggestions={characterSuggestions}
                />
                <VariableScopeEditor
                  scopeKey={`${scopeKeyPrefix(selectedNode?.id)}-local`}
                  label="로컬 변수 규칙"
                  rules={localRules}
                  onCommit={commitLocalRules}
                  availableNames={availableNames}
                  slotSuggestions={slotSuggestions}
                  characterSuggestions={characterSuggestions}
                />
              </div>
            </>
          ) : (
            <div
              style={{
                padding: '24px 16px',
                borderRadius: 12,
                border: '1px dashed #cbd5f5',
                background: '#f8fafc',
                color: '#475569',
                lineHeight: 1.5,
              }}
            >
              편집할 프롬프트를 먼저 선택하면 전역/로컬 변수 규칙을 설정할 수 있습니다.
            </div>
          )}
          <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
            AI 응답 가이드: 마지막 줄에는 승·패·탈락 결과를, 마지막에서 두 번째 줄에는 조건을 만족한 변수명만 기재하고,
            필요하다면 그 위 줄들은 공란으로 비워 두세요.
          </p>
        </div>
      </div>
    </div>
  )
}

function scopeKeyPrefix(nodeId) {
  if (!nodeId) return 'node'
  return String(nodeId)
}

function VisibilityEditor({ visibility, onChange, onToggleInvisible, slotSuggestions = [] }) {
  const resolved = visibility || { invisible: false, visible_slots: [] }
  const isInvisible = !!resolved.invisible
  const visibleSet = useMemo(() => {
    const values = Array.isArray(resolved.visible_slots) ? resolved.visible_slots : []
    const set = new Set()
    values.forEach((value) => {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) {
        set.add(numeric)
      }
    })
    return set
  }, [resolved.visible_slots])

  const slotLabelMap = useMemo(() => {
    const map = new Map()
    slotSuggestions.forEach((item) => {
      if (!item?.token) return
      const match = /^slot(\d+)$/i.exec(String(item.token))
      if (!match) return
      const numeric = Number(match[1])
      if (!Number.isFinite(numeric)) return
      map.set(numeric, item.label || `슬롯 ${numeric}`)
    })
    return map
  }, [slotSuggestions])

  const availableSlots = useMemo(() => {
    const set = new Set()
    slotLabelMap.forEach((_, key) => set.add(key))
    for (let i = 1; i <= 12; i += 1) {
      set.add(i)
    }
    return Array.from(set)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
  }, [slotLabelMap])

  const toggleSlot = (slotNo) => {
    if (typeof onChange !== 'function') return
    onChange((current) => {
      const baseList = Array.isArray(current?.visible_slots) ? current.visible_slots : []
      const nextSet = new Set(
        baseList
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value)),
      )
      if (nextSet.has(slotNo)) {
        nextSet.delete(slotNo)
      } else {
        nextSet.add(slotNo)
      }
      return {
        invisible: current?.invisible ?? true,
        visible_slots: Array.from(nextSet).sort((a, b) => a - b),
      }
    })
  }

  const selectAll = () => {
    if (typeof onChange !== 'function') return
    onChange((current) => ({
      invisible: true,
      visible_slots: [...availableSlots],
    }))
  }

  const clearAll = () => {
    if (typeof onChange !== 'function') return
    onChange(() => ({
      invisible: true,
      visible_slots: [],
    }))
  }

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: 16,
        display: 'grid',
        gap: 12,
        background: '#f8fafc',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>가시성 설정</span>
        <button
          type="button"
          onClick={() => onToggleInvisible?.()}
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid #cbd5f5',
            background: isInvisible ? '#1d4ed8' : '#e2e8f0',
            color: isInvisible ? '#fff' : '#1f2937',
            fontWeight: 600,
          }}
        >
          {isInvisible ? '숨김 해제' : '숨김 모드로 전환'}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
        {isInvisible
          ? '선택한 슬롯만 이 노드의 응답을 확인할 수 있습니다. 아래에서 허용할 슬롯을 골라 주세요.'
          : '현재 이 노드는 모든 슬롯에 노출됩니다. 특정 슬롯에게만 보여주고 싶다면 숨김 모드를 활성화하세요.'}
      </p>
      {isInvisible && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={selectAll}
              style={{ padding: '6px 12px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}
            >
              모두 허용
            </button>
            <button
              type="button"
              onClick={clearAll}
              style={{ padding: '6px 12px', borderRadius: 999, background: '#fee2e2', color: '#b91c1c', fontWeight: 600 }}
            >
              모두 차단
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {availableSlots.map((slotNo) => {
              const active = visibleSet.has(slotNo)
              const label = slotLabelMap.get(slotNo) || `슬롯 ${slotNo}`
              return (
                <button
                  key={slotNo}
                  type="button"
                  onClick={() => toggleSlot(slotNo)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 12,
                    border: active ? '1px solid #2563eb' : '1px solid #cbd5f5',
                    background: active ? '#dbeafe' : '#fff',
                    color: active ? '#1d4ed8' : '#1f2937',
                    fontWeight: 600,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function VariableScopeEditor({
  scopeKey,
  label,
  rules,
  onCommit,
  availableNames = [],
  slotSuggestions = [],
  characterSuggestions = [],
}) {
  const safeRules = rules || makeEmptyVariableRules()
  const mode = safeRules.mode || 'auto'

  const datalistId = `${scopeKey}-variable-names`
  const suggestionTokens = useMemo(() => {
    const entries = []
    const seen = new Set()
    slotSuggestions.forEach((item) => {
      if (!item || !item.token) return
      const token = String(item.token)
      if (seen.has(token)) return
      seen.add(token)
      entries.push({ token, label: item.label || token })
    })
    characterSuggestions.forEach((name) => {
      if (typeof name !== 'string') return
      const token = name.trim()
      if (!token || seen.has(token)) return
      seen.add(token)
      entries.push({ token, label: token })
    })
    return entries
  }, [slotSuggestions, characterSuggestions])

  const variableOptions = useMemo(() => {
    const options = new Set()
    availableNames.forEach((name) => {
      if (typeof name === 'string') {
        const trimmed = name.trim()
        if (trimmed) options.add(trimmed)
      }
    })
    suggestionTokens.forEach((item) => options.add(item.token))
    return Array.from(options)
  }, [availableNames, suggestionTokens])

  const appendToken = (value, token) => {
    if (!value) return token
    if (value.includes(token)) return value
    const needsSpace = value.length > 0 && !/\s$/.test(value)
    return `${value}${needsSpace ? ' ' : ''}${token}`
  }

  const renderSuggestionButtons = (onSelect, prefix) => {
    if (!suggestionTokens.length) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {suggestionTokens.map((item) => (
          <button
            key={`${prefix}-${item.token}`}
            type="button"
            onClick={() => onSelect(item.token)}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              background: '#e0f2fe',
              border: '1px solid #38bdf8',
              color: '#0369a1',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    )
  }

  const setMode = (nextMode) => {
    if (nextMode === mode) return
    onCommit((current) => ({ ...current, mode: nextMode }))
  }

  const addAutoRule = () => {
    onCommit((current) => ({ ...current, auto: [...current.auto, createAutoRule()] }))
  }

  const updateAutoRule = (index, patch) => {
    onCommit((current) => ({
      ...current,
      auto: current.auto.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    }))
  }

  const removeAutoRule = (index) => {
    onCommit((current) => ({
      ...current,
      auto: current.auto.filter((_, idx) => idx !== index),
    }))
  }

  const addManualRule = () => {
    onCommit((current) => ({ ...current, manual: [...current.manual, createManualRule()] }))
  }

  const updateManualRule = (index, patch) => {
    onCommit((current) => ({
      ...current,
      manual: current.manual.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    }))
  }

  const removeManualRule = (index) => {
    onCommit((current) => ({
      ...current,
      manual: current.manual.filter((_, idx) => idx !== index),
    }))
  }

  const addActiveRule = () => {
    onCommit((current) => ({ ...current, active: [...current.active, createActiveRule()] }))
  }

  const updateActiveRule = (index, patch) => {
    onCommit((current) => ({
      ...current,
      active: current.active.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    }))
  }

  const removeActiveRule = (index) => {
    onCommit((current) => ({
      ...current,
      active: current.active.filter((_, idx) => idx !== index),
    }))
  }

  const renderModeSelector = () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {VARIABLE_RULE_MODES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          onClick={() => setMode(candidate)}
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            border: mode === candidate ? '1px solid #0ea5e9' : '1px solid #cbd5f5',
            background: mode === candidate ? '#e0f2fe' : '#f8fafc',
            fontWeight: 600,
            color: mode === candidate ? '#0369a1' : '#475569',
          }}
        >
          {candidate === 'auto' ? '자동 승패 변수' : candidate === 'manual' ? '수동 변수' : '적극 변수'}
        </button>
      ))}
    </div>
  )

  const renderAutoMode = () => (
    <div style={{ display: 'grid', gap: 10 }}>
      {safeRules.auto.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b' }}>
          역할/상태 조건을 기반으로 자동으로 변수명을 기록할 규칙을 추가하세요.
        </div>
      )}
      {safeRules.auto.map((rule, index) => (
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
              onChange={(event) => updateAutoRule(index, { variable: event.target.value })}
              placeholder="예: guardian_protect"
              list={datalistId}
            />
            {renderSuggestionButtons(
              (token) => updateAutoRule(index, { variable: token }),
              `auto-variable-${index}`,
            )}
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>승패 처리</span>
              <select
                value={rule.outcome || 'win'}
                onChange={(event) => updateAutoRule(index, { outcome: event.target.value })}
              >
                {VARIABLE_RULE_OUTCOMES.map((option) => (
                  <option key={option} value={option}>
                    {option === 'win' ? '승리 처리' : option === 'lose' ? '패배 처리' : '무승부 처리'}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>대상</span>
              <select
                value={rule.subject || 'same'}
                onChange={(event) => updateAutoRule(index, { subject: event.target.value })}
              >
                {VARIABLE_RULE_SUBJECTS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'same' ? '같은 역할' : option === 'other' ? '상대 역할' : '특정 역할'}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>비교</span>
              <select
                value={rule.comparator || 'gte'}
                onChange={(event) => updateAutoRule(index, { comparator: event.target.value })}
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
                onChange={(event) => updateAutoRule(index, { count: Number(event.target.value) })}
              />
            </label>
          </div>
          {rule.subject === 'specific' && (
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#475569' }}>역할 이름</label>
              <input
                value={rule.role || ''}
                onChange={(event) => updateAutoRule(index, { role: event.target.value })}
                placeholder="예: 힐러"
              />
            </div>
          )}
          <div style={{ display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>조건</label>
            <select
              value={rule.status || 'alive'}
              onChange={(event) => updateAutoRule(index, { status: event.target.value })}
            >
              {VARIABLE_RULE_STATUS.map((option) => (
                <option key={option} value={option}>
                  {option === 'alive' ? '생존자 수' : option === 'dead' ? '탈락자 수' : '변수 값'}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => removeAutoRule(index)}
            style={{ alignSelf: 'start', padding: '6px 10px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' }}
          >
            규칙 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addAutoRule}
        style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600 }}
      >
        + 자동 변수 추가
      </button>
    </div>
  )

  const renderManualMode = () => (
    <div style={{ display: 'grid', gap: 10 }}>
      {safeRules.manual.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b' }}>
          AI에게 지정된 변수명을 그대로 적도록 안내하려면 아래에 직접 규칙을 작성하세요.
        </div>
      )}
      {safeRules.manual.map((rule, index) => (
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
              onChange={(event) => updateManualRule(index, { variable: event.target.value })}
              placeholder="예: combo_strike"
              list={datalistId}
            />
            {renderSuggestionButtons(
              (token) => updateManualRule(index, { variable: token }),
              `manual-variable-${index}`,
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>조건 설명</label>
            <textarea
              rows={3}
              value={rule.condition || ''}
              onChange={(event) => updateManualRule(index, { condition: event.target.value })}
              placeholder="예: 이번 턴에 적의 약점을 언급하면"
            />
            {renderSuggestionButtons(
              (token) => updateManualRule(index, { condition: appendToken(rule.condition || '', token) }),
              `manual-condition-${index}`,
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>AI 안내 문구</label>
            <textarea
              rows={3}
              value={rule.instruction || ''}
              onChange={(event) => updateManualRule(index, { instruction: event.target.value })}
              placeholder="예: combo_strike를 두 번째 줄에 기록하라"
            />
            {renderSuggestionButtons(
              (token) => updateManualRule(index, { instruction: appendToken(rule.instruction || '', token) }),
              `manual-instruction-${index}`,
            )}
          </div>
          <button
            type="button"
            onClick={() => removeManualRule(index)}
            style={{ alignSelf: 'start', padding: '6px 10px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' }}
          >
            규칙 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addManualRule}
        style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600 }}
      >
        + 수동 변수 추가
      </button>
    </div>
  )

  const renderActiveMode = () => (
    <div style={{ display: 'grid', gap: 10 }}>
      {safeRules.active.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b' }}>
          적극 변수는 AI에게 특정 지시를 직접 전달할 때 사용합니다. 조건을 만족하면 실행할 지시문을 작성하세요.
        </div>
      )}
      {safeRules.active.map((rule, index) => (
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
              onChange={(event) => updateActiveRule(index, { condition: event.target.value })}
              placeholder="예: 이번 턴에 방어 성공이라는 단어가 포함되면"
            />
            {renderSuggestionButtons(
              (token) => updateActiveRule(index, { condition: appendToken(rule.condition || '', token) }),
              `active-condition-${index}`,
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>AI에게 전달할 지시</label>
            <textarea
              rows={3}
              value={rule.directive || ''}
              onChange={(event) => updateActiveRule(index, { directive: event.target.value })}
              placeholder="예: 다음 턴에는 적의 약점을 분석하라"
            />
            {renderSuggestionButtons(
              (token) => updateActiveRule(index, { directive: appendToken(rule.directive || '', token) }),
              `active-directive-${index}`,
            )}
          </div>
          <button
            type="button"
            onClick={() => removeActiveRule(index)}
            style={{ alignSelf: 'start', padding: '6px 10px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' }}
          >
            지시 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addActiveRule}
        style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600 }}
      >
        + 적극 변수 추가
      </button>
    </div>
  )

  return (
    <div
      style={{
        border: '1px solid #cbd5f5',
        borderRadius: 16,
        background: '#ffffff',
        padding: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      <datalist id={datalistId}>
        {variableOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{label}</span>
        {renderModeSelector()}
      </div>
      {mode === 'auto' && renderAutoMode()}
      {mode === 'manual' && renderManualMode()}
      {mode === 'active' && renderActiveMode()}
    </div>
  )
}

export default VariableDrawer

//
