'use client';

const fieldStyle = {
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.55)',
  color: '#f8fafc',
};

const statLabels = [
  ['hp', 'HP'],
  ['attack', '공격'],
  ['defense', '방어'],
  ['spAttack', '특수공격'],
  ['spDefense', '특수방어'],
  ['speed', '속도'],
];

function updateDraft(value, patch) {
  return {
    ...value,
    ...patch,
  };
}

export default function HeroPokerogueProfileFields({ value, onChange }) {
  const draft = value || {};

  const patch = nextPatch => {
    onChange?.(updateDraft(draft, nextPatch));
  };

  const patchStat = (key, nextValue) => {
    patch({
      baseStats: {
        ...(draft.baseStats || {}),
        [key]: nextValue,
      },
    });
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        padding: '18px 16px',
        borderRadius: 24,
        background: 'rgba(15, 23, 42, 0.46)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 16 }}>포켓로그 스펙</strong>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
          수동으로 타입, 종족값, 특성, 기술풀을 입력합니다. 나중에 export가 이 값을 그대로
          사용합니다.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>주 타입</span>
          <input
            value={draft.primaryType || ''}
            onChange={event => patch({ primaryType: event.target.value })}
            placeholder="예: fire"
            style={fieldStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>부 타입</span>
          <input
            value={draft.secondaryType || ''}
            onChange={event => patch({ secondaryType: event.target.value })}
            placeholder="없으면 비움"
            style={fieldStyle}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>성장 타입</span>
          <input
            value={draft.growthType || ''}
            onChange={event => patch({ growthType: event.target.value })}
            placeholder="balanced / fast / late-bloom"
            style={fieldStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>스타터 코스트</span>
          <input
            type="number"
            min="1"
            max="10"
            value={draft.starterCost ?? 3}
            onChange={event => patch({ starterCost: event.target.value })}
            style={fieldStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>출현 가중치</span>
          <input
            type="number"
            min="1"
            max="999"
            value={draft.spawnWeight ?? 1}
            onChange={event => patch({ spawnWeight: event.target.value })}
            style={fieldStyle}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>기본 특성</span>
          <input
            value={draft.ability || ''}
            onChange={event => patch({ ability: event.target.value })}
            placeholder="예: blaze"
            style={fieldStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>보조 특성</span>
          <input
            value={draft.secondaryAbility || ''}
            onChange={event => patch({ secondaryAbility: event.target.value })}
            placeholder="선택 입력"
            style={fieldStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>히든 특성</span>
          <input
            value={draft.hiddenAbility || ''}
            onChange={event => patch({ hiddenAbility: event.target.value })}
            placeholder="선택 입력"
            style={fieldStyle}
          />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>패시브</span>
        <input
          value={draft.passive || ''}
          onChange={event => patch({ passive: event.target.value })}
          placeholder="예: speed-boost"
          style={fieldStyle}
        />
      </label>

      <div style={{ display: 'grid', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>종족값</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
          {statLabels.map(([key, label]) => (
            <label key={key} style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#cbd5e1' }}>{label}</span>
              <input
                type="number"
                min="1"
                max="255"
                value={draft.baseStats?.[key] ?? ''}
                onChange={event => patchStat(key, event.target.value)}
                style={fieldStyle}
              />
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>고유기술</span>
          <textarea
            value={draft.signatureMovesText || ''}
            onChange={event => patch({ signatureMovesText: event.target.value })}
            placeholder={'한 줄에 하나씩\n예: Star Break\nNova Guard'}
            rows={5}
            style={{ ...fieldStyle, resize: 'vertical', minHeight: 120 }}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>일반 기술풀</span>
          <textarea
            value={draft.movePoolText || ''}
            onChange={event => patch({ movePoolText: event.target.value })}
            placeholder={'한 줄에 하나씩\n예: tackle\nprotect\nquick-attack'}
            rows={5}
            style={{ ...fieldStyle, resize: 'vertical', minHeight: 120 }}
          />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>도감/설명</span>
        <textarea
          value={draft.biography || ''}
          onChange={event => patch({ biography: event.target.value })}
          placeholder="포켓로그 모드에서 쓸 짧은 설명"
          rows={4}
          style={{ ...fieldStyle, resize: 'vertical', minHeight: 100 }}
        />
      </label>
    </div>
  );
}

