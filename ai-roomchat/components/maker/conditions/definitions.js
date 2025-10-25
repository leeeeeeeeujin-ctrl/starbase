export const CONDITION_DEFINITIONS = [
  {
    type: 'random',
    label: '확률로 진행',
    params: [
      {
        key: 'p',
        label: '확률(0~1)',
        type: 'number',
        step: '0.05',
        min: '0',
        max: '1',
        defaultValue: '0.3',
      },
    ],
    toJSON: values => ({ type: 'random', p: Number(values.p ?? 0.3) }),
  },
  {
    type: 'turn_gte',
    label: '특정 턴 이상',
    params: [{ key: 'value', label: '턴 ≥', type: 'number', defaultValue: '3' }],
    toJSON: values => ({ type: 'turn_gte', value: Number(values.value ?? 1) }),
  },
  {
    type: 'turn_lte',
    label: '특정 턴 이하',
    params: [{ key: 'value', label: '턴 ≤', type: 'number', defaultValue: '5' }],
    toJSON: values => ({ type: 'turn_lte', value: Number(values.value ?? 1) }),
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
    toJSON: values => ({
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
    toJSON: values => ({
      type: 'prev_prompt_contains',
      value: String(values.value || ''),
      scope: values.scope || 'last1',
    }),
  },
  {
    type: 'prev_ai_regex',
    label: '이전 AI 응답 정규식',
    params: [
      { key: 'pattern', label: '패턴', type: 'text', placeholder: '예) ^패배\\\b' },
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
    toJSON: values => ({
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
    toJSON: values => ({
      type: 'visited_slot',
      slot_id: values.slot_id ? String(values.slot_id) : null,
    }),
  },
  {
    type: 'var_on',
    label: '변수 ON(전역/로컬)',
    params: [
      {
        key: 'names',
        label: '변수명들(콤마)',
        type: 'text',
        placeholder: 'power_up, haste',
      },
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
    toJSON: values => ({
      type: 'var_on',
      names: String(values.names || '')
        .split(',')
        .map(name => name.trim())
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
    toJSON: values => ({
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
];

export function findDefinitionByType(type) {
  return CONDITION_DEFINITIONS.find(definition => definition.type === type);
}
