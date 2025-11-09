import React, { useEffect, useState } from 'react';
import Link from 'next/link';

function isStandaloneDisplay() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (typeof navigator !== 'undefined' && navigator.standalone) return true;
  } catch {}
  return false;
}

export default function PwaInstallPage(){
  const [standalone, setStandalone] = useState(false);
  const [bypassLeft, setBypassLeft] = useState(0);
  const [nextPath, setNextPath] = useState('/');

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    try {
      const raw = localStorage.getItem('ALLOW_BROWSER_TEMP');
      if (raw) {
        const obj = JSON.parse(raw);
        const remaining = (obj.expiresAt || 0) - Date.now();
        setBypassLeft(Math.max(0, Math.floor(remaining / 60000)));
      }
    } catch {}
    try {
      const url = new URL(window.location.href);
      const nxt = url.searchParams.get('next');
      if (nxt) setNextPath(nxt);
    } catch {}
  }, []);

  function grantTempBypass(){
    try {
      localStorage.setItem('ALLOW_BROWSER_TEMP', JSON.stringify({ expiresAt: Date.now() + 30 * 60000 }));
      window.location.href = nextPath || '/';
    } catch {}
  }

  if (standalone) {
    // already installed, bounce back
    if (typeof window !== 'undefined') {
      window.location.href = nextPath || '/';
    }
    return null;
  }

  return (
    <div style={{ padding:'1.25rem', maxWidth:720, margin:'0 auto', fontFamily:'system-ui,sans-serif', lineHeight:1.5 }}>
      <h1 style={{ marginBottom:'0.75rem' }}>앱 설치 필요</h1>
      <p style={{ margin:'0 0 0.75rem' }}>
        선택한 기능(게임 플레이 / 랭크 / 제작 툴)은 더 안정적인 환경을 위해 PWA 설치 후 이용하도록 제한되어 있습니다.
        홈 화면에 추가(설치)하면 오프라인 자원 캐시, 더 빠른 로딩, 그리고 네이티브 전환 경로가 활성화됩니다.
      </p>
      <ol style={{ paddingLeft:'1.25rem', margin:'0 0 1rem' }}>
        <li>모바일 브라우저 메뉴에서 "홈 화면에 추가" 또는 "앱 설치" 선택</li>
        <li>아이콘 생성 후 다시 실행하면 전체 기능이 열립니다.</li>
      </ol>
      <section style={{ background:'#182135', padding:'0.75rem 1rem', borderRadius:8, marginBottom:'1rem', color:'#e5ebf5' }}>
        <strong>임시 접근</strong>
        <p style={{ margin:'0.5rem 0' }}>디버그 또는 빠른 확인을 위해 30분 동안 브라우저 모드로 해당 기능을 열 수 있습니다.</p>
        {bypassLeft > 0 ? (
          <p style={{ margin:'0.5rem 0', fontSize:13 }}>남은 임시 허용 시간: {bypassLeft}분</p>
        ) : (
          <button onClick={grantTempBypass} style={{ background:'#2d5bff', color:'#fff', border:'none', padding:'8px 14px', borderRadius:4 }}>30분 임시 허용</button>
        )}
      </section>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <Link href="/download" style={{ background:'#333', color:'#fff', padding:'8px 14px', textDecoration:'none', borderRadius:4 }}>다운로드 안내</Link>
        <Link href="/" style={{ background:'#222', color:'#fff', padding:'8px 14px', textDecoration:'none', borderRadius:4 }}>홈으로 돌아가기</Link>
      </div>
    </div>
  );
}
