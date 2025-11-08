import React from 'react';

export default function DownloadGate() {
  const from = typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('from') : null;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const store = {
    android: 'https://play.google.com/store/apps/details?id=com.starbase.ai',
    ios: null, // App Store 미사용 정책에 따라 숨김
  };

  const openNative = () => {
    // Try custom scheme first; fallback to stores
    const scheme = 'starbase://open';
    const redirect = from ? `?redirect=${encodeURIComponent(from)}` : '';
    const href = scheme + redirect;
    const t = setTimeout(() => {
      // If scheme fails (no native), go to platform-specific next step
      if (isAndroid && store.android) {
        window.location.href = store.android; // 또는 APK 다운로드 링크가 준비되면 교체
      } else if (isIOS) {
        // iOS는 스토어 미사용 시 PWA 설치 안내로 유도
        window.location.href = '#pwa-guide';
      }
    }, 1200);
    window.location.href = href;
    // clear on visibility change (success likely)
    const onHide = () => { clearTimeout(t); document.removeEventListener('visibilitychange', onHide); };
    document.addEventListener('visibilitychange', onHide);
  };

  const continueWeb = () => {
    // Set bypass cookie then return to original path
    const ret = from || '/';
    document.cookie = 'sb_native=1; Path=/; Max-Age=31536000; SameSite=Lax';
    window.location.href = ret;
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Starbase 앱으로 더 쾌적하게</h1>
      <p>설치형 앱으로 더 빠른 로딩, 안정적인 오디오/백그라운드 동작을 사용할 수 있어요.</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <button onClick={openNative} style={{ padding: '12px 16px', fontSize: 16 }}>앱 열기 / 설치</button>
        <button onClick={continueWeb} style={{ padding: '12px 16px', fontSize: 16 }}>웹으로 계속 사용</button>
      </div>

      <hr style={{ margin: '24px 0' }} />

      <h2 id="pwa-guide">설치가 안 되나요?</h2>
      {isAndroid && (
        <>
          <p>안드로이드:</p>
          <ul>
            <li>크롬 메뉴에서 "홈 화면에 추가"로 PWA 설치 가능</li>
            <li>또는 Google Play(링크)로 설치 (현재 정책에 따라 비활성화될 수 있음)</li>
          </ul>
          {store.android && <div style={{ marginTop: 8 }}><a href={store.android} target="_blank" rel="noreferrer">Google Play 바로가기</a></div>}
        </>
      )}
      {isIOS && (
        <>
          <p>iOS(PWA 권장):</p>
          <ul>
            <li>사파리에서 공유 아이콘 → "홈 화면에 추가"를 선택하세요.</li>
            <li>이 방식은 App Store 없이도 설치되며, 웹앱이 자동으로 최신 상태를 유지합니다.</li>
          </ul>
        </>
      )}

      <p style={{ marginTop: 24, opacity: 0.8, fontSize: 14 }}>
        팁: 웹에서 홈 화면에 추가(PWA)로도 가볍게 사용할 수 있어요. 나중에 언제든 앱으로 전환 가능합니다.
      </p>
    </div>
  );
}
