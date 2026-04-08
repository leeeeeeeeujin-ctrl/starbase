import Link from 'next/link';

const pageStyle = {
  minHeight: '100vh',
  background: '#020617',
  color: '#e2e8f0',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle = {
  padding: '24px 24px 16px',
  borderBottom: '1px solid rgba(148,163,184,0.2)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const actionStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 16px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,0.28)',
  color: '#e2e8f0',
  textDecoration: 'none',
  background: 'rgba(15,23,42,0.72)',
  fontWeight: 600,
};

const noteStyle = {
  margin: '16px 24px 0',
  padding: '12px 14px',
  borderRadius: 14,
  background: 'rgba(15,23,42,0.82)',
  border: '1px solid rgba(148,163,184,0.18)',
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.6,
};

const frameWrapStyle = {
  flex: 1,
  padding: 24,
};

const iframeStyle = {
  width: '100%',
  height: 'calc(100vh - 170px)',
  border: '1px solid rgba(96,165,250,0.24)',
  borderRadius: 18,
  background: '#000',
};

export default function PokerogueUpstreamPage() {
  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Pokerogue Upstream</h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>
            로컬에 빌드된 Pokerogue 본판을 그대로 띄워서 수정 지점을 찾는 개발용 페이지
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/pokerogue" style={actionStyle}>
            포켓로그 메타로
          </Link>
          <a href="/api/pokerogue/upstream/index.html" target="_blank" rel="noreferrer" style={actionStyle}>
            새 탭으로 열기
          </a>
        </div>
      </header>

      <div style={noteStyle}>
        이 페이지는 <strong>로컬 개발용</strong>이다. <code>../pokerogue-upstream/dist</code> 폴더를 직접 읽는다.
        Vercel 배포본에는 아직 upstream 빌드를 포함하지 않았다.
      </div>

      <div style={frameWrapStyle}>
        <iframe title="Pokerogue Upstream" src="/api/pokerogue/upstream/index.html" style={iframeStyle} />
      </div>
    </main>
  );
}
