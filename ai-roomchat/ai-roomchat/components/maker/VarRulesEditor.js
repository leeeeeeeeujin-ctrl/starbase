// components/maker/VarRulesEditor.js
import { useState } from 'react';

export default function VarRulesEditor({ value = [], onChange, title = '변수 규칙' }) {
  const [list, setList] = useState(() => (Array.isArray(value) ? value : []));

  function add() {
    const next = [...list, { name: '', condition: '' }];
    setList(next);
    onChange?.(next);
  }
  function update(i, patch) {
    const next = list.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setList(next);
    onChange?.(next);
  }
  function remove(i) {
    const next = list.filter((_, idx) => idx !== i);
    setList(next);
    onChange?.(next);
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      {list.length === 0 && <div style={{ color: '#64748b' }}>아직 규칙이 없습니다.</div>}
      {list.map((r, i) => (
        <div
          key={i}
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 8,
            display: 'grid',
            gap: 6,
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 12 }}>변수명(두번째 줄에 기록될 토큰명)</label>
            <input
              value={r.name}
              onChange={e => update(i, { name: e.target.value })}
              placeholder="예: critical_hit"
            />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 12 }}>만족 조건(사람이 읽는 설명 또는 간단 규칙식)</label>
            <input
              value={r.condition}
              onChange={e => update(i, { condition: e.target.value })}
              placeholder="예: 이전 응답 마지막 2줄에 '치명타' 포함"
            />
          </div>
          <button onClick={() => remove(i)} style={{ alignSelf: 'start', padding: '6px 10px' }}>
            삭제
          </button>
        </div>
      ))}
      <button
        onClick={add}
        style={{ padding: '6px 10px', borderRadius: 8, background: '#2563eb', color: '#fff' }}
      >
        + 규칙 추가
      </button>
    </div>
  );
}
