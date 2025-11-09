import React, { useEffect, useState } from 'react';
import pkg from '../../package.json';

// Simple semantic compare (returns -1,0,1)
function cmp(a, b){
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i=0;i<Math.max(pa.length, pb.length);i++){
    const av = pa[i] || 0; const bv = pb[i] || 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export default function UpgradeBanner(){
  const [release, setRelease] = useState(null);
  const [error, setError] = useState(null);
  const currentVersion = pkg.version || '0.0.0';
  const [displayMode, setDisplayMode] = useState('browser');

  useEffect(()=>{
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        setDisplayMode('standalone');
      } else if (navigator.standalone) {
        setDisplayMode('standalone');
      }
    } catch {}
  },[]);

  useEffect(()=>{
    fetch('/native_release.json')
      .then(r => { if(!r.ok) throw new Error('release manifest fetch failed'); return r.json(); })
      .then(setRelease)
      .catch(e => setError(e.message));
  },[]);

  if (error) return null;
  if (!release) return null;

  const needsUpgrade = cmp(currentVersion, release.latestVersion) < 0;
  const belowMin = cmp(currentVersion, release.minPwaVersion) < 0;

  // Hide banner if no upgrade needed and not below min version
  if (!needsUpgrade && !belowMin) return null;

  const openNative = () => {
    const scheme = release.scheme || 'starbase://open';
    const href = scheme + '?redirect=' + encodeURIComponent(window.location.pathname);
    const timeout = setTimeout(()=>{
      // fallback: if scheme fails, show instructions (simple alert for now)
      alert('네이티브 앱이 설치되지 않은 것 같습니다. 다운로드 페이지로 이동하세요.');
      window.location.href = '/download?from=' + encodeURIComponent(window.location.pathname);
    }, 1200);
    window.location.href = href;
    const onHide = () => { clearTimeout(timeout); document.removeEventListener('visibilitychange', onHide); };
    document.addEventListener('visibilitychange', onHide);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 5000,
      background: '#141b2b', color: '#fff', padding: '10px 16px',
      display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 -2px 12px rgba(0,0,0,0.35)'
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <strong style={{ fontSize: 14 }}>
          {belowMin ? '지원 종료된 웹 버전입니다.' : '업데이트 이용 가능'}
        </strong>
        <span style={{ fontSize:12, opacity:0.75 }}>현재 버전 {currentVersion} / 최신 {release.latestVersion}</span>
      </div>
      {release.note && <div style={{ fontSize:12, opacity:0.9 }}>{release.note}</div>}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={openNative} style={{ background:'#2c4ae0', color:'#fff', border:'none', padding:'8px 14px', borderRadius:4 }}>앱 열기/설치</button>
        <a href="/download" style={{ background:'#333', color:'#fff', textDecoration:'none', padding:'8px 14px', borderRadius:4 }}>다운로드 안내</a>
        {displayMode === 'browser' && <span style={{ fontSize:11, opacity:0.7 }}>홈 화면에 추가하면 더 나은 경험(PWA)</span>}
      </div>
    </div>
  );
}
