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
  const externalUpstreamUrl = process.env.NEXT_PUBLIC_POKEROGUE_UPSTREAM_URL || '';
  const isDev = process.env.NODE_ENV !== 'production';
  const bundledUpstreamUrl = '/pokerogue-upstream/index.html';
  const iframeSrc = externalUpstreamUrl || (isDev ? '/api/pokerogue/upstream/index.html' : bundledUpstreamUrl);
  const openInNewTabHref = externalUpstreamUrl || (isDev ? '/api/pokerogue/upstream/index.html' : bundledUpstreamUrl);

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Pokerogue Upstream</h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>
            {iframeSrc
              ? 'Pokerogue 본판을 바로 띄워서 수정 지점을 확인하는 페이지'
              : 'Pokerogue 본판 배포 주소가 아직 연결되지 않은 상태'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/pokerogue" style={actionStyle}>
            포켓로그 메타로
          </Link>
          <a href={openInNewTabHref} target="_blank" rel="noreferrer" style={actionStyle}>
            새 탭으로 열기
          </a>
        </div>
      </header>

      <div style={noteStyle}>
        {iframeSrc ? (
          <>
            {externalUpstreamUrl ? (
              <>
                현재는 <strong>외부 정적 배포</strong>를 iframe으로 불러온다. 주소:
                <code style={{ marginLeft: 6 }}>{externalUpstreamUrl}</code>
              </>
            ) : (
              <>
                {isDev ? (
                  <>
                    현재는 <strong>로컬 개발용</strong>으로 동작한다. <code>../pokerogue-upstream/dist</code> 폴더를 직접 읽는다.
                  </>
                ) : (
                  <>
                    현재는 <strong>같은 Vercel 프로젝트 안에 번들된 정적 빌드</strong>를 iframe으로 불러온다.
                    경로:
                    <code style={{ marginLeft: 6 }}>{bundledUpstreamUrl}</code>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            프로덕션에서는 로컬 파일시스템의 <code>../pokerogue-upstream/dist</code>를 읽을 수 없다.
            Vercel에서 본판을 보려면 Pokerogue 정적 빌드를 별도 배포하고,
            <code style={{ marginLeft: 6 }}>NEXT_PUBLIC_POKEROGUE_UPSTREAM_URL</code>
            환경변수에 그 주소를 넣어야 한다.
          </>
        )}
      </div>

      <div style={frameWrapStyle}>
        {iframeSrc ? (
          <iframe title="Pokerogue Upstream" src={iframeSrc} style={iframeStyle} />
        ) : (
          <div
            style={{
              ...iframeStyle,
              display: 'grid',
              placeItems: 'center',
              padding: 32,
              color: '#cbd5e1',
              lineHeight: 1.8,
              textAlign: 'center',
            }}
          >
            <div style={{ maxWidth: 760 }}>
              <strong style={{ display: 'block', marginBottom: 12, fontSize: 18 }}>
                Pokerogue upstream 배포 주소가 아직 없다
              </strong>
              <div>
                1. <code>pokerogue-upstream/dist</code>를 별도 정적 호스팅으로 배포
              </div>
              <div>
                2. 그 URL을 <code>NEXT_PUBLIC_POKEROGUE_UPSTREAM_URL</code>에 설정
              </div>
              <div>
                3. 다시 배포하면 여기서 iframe으로 본판을 확인할 수 있다
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
