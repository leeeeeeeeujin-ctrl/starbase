'use client'

export default function HeroInfoFields({ name, description, onChangeName, onChangeDescription }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>이름</span>
        <input
          value={name}
          onChange={(event) => onChangeName(event.target.value)}
          placeholder="캐릭터 이름을 입력하세요"
          style={{
            padding: '12px 14px',
            borderRadius: 16,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.55)',
            color: '#f8fafc',
          }}
        />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>설명</span>
        <textarea
          value={description}
          onChange={(event) => onChangeDescription(event.target.value)}
          placeholder="캐릭터의 배경이나 특징을 적어 주세요"
          rows={4}
          style={{
            padding: '14px',
            borderRadius: 20,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.55)',
            color: '#e2e8f0',
            resize: 'vertical',
          }}
        />
      </label>
    </div>
  )
}

//
