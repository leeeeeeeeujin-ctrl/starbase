import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { buildSupabaseAuthHeaders } from '../../lib/api/authHeaders';

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

const statusGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
  margin: '16px 24px 0',
};

const statusCardStyle = {
  borderRadius: 14,
  padding: '14px 16px',
  background: 'rgba(15,23,42,0.82)',
  border: '1px solid rgba(148,163,184,0.18)',
};

const statusLabelStyle = {
  display: 'block',
  color: '#94a3b8',
  fontSize: 12,
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const statusValueStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  color: '#e2e8f0',
  wordBreak: 'break-word',
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
  const bundledUpstreamUrl = '/pokerogue-embedded/index.html';
  const [bridgeReady, setBridgeReady] = useState(false);
  const [embeddedAuthReady, setEmbeddedAuthReady] = useState(false);
  const [authState, setAuthState] = useState({
    loading: true,
    loggedIn: false,
    userText: '',
    tokenReady: false,
    compatOk: false,
    compatText: '',
  });
  const iframeSrc = useMemo(
    () => externalUpstreamUrl || (isDev ? '/api/pokerogue/upstream/index.html' : bundledUpstreamUrl),
    [externalUpstreamUrl, isDev],
  );
  const openInNewTabHref = iframeSrc;
  const iframeLaunchReady =
    Boolean(iframeSrc) && bridgeReady && !authState.loading && authState.compatOk && embeddedAuthReady;

  useEffect(() => {
    let cancelled = false;

    async function loadAuthState() {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session || null;
        const user = session?.user || null;
        const { headers, token } = await buildSupabaseAuthHeaders();

        let compatOk = false;
        let compatText = '확인 전';

        try {
          const response = await fetch('/api/pokerogue-compat/account/info', {
            headers,
          });
          const text = await response.text();
          compatOk = response.ok;
          compatText = response.ok ? text : `${response.status} ${text}`;
        } catch (error) {
          compatText = error?.message || 'compat API 요청 실패';
        }

        if (!cancelled) {
          setAuthState({
            loading: false,
            loggedIn: Boolean(user),
            userText: user?.email || user?.id || '',
            tokenReady: Boolean(token),
            compatOk,
            compatText,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setAuthState({
            loading: false,
            loggedIn: false,
            userText: '',
            tokenReady: false,
            compatOk: false,
            compatText: error?.message || '로그인 상태 확인 실패',
          });
        }
      }
    }

    loadAuthState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let active = true;

    async function syncEmbeddedToken() {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user || null;
        const { token } = await buildSupabaseAuthHeaders();
        if (!active) return;
        if (token) {
          window.localStorage.setItem('pokerogue_supabase_access_token', token);
        } else {
          window.localStorage.removeItem('pokerogue_supabase_access_token');
        }
        if (user) {
          window.localStorage.setItem(
            'pokerogue_supabase_user',
            JSON.stringify({
              id: user.id || '',
              email: user.email || '',
              user_metadata: user.user_metadata || {},
            }),
          );
        } else {
          window.localStorage.removeItem('pokerogue_supabase_user');
        }
        setEmbeddedAuthReady(true);
      } catch {
        if (!active) return;
        window.localStorage.removeItem('pokerogue_supabase_access_token');
        window.localStorage.removeItem('pokerogue_supabase_user');
        setEmbeddedAuthReady(true);
      }
    }

    syncEmbeddedToken();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      syncEmbeddedToken();
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function releaseMainServiceWorker() {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        if (!cancelled) setBridgeReady(true);
        return;
      }

      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister().catch(() => {})));

        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter(key => key.toLowerCase().includes('starbase-ai-game') || key.toLowerCase().includes('workbox'))
              .map(key => caches.delete(key).catch(() => {})),
          );
        }
      } catch (_) {
        // ignore cleanup errors
      }

      if (!cancelled) setBridgeReady(true);
    }

    releaseMainServiceWorker();

    return () => {
      cancelled = true;
    };
  }, []);

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
                    <span style={{ display: 'block', marginTop: 8 }}>
                      기존 <code>/pokerogue-upstream</code> 캐시/서비스워커 간섭을 피하려고 새 스코프
                      <code style={{ marginLeft: 6 }}>/pokerogue-embedded</code>를 쓴다.
                    </span>
                    {!bridgeReady ? (
                      <span style={{ display: 'block', marginTop: 8 }}>
                        현재는 메인 앱 서비스워커를 해제하고 캐시를 정리하는 중이라 iframe 표시를 잠시 늦춘다.
                      </span>
                    ) : null}
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

      <section style={statusGridStyle}>
        <div style={statusCardStyle}>
          <span style={statusLabelStyle}>앱 로그인 상태</span>
          <div style={statusValueStyle}>
            {authState.loading
              ? '확인 중'
              : authState.loggedIn
                ? `로그인됨${authState.userText ? ` (${authState.userText})` : ''}`
                : '로그인 안 됨'}
          </div>
        </div>
        <div style={statusCardStyle}>
          <span style={statusLabelStyle}>Supabase 토큰</span>
          <div style={statusValueStyle}>
            {authState.loading ? '확인 중' : authState.tokenReady ? '준비됨' : '없음'}
          </div>
        </div>
        <div style={statusCardStyle}>
          <span style={statusLabelStyle}>Pokerogue Compat API</span>
          <div style={statusValueStyle}>
            {authState.loading ? '확인 중' : authState.compatOk ? '정상' : '미확인 / 실패'}
            {authState.compatText ? (
              <div style={{ marginTop: 8, color: authState.compatOk ? '#a7f3d0' : '#fca5a5' }}>
                {authState.compatText}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div style={frameWrapStyle}>
        {iframeLaunchReady ? (
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
                {iframeSrc ? 'Pokerogue 실행 준비 중' : 'Pokerogue upstream 배포 주소가 아직 없다'}
              </strong>
              {iframeSrc ? (
                <>
                  <div>메인 앱 서비스워커를 해제하고 포켓로그 전용 정적 경로를 준비 중이다.</div>
                  <div>계정 브리지와 compat API 확인이 끝난 뒤에만 본판을 띄운다.</div>
                  {!embeddedAuthReady ? <div>임베드 인증 브리지 동기화 중…</div> : null}
                  {!authState.loading && !authState.compatOk ? (
                    <div style={{ color: '#fca5a5' }}>Compat API가 아직 정상 응답을 주지 않아서 본판 실행을 보류 중이다.</div>
                  ) : null}
                </>
              ) : (
                <>
                  <div>
                    1. <code>pokerogue-upstream/dist</code>를 별도 정적 호스팅으로 배포
                  </div>
                  <div>
                    2. 그 URL을 <code>NEXT_PUBLIC_POKEROGUE_UPSTREAM_URL</code>에 설정
                  </div>
                  <div>
                    3. 다시 배포하면 여기서 iframe으로 본판을 확인할 수 있다
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
