'use client';

export default function CharacterAgentScreen({ hero }) {
  return (
    <>
      <section
        style={{
          padding: 16,
          borderRadius: 24,
          background: 'rgba(2, 6, 23, 0.78)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          display: 'grid',
          gap: 12,
        }}
      >
        <strong style={{ fontSize: 18 }}>캐릭터 AI</strong>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#cbd5e1' }}>
          여기서 <strong>{hero?.name || '이 캐릭터'}</strong> 와 대화하면서 성격, 말투, 행동 원칙을 다듬게 됩니다. 아직 실제 캐릭터 AI 대화는 붙이지 않았고, 이 페이지가 전용 작업 공간이 될 자리만 먼저 만든 상태입니다.
        </p>
      </section>

      <section
        style={{
          padding: 16,
          borderRadius: 24,
          background: 'rgba(2, 6, 23, 0.78)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          display: 'grid',
          gap: 14,
        }}
      >
        <div
          style={{
            borderRadius: 18,
            background: 'rgba(15,23,42,0.72)',
            border: '1px solid rgba(148,163,184,0.2)',
            padding: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          <strong style={{ fontSize: 15 }}>계획된 흐름</strong>
          <div style={{ display: 'grid', gap: 8, color: '#cbd5e1', fontSize: 13, lineHeight: 1.65 }}>
            <div>1. 캐릭터 기본 정보와 능력을 바탕으로 대화를 시작</div>
            <div>2. 대화 내용을 요약해서 캐릭터 AI 프로필로 정리</div>
            <div>3. 게임에선 이 요약 프로필만 사용해 비용을 줄임</div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            background: 'rgba(15,23,42,0.72)',
            border: '1px solid rgba(148,163,184,0.2)',
            padding: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          <strong style={{ fontSize: 15 }}>준비 중인 항목</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge text="성격 프롬프트" />
            <Badge text="말투" />
            <Badge text="행동 원칙" />
            <Badge text="기억 요약" />
            <Badge text="API 연결" />
          </div>
        </div>
      </section>
    </>
  );
}

function Badge({ text }) {
  return (
    <span
      style={{
        padding: '7px 10px',
        borderRadius: 999,
        background: 'rgba(125,211,252,0.15)',
        border: '1px solid rgba(125,211,252,0.24)',
        color: '#bae6fd',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {text}
    </span>
  );
}
