import React, { useMemo, useState } from 'react';

export default function TokenPalette({ onInsert }) {
  const [slot, setSlot] = useState('1');
  const [prop, setProp] = useState('name');
  const [ability, setAbility] = useState('1');

  const token = useMemo(() => {
    if (prop === 'ability') {
      return `{{slot${slot}.ability${ability}}}`;
    }
    return `{{slot${slot}.${prop}}}`;
  }, [slot, prop, ability]);

  return (
    <div
      style={{
        display: 'grid',
        gap: 8,
        borderTop: '1px solid #e5e7eb',
        marginTop: 12,
        paddingTop: 12,
      }}
    >
      <div style={{ fontWeight: 700 }}>토큰 팔레트</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select value={slot} onChange={event => setSlot(event.target.value)}>
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              슬롯
              {index + 1}
            </option>
          ))}
        </select>
        <select value={prop} onChange={event => setProp(event.target.value)}>
          <option value="name">이름</option>
          <option value="description">설명</option>
          <option value="ability">능력</option>
        </select>
        {prop === 'ability' && (
          <select value={ability} onChange={event => setAbility(event.target.value)}>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                능력
                {index + 1}
              </option>
            ))}
          </select>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onInsert(token)}>
          선택 토큰 삽입
        </button>
        <button type="button" onClick={() => onInsert('{{slot.random}}')}>
          랜덤 슬롯번호
        </button>
        <button type="button" onClick={() => onInsert('{{random.slot.name}}')}>
          랜덤 슬롯 이름
        </button>
        <button type="button" onClick={() => onInsert('{{random.choice:A|B|C}}')}>
          임의 선택
        </button>
        <button type="button" onClick={() => onInsert('{{history.last1}}')}>
          마지막 줄
        </button>
        <button type="button" onClick={() => onInsert('{{history.last2}}')}>
          마지막 2줄
        </button>
        <button type="button" onClick={() => onInsert('{{history.last5}}')}>
          마지막 5줄
        </button>
      </div>
    </div>
  );
}
