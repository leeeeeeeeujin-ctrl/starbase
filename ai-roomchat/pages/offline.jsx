import React from 'react';

export default function OfflinePage() {
  return (
    <div style={{ minHeight:'100vh', display:'grid', placeItems:'center', background:'#0b1120', color:'#e2e8f0', padding:20 }}>
      <div style={{ maxWidth:520, textAlign:'center' }}>
        <h1 style={{ fontSize:22, marginBottom:10 }}>오프라인 모드</h1>
        <p style={{ color:'#94a3b8' }}>
          네트워크 연결이 없어도 일부 기능은 계속 사용할 수 있어요. 인터넷 연결이 복구되면 자동으로 동기화됩니다.
        </p>
        <div style={{ marginTop:16, padding:12, border:'1px solid #25314a', borderRadius:12, background:'rgba(2,6,23,0.5)' }}>
          <ul style={{ textAlign:'left', lineHeight:1.8, margin:0 }}>
            <li>최근 열람한 페이지와 에셋은 캐시에서 불러옵니다.</li>
            <li>게임 세션/점수 업데이트는 백그라운드 동기화 큐에 저장됩니다.</li>
            <li>AI 기능은 연결 복구 후 다시 시도해주세요.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
