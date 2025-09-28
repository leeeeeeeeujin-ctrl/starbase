import React, { useMemo, useState } from 'react'

export default function TokenPalette({ onInsert }) {
  const [slot, setSlot] = useState('1')
  const [prop, setProp] = useState('name')
  const [ability, setAbility] = useState('1')

  const token = useMemo(() => {
    if (prop === 'ability') {
      return `{{slot${slot}.ability${ability}}}`
    }
    return `{{slot${slot}.${prop}}}`
  }, [slot, prop, ability])

  const handleInsert = (value) => {
    onInsert?.(value)
  }

  const buttonStyle = {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.95), rgba(226, 232, 240, 0.9))',
    color: '#0f172a',
    fontWeight: 600,
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 14, color: '#0f172a' }}>토큰 팔레트</strong>
        <span style={{ fontSize: 11, color: '#64748b' }}>클릭해도 입력이 끊기지 않아요.</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select
          value={slot}
          onChange={(event) => setSlot(event.target.value)}
          style={{
            borderRadius: 10,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            padding: '6px 10px',
            background: '#fff',
            color: '#0f172a',
          }}
        >
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              슬롯
              {index + 1}
            </option>
          ))}
        </select>
        <select
          value={prop}
          onChange={(event) => setProp(event.target.value)}
          style={{
            borderRadius: 10,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            padding: '6px 10px',
            background: '#fff',
            color: '#0f172a',
          }}
        >
          <option value="name">이름</option>
          <option value="description">설명</option>
          <option value="ability">능력</option>
        </select>
        {prop === 'ability' && (
          <select
            value={ability}
            onChange={(event) => setAbility(event.target.value)}
            style={{
              borderRadius: 10,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              padding: '6px 10px',
              background: '#fff',
              color: '#0f172a',
            }}
          >
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
        <button
          type="button"
          onClick={() => handleInsert(token)}
          onMouseDown={(event) => event.preventDefault()}
          style={buttonStyle}
        >
          선택 토큰 삽입
        </button>
        <button
          type="button"
          onClick={() => handleInsert('{{slot.random}}')}
          onMouseDown={(event) => event.preventDefault()}
          style={buttonStyle}
        >
          랜덤 슬롯번호
        </button>
        <button
          type="button"
          onClick={() => handleInsert('{{random.slot.name}}')}
          onMouseDown={(event) => event.preventDefault()}
          style={buttonStyle}
        >
          랜덤 슬롯 이름
        </button>
        <button
          type="button"
          onClick={() => handleInsert('{{random.choice:A|B|C}}')}
          onMouseDown={(event) => event.preventDefault()}
          style={buttonStyle}
        >
          임의 선택
        </button>
        <button
          type="button"
          onClick={() => handleInsert('{{history.last1}}')}
          onMouseDown={(event) => event.preventDefault()}
          style={buttonStyle}
        >
          마지막 줄
        </button>
        <button
          type="button"
          onClick={() => handleInsert('{{history.last2}}')}
          onMouseDown={(event) => event.preventDefault()}
          style={buttonStyle}
        >
          마지막 2줄
        </button>
        <button
          type="button"
          onClick={() => handleInsert('{{history.last5}}')}
          onMouseDown={(event) => event.preventDefault()}
          style={buttonStyle}
        >
          마지막 5줄
        </button>
      </div>
    </div>
  )
}
