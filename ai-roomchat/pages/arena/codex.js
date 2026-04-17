import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const pageStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top, rgba(30,41,59,0.9), rgba(2,6,23,1) 55%)',
  color: '#e5eefb',
  padding: '32px 20px 64px',
  fontFamily:
    '"Pretendard Variable","IBM Plex Sans KR","Noto Sans KR",system-ui,sans-serif',
};

const shellStyle = {
  maxWidth: 1080,
  margin: '0 auto',
  display: 'grid',
  gap: 20,
};

const panelStyle = {
  background: 'rgba(15,23,42,0.78)',
  border: '1px solid rgba(148,163,184,0.2)',
  borderRadius: 20,
  padding: 20,
  boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
};

const labelStyle = {
  margin: '0 0 8px',
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#93c5fd',
};

const inputStyle = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.24)',
  background: 'rgba(15,23,42,0.96)',
  color: '#e5eefb',
  padding: '12px 14px',
  fontSize: 14,
  outline: 'none',
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 110,
  resize: 'vertical',
  lineHeight: 1.6,
};

const buttonStyle = {
  border: '1px solid rgba(125,211,252,0.35)',
  background: 'rgba(14,165,233,0.14)',
  color: '#e0f2fe',
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 13,
  cursor: 'pointer',
};

