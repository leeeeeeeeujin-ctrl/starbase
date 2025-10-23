'use client';

const inputStyle = {
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.55)',
  color: '#f8fafc',
};

export default function HeroAbilityFields({
  ability1,
  ability2,
  ability3,
  ability4,
  onChangeAbility1,
  onChangeAbility2,
  onChangeAbility3,
  onChangeAbility4,
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      }}
    >
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>능력 1</span>
        <input
          value={ability1}
          onChange={event => onChangeAbility1(event.target.value)}
          placeholder="첫 번째 능력을 입력하세요"
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>능력 2</span>
        <input
          value={ability2}
          onChange={event => onChangeAbility2(event.target.value)}
          placeholder="두 번째 능력"
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>능력 3</span>
        <input
          value={ability3}
          onChange={event => onChangeAbility3(event.target.value)}
          placeholder="세 번째 능력"
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>능력 4</span>
        <input
          value={ability4}
          onChange={event => onChangeAbility4(event.target.value)}
          placeholder="네 번째 능력"
          style={inputStyle}
        />
      </label>
    </div>
  );
}

//
