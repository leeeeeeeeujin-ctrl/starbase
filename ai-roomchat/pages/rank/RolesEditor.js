// components/rank/RolesEditor.js
import { useState, useEffect } from 'react';

export default function RolesEditor({ roles = [], onChange }) {
  const [list, setList] = useState(roles);

  useEffect(() => {
    setList(roles);
  }, [roles]);
  useEffect(() => {
    onChange?.(list);
  }, [list, onChange]);

  function add() {
    setList(arr => [...arr, `역할${arr.length + 1}`]);
  }
  function update(i, val) {
    setList(arr => arr.map((r, idx) => (idx === i ? val : r)));
  }
  function remove(i) {
    setList(arr => arr.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {list.length === 0 && (
        <div style={{ color: '#64748b' }}>역할이 없습니다. 아래 버튼으로 추가하세요.</div>
      )}
      {list.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8 }}>
          <input value={r} onChange={e => update(i, e.target.value)} style={{ flex: 1 }} />
          <button onClick={() => remove(i)} style={{ padding: '6px 10px' }}>
            삭제
          </button>
        </div>
      ))}
      <button
        onClick={add}
        style={{ padding: '6px 10px', borderRadius: 8, background: '#2563eb', color: '#fff' }}
      >
        + 역할 추가
      </button>
    </div>
  );
}
