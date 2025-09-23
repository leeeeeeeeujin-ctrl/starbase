// starbase/ai-roomchat/components/maker/ConditionBuilder.js
import React, { useMemo, useState } from 'react'

const CONDITION_DEFS = [
  {
    type: 'random',
    label: '확률로 진행',
    params: [{ key: 'p', label: '확률(0~1)', type: 'number', step: '0.05', min: '0', max: '1', defaultValue: '0.3' }],
    toJSON: (values) => ({ type: 'random', p: Number(values.p ?? 0.3) }),
  },
  {
    type: 'turn_gte',
    label: '특정 턴 이상',
    params: [{ key: 'value', label: '턴 ≥', type: 'number', defaultValue: '3' }],
    toJSON: (values) => ({ type: 'turn_gte', value: Number(values.value ?? 1) }),
  },
  {
    type: 'turn_lte',
    label: '특정 턴 이하',
    params: [{ key: 'value', label: '턴 ≤', type: 'number', defaultValue: '5' }],
    toJSON: (values) => ({ type: 'turn_lte', value: Number(values.value ?? 1) }),
  },
  {
    type: 'prev_ai_contains',
    label: '이전 AI 응답에 단어 포함',
    params: [
      { key: 'value', label: '단어', type: 'text', placeholder: '예) 승리' },
      {
        key: 'scope',
        label: '대상 구간',
        type: 'select',
        options: [
          { value: 'last1', label: '마지막 1줄' },
          { value: 'last2', label: '마지막 2줄' },
          { value: 'last5', label: '마지막 5줄' },
          { value: 'all', label: '전체' },
        ],
        defaultValue: 'last2',
      },
    ],
    toJSON: (values) => ({
      type: 'prev_ai_contains',
      value: String(values.value || ''),
      scope: values.scope || 'last2',
    }),
  },
  {
    type: 'prev_prompt_contains',
    label: '이전 프롬프트에 문구 포함',
    params: [
      { key: 'value', label: '문구', type: 'text', placeholder: '예) 탈출' },
      {
        key: 'scope',
        label: '대상 구간',
        type: 'select',
        options: [
          { value: 'last1', label: '마지막 1줄' },
          { value: 'last2', label: '마지막 2줄' },
          { value: 'all', label: '전체' },
        ],
        defaultValue: 'last1',
      },
    ],
    toJSON: (values) => ({
      type: 'prev_prompt_contains',
      value: String(values.value || ''),
      scope: values.scope || 'last1',
    }),
  },
  {
    type: 'prev_ai_regex',
    label: '이전 AI 응답 정규식',
    params: [
      { key: 'pattern', label: '패턴', type: 'text', placeholder: '예) ^패배\\b' },
      { key: 'flags', label: '플래그', type: 'text', placeholder: '예) i' },
      {
        key: 'scope',
        label: '대상 구간',
        type: 'select',
        options: [
          { value: 'last1', label: '마지막 1줄' },
          { value: 'last2', label: '마지막 2줄' },
          { value: 'all', label: '전체' },
        ],
        defaultValue: 'last1',
      },
    ],
    toJSON: (values) => ({
      type: 'prev_ai_regex',
      pattern: String(values.pattern || ''),
      flags: String(values.flags || ''),
      scope: values.scope || 'last1',
    }),
  },
  {
    type: 'visited_slot',
    label: '특정 프롬프트(슬롯) 경유',
    params: [{ key: 'slot_id', label: '슬롯 ID', type: 'text', placeholder: '예) 12' }],
    toJSON: (values) => ({ type: 'visited_slot', slot_id: values.slot_id ? String(values.slot_id) : null }),
  },
  {
    type: 'var_on',
    label: '변수 ON(전역/로컬)',
    params: [
      { key: 'names', label: '변수명들(콤마)', type: 'text', placeholder: 'power_up, haste' },
      {
        key: 'scope',
        label: '범위',
        type: 'select',
        options: [
          { value: 'global', label: '전역' },
          { value: 'local', label: '로컬' },
          { value: 'both', label: '둘다' },
        ],
        defaultValue: 'both',
      },
      {
        key: 'mode',
        label: '조건',
        type: 'select',
        options: [
          { value: 'all', label: '모두 켜져있음' },
          { value: 'any', label: '하나라도 켜짐' },
        ],
        defaultValue: 'any',
      },
    ],
    toJSON: (values) => ({
      type: 'var_on',
      names: String(values.names || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
      scope: values.scope || 'both',
      mode: values.mode || 'any',
    }),
  },
  {
    type: 'count',
    label: '역할/상태 카운트 비교',
    params: [
      {
        key: 'who',
        label: '대상',
        type: 'select',
        options: [
          { value: 'all', label: '전체' },
          { value: 'same', label: '내 역할과 동일' },
          { value: 'other', label: '내 역할과 다름' },
          { value: 'specific', label: '특정 역할명' },
        ],
        defaultValue: 'all',
      },
      { key: 'role', label: '역할명(특정 선택 시)', type: 'text', placeholder: '수비' },
      {
        key: 'status',
        label: '상태',
        type: 'select',
        options: [
          { value: 'alive', label: '생존' },
          { value: 'dead', label: '탈락' },
          { value: 'won', label: '승리' },
          { value: 'lost', label: '패배' },
        ],
        defaultValue: 'alive',
      },
      {
        key: 'cmp',
        label: '비교',
        type: 'select',
        options: [
          { value: 'gte', label: '≥' },
          { value: 'lte', label: '≤' },
          { value: 'eq', label: '=' },
        ],
        defaultValue: 'gte',
      },
      { key: 'value', label: '값', type: 'number', defaultValue: '2' },
    ],
    toJSON: (values) => ({
      type: 'count',
      who: values.who || 'all',
      role: (values.role || '').trim(),
      status: values.status || 'alive',
      cmp: values.cmp || 'gte',
      value: Number(values.value || 0),
    }),
  },
  {
    type: 'fallback',
    label: '모두 불일치 시 이 경로',
    params: [],
    toJSON: () => ({ type: 'fallback' }),
  },
]

function buildEdgeLabel(data) {
  const parts = []
  const conds = data?.conditions || []

  conds.forEach((condition) => {
    if (condition?.type === 'turn_gte') parts.push(`턴 ≥ ${condition.value}`)
    if (condition?.type === 'turn_lte') parts.push(`턴 ≤ ${condition.value}`)
    if (condition?.type === 'prev_ai_contains') parts.push(`이전응답 "${condition.value}"`)
    if (condition?.type === 'prev_prompt_contains') parts.push(`이전프롬프트 "${condition.value}"`)
    if (condition?.type === 'prev_ai_regex') parts.push(`이전응답 /${condition.pattern}/${condition.flags || ''}`)
    if (condition?.type === 'visited_slot') parts.push(`경유 #${condition.slot_id ?? '?'}`)
    if (condition?.type === 'var_on') parts.push(`var_on(${condition.scope || 'both'}:${(condition.names || []).join('|')})`)
    if (condition?.type === 'count') parts.push(`count ${condition.cmp} ${condition.value}`)
    if (condition?.type === 'fallback') parts.push('Fallback')
  })

  const probability = data?.probability
  if (probability != null && probability !== 1) {
    parts.push(`확률 ${Math.round(Number(probability) * 100)}%`)
  }

  return parts.join(' | ')
}

export default function ConditionBuilder({ selectedEdge, setEdges, pushToForm }) {
  const [typeIdx, setTypeIdx] = useState(0)
  const [values, setValues] = useState({})

  const definition = useMemo(() => CONDITION_DEFS[typeIdx] ?? CONDITION_DEFS[0], [typeIdx])

  function addCondition() {
    if (!selectedEdge) return
    const json = definition.toJSON(values)

    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id !== selectedEdge.id) return edge
        const previous = edge.data?.conditions || []
        const conditions = [...previous, json]
        const data = { ...(edge.data || {}), conditions }
        return { ...edge, data, label: buildEdgeLabel(data) }
      }),
    )

    if (pushToForm) pushToForm(json)
    setValues({})
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 700 }}>조건 만들기</div>

      <select
        value={String(typeIdx)}
        onChange={(event) => {
          setTypeIdx(Number(event.target.value))
          setValues({})
        }}
      >
        {CONDITION_DEFS.map((def, index) => (
          <option key={def.type} value={index}>
            {def.label}
          </option>
        ))}
      </select>

      <div style={{ display: 'grid', gap: 6 }}>
        {definition.params.map((param) => {
          if (param.type === 'select') {
            return (
              <label key={param.key} style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#555' }}>{param.label}</span>
                <select
                  value={values[param.key] ?? param.defaultValue ?? ''}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [param.key]: event.target.value }))
                  }
                >
                  {(param.options || []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          }

          return (
            <label key={param.key} style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#555' }}>{param.label}</span>
              <input
                type={param.type}
                step={param.step}
                min={param.min}
                max={param.max}
                placeholder={param.placeholder}
                value={values[param.key] ?? param.defaultValue ?? ''}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [param.key]: event.target.value }))
                }
              />
            </label>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addCondition}
        style={{ padding: '8px 12px', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700 }}
      >
        조건 추가
      </button>
    </div>
  )
}