function buildUrl(basePath, query) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim()) params.set(key, value.trim());
  });
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function seatGuide(side, leftName, rightName, leftStyle, rightStyle, stakes) {
  if (side === 'a') {
    return [
      `${leftName} 입장에서만 판단한다.`,
      `${rightName}에게 유리한 해석도 받아들일 수 있지만, 먼저 자기 캐릭터에게 유리한 논리를 제시한다.`,
      `성향 참고: ${leftStyle || '미정'}`,
      stakes ? `이번 전투 목표: ${stakes}` : null,
      '매 턴 반드시 행동 1개와 이유를 짧게 제시한다.',
      '합의가 안 나면 상대 제안을 반박한 뒤 절충안을 낸다.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (side === 'b') {
    return [
      `${rightName} 입장에서만 판단한다.`,
      `${leftName}에게 유리한 해석도 받아들일 수 있지만, 먼저 자기 캐릭터에게 유리한 논리를 제시한다.`,
      `성향 참고: ${rightStyle || '미정'}`,
      stakes ? `이번 전투 목표: ${stakes}` : null,
      '매 턴 반드시 행동 1개와 이유를 짧게 제시한다.',
      '합의가 안 나면 상대 제안을 반박한 뒤 절충안을 낸다.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    '관전자/운영자 모드다.',
    '좌측 링크는 A 캐릭터 입장, 우측 링크는 B 캐릭터 입장으로 열어준다.',
    '둘이 합의 실패 시 운영자가 판정 요약만 내려도 된다.',
  ].join('\n');
}

export default function CodexArenaPage() {
  const router = useRouter();
  const query = router.query || {};

  const [title, setTitle] = useState(
    typeof query.title === 'string' ? query.title : '코덱스 자유토론 배틀'
  );
  const [leftName, setLeftName] = useState(
    typeof query.left === 'string' ? query.left : '플레이어 A'
  );
  const [rightName, setRightName] = useState(
    typeof query.right === 'string' ? query.right : '플레이어 B'
  );
  const [leftStyle, setLeftStyle] = useState(
    typeof query.leftStyle === 'string' ? query.leftStyle : '공격적, 강행형'
  );
  const [rightStyle, setRightStyle] = useState(
    typeof query.rightStyle === 'string' ? query.rightStyle : '수비적, 기회주의형'
  );
  const [stakes, setStakes] = useState(
    typeof query.stakes === 'string' ? query.stakes : '상대 전투 불능 또는 항복'
  );
  const [context, setContext] = useState(
    typeof query.context === 'string'
      ? query.context
      : '현재 장면, 전장 효과, 사전 사건, 캐릭터 간 관계를 적는다.'
  );

  const side = typeof query.side === 'string' ? query.side : 'observer';

  const observerUrl = useMemo(
    () =>
      buildUrl('/arena/codex', {
        title,
        left: leftName,
        right: rightName,
        leftStyle,
        rightStyle,
        stakes,
        context,
        side: 'observer',
      }),
    [context, leftName, leftStyle, rightName, rightStyle, stakes, title]
  );

  const leftUrl = useMemo(
    () =>
      buildUrl('/arena/codex', {
        title,
        left: leftName,
        right: rightName,
        leftStyle,
        rightStyle,
        stakes,
        context,
        side: 'a',
      }),
    [context, leftName, leftStyle, rightName, rightStyle, stakes, title]
  );

  const rightUrl = useMemo(
    () =>
      buildUrl('/arena/codex', {
        title,
        left: leftName,
        right: rightName,
        leftStyle,
        rightStyle,
        stakes,
        context,
        side: 'b',
      }),
    [context, leftName, leftStyle, rightName, rightStyle, stakes, title]
  );

  const currentGuide = useMemo(
    () => seatGuide(side, leftName, rightName, leftStyle, rightStyle, stakes),
    [leftName, leftStyle, rightName, rightStyle, side, stakes]
  );

  const protocolText = useMemo(
    () =>
      [
        '# 출력 규약',
        '1. 행동: 이번 턴에 취할 행동 1개',
        '2. 이유: 왜 그 행동이 유리한지 2~4문장',
        '3. 반박: 상대 제안의 약점 1~2문장',
        '4. 합의안: 둘 다 받아들일 수 있는 최종 판정 1문장',
        '',
        '# 현재 전투 배경',
        context,
      ].join('\n'),
    [context]
  );

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <div style={{ ...panelStyle, display: 'grid', gap: 12 }}>
          <p style={labelStyle}>Codex Arena</p>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 34 }}>{title}</h1>
              <p style={{ margin: '8px 0 0', color: '#cbd5e1', lineHeight: 1.6 }}>
                데스크탑 코덱스 두 개가 각각 자기 캐릭터 입장으로 이 페이지를 열고, 자유토론형 배틀을
                진행하는 전용 진입점이다.
              </p>
            </div>
            <Link href="/" style={{ ...buttonStyle, textDecoration: 'none' }}>
              메인으로
            </Link>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 20,
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
          }}
        >
          <div style={{ ...panelStyle, display: 'grid', gap: 14 }}>
            <p style={labelStyle}>Battle Setup</p>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <p style={labelStyle}>배틀 제목</p>
                <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <p style={labelStyle}>승리 조건</p>
                <input style={inputStyle} value={stakes} onChange={e => setStakes(e.target.value)} />
              </div>
              <div>
                <p style={labelStyle}>좌측 캐릭터</p>
                <input style={inputStyle} value={leftName} onChange={e => setLeftName(e.target.value)} />
              </div>
              <div>
                <p style={labelStyle}>우측 캐릭터</p>
                <input style={inputStyle} value={rightName} onChange={e => setRightName(e.target.value)} />
              </div>
              <div>
                <p style={labelStyle}>좌측 성향</p>
                <input
                  style={inputStyle}
                  value={leftStyle}
                  onChange={e => setLeftStyle(e.target.value)}
                />
              </div>
              <div>
                <p style={labelStyle}>우측 성향</p>
                <input
                  style={inputStyle}
                  value={rightStyle}
                  onChange={e => setRightStyle(e.target.value)}
                />
              </div>
            </div>
            <div>
              <p style={labelStyle}>전투 배경 / 장면 정보</p>
              <textarea
                style={textareaStyle}
                value={context}
                onChange={e => setContext(e.target.value)}
              />
            </div>
          </div>

          <div style={{ ...panelStyle, display: 'grid', gap: 14 }}>
            <p style={labelStyle}>Seat Links</p>
            {[
              ['Observer', observerUrl],
              [`${leftName} 링크`, leftUrl],
              [`${rightName} 링크`, rightUrl],
            ].map(([label, href]) => (
              <div
                key={label}
                style={{
                  border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: 14,
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <strong>{label}</strong>
                <code
                  style={{
                    fontSize: 12,
                    wordBreak: 'break-all',
                    color: '#bfdbfe',
                    background: 'rgba(15,23,42,0.72)',
                    padding: 10,
                    borderRadius: 10,
                    display: 'block',
                  }}
                >
                  {href}
                </code>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 20,
            gridTemplateColumns: 'minmax(0, 0.95fr) minmax(0, 1.05fr)',
          }}
        >
          <div style={{ ...panelStyle, display: 'grid', gap: 12 }}>
            <p style={labelStyle}>Current Seat</p>
            <div
              style={{
                display: 'inline-flex',
                width: 'fit-content',
                padding: '6px 10px',
                borderRadius: 999,
                background:
                  side === 'a'
                    ? 'rgba(251,146,60,0.16)'
                    : side === 'b'
                      ? 'rgba(96,165,250,0.16)'
                      : 'rgba(148,163,184,0.16)',
                color: side === 'a' ? '#fdba74' : side === 'b' ? '#93c5fd' : '#cbd5e1',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {side === 'a' ? `${leftName} 시트` : side === 'b' ? `${rightName} 시트` : '관전자 시트'}
            </div>
            <textarea readOnly style={textareaStyle} value={currentGuide} />
          </div>

          <div style={{ ...panelStyle, display: 'grid', gap: 12 }}>
            <p style={labelStyle}>Output Protocol</p>
            <textarea readOnly style={{ ...textareaStyle, minHeight: 220 }} value={protocolText} />
          </div>
        </div>
      </div>
    </div>
  );
}
