"use client";

export default function CharacterDetailOverlay({ participant, onClose }) {
  if (!participant) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(2, 6, 23, 0.74)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          borderRadius: 28,
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(15,23,42,0.92) 100%)',
          border: '1px solid rgba(96,165,250,0.28)',
          boxShadow: '0 42px 120px -48px rgba(15, 23, 42, 0.96)',
          display: 'grid',
        }}
      >
        <div
          style={{
            minHeight: 180,
            background: participant.background_url
              ? `linear-gradient(180deg, rgba(2,6,23,0.28) 0%, rgba(2,6,23,0.84) 100%), url(${participant.background_url}) center/cover`
              : 'linear-gradient(180deg, rgba(30,41,59,0.96) 0%, rgba(15,23,42,0.94) 100%)',
            padding: 22,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 16,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 22,
              overflow: 'hidden',
              border: '1px solid rgba(226,232,240,0.28)',
              background: 'rgba(15,23,42,0.88)',
              flexShrink: 0,
            }}
          >
            {participant.image_url ? (
              <img
                src={participant.image_url}
                alt={participant.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#93c5fd',
                  fontWeight: 800,
                  fontSize: 28,
                }}
              >
                {(participant.name || '?').slice(0, 1)}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <strong style={{ color: '#f8fafc', fontSize: 24 }}>{participant.name}</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {participant.team ? <Tag>팀 {participant.team}</Tag> : null}
              {participant.role ? <Tag>{participant.role}</Tag> : null}
              {participant.slot_label ? <Tag>{participant.slot_label}</Tag> : null}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 22,
            display: 'grid',
            gap: 18,
          }}
        >
          <section style={{ display: 'grid', gap: 8 }}>
            <div style={sectionTitleStyle}>설명</div>
            <div style={bodyStyle}>{participant.description || '등록된 설명이 없습니다.'}</div>
          </section>

          <section style={{ display: 'grid', gap: 8 }}>
            <div style={sectionTitleStyle}>능력</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(participant.abilities || []).length ? (
                participant.abilities.map(ability => <Tag key={ability}>{ability}</Tag>)
              ) : (
                <span style={{ color: '#94a3b8', fontSize: 13 }}>등록된 능력이 없습니다.</span>
              )}
            </div>
          </section>

          <button
            type="button"
            onClick={onClose}
            style={{
              justifySelf: 'end',
              padding: '10px 14px',
              borderRadius: 14,
              border: '1px solid rgba(148,163,184,0.3)',
              background: 'rgba(15,23,42,0.8)',
              color: '#e2e8f0',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function Tag({ children }) {
  return (
    <span
      style={{
        padding: '6px 10px',
        borderRadius: 999,
        border: '1px solid rgba(125,211,252,0.22)',
        background: 'rgba(15,23,42,0.7)',
        color: '#dbeafe',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

const sectionTitleStyle = {
  color: '#7dd3fc',
  fontSize: 12,
  fontWeight: 800,
  textTransform: 'uppercase',
};

const bodyStyle = {
  color: '#dbeafe',
  fontSize: 14,
  lineHeight: 1.75,
  whiteSpace: 'pre-wrap',
};
