'use client';

const TIER_OPTIONS = [
  { value: 'common', label: '일반' },
  { value: 'rare', label: '희귀' },
  { value: 'elite', label: '엘리트' },
  { value: 'legendary', label: '전설' },
];

const fieldStyle = {
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.55)',
  color: '#f8fafc',
};

const previewFrameStyle = {
  width: 112,
  aspectRatio: '1 / 1',
  borderRadius: 18,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background:
    'linear-gradient(45deg, rgba(30,41,59,0.95) 25%, rgba(15,23,42,0.95) 25%, rgba(15,23,42,0.95) 50%, rgba(30,41,59,0.95) 50%, rgba(30,41,59,0.95) 75%, rgba(15,23,42,0.95) 75%)',
  backgroundSize: '18px 18px',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function SpriteUpload({ title, preview, onSelect, onReset, hint }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        padding: '14px',
        borderRadius: 20,
        border: '1px solid rgba(148, 163, 184, 0.22)',
        background: 'rgba(15, 23, 42, 0.42)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
        {hint ? <span style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</span> : null}
      </div>
      <div style={previewFrameStyle}>
        {preview ? (
          <img
            src={preview}
            alt={`${title} 미리보기`}
            style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
          />
        ) : (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>없음</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label
          style={{
            padding: '10px 14px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.32)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          업로드
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={event => onSelect?.(event.target.files?.[0] || null)} />
        </label>
        <button
          type="button"
          onClick={onReset}
          style={{
            padding: '10px 14px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.22)',
            background: 'transparent',
            color: '#cbd5e1',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          제거
        </button>
      </div>
    </div>
  );
}

export default function HeroPokerogueFields({
  enabled,
  region,
  tier,
  playable,
  frontPreview,
  backPreview,
  iconPreview,
  onChangeEnabled,
  onChangeRegion,
  onChangeTier,
  onChangePlayable,
  onSelectFront,
  onSelectBack,
  onSelectIcon,
  onResetFront,
  onResetBack,
  onResetIcon,
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        padding: '18px 16px',
        borderRadius: 24,
        background: 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 16 }}>포켓로그 참여</strong>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
            <input type="checkbox" checked={enabled} onChange={event => onChangeEnabled?.(event.target.checked)} />
            참여 캐릭터로 등록
          </label>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
          포켓로그형 모드용 전후면 도트와 출현 메타를 따로 저장합니다.
        </p>
      </div>

      {enabled ? (
        <>
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>출현 지역</span>
              <input
                value={region}
                onChange={event => onChangeRegion?.(event.target.value)}
                placeholder="예: 숲 / 폐성 / 심해 / 화산"
                style={fieldStyle}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>등급</span>
                <select value={tier} onChange={event => onChangeTier?.(event.target.value)} style={fieldStyle}>
                  {TIER_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, paddingTop: 30 }}>
                <input type="checkbox" checked={playable} onChange={event => onChangePlayable?.(event.target.checked)} />
                플레이어 선택 가능
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <SpriteUpload
              title="전면 도트"
              preview={frontPreview}
              hint="전투 상대"
              onSelect={onSelectFront}
              onReset={onResetFront}
            />
            <SpriteUpload
              title="후면 도트"
              preview={backPreview}
              hint="플레이어 측"
              onSelect={onSelectBack}
              onReset={onResetBack}
            />
            <SpriteUpload
              title="아이콘"
              preview={iconPreview}
              hint="목록/도감"
              onSelect={onSelectIcon}
              onReset={onResetIcon}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
