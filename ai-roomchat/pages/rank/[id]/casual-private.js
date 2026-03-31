import Link from 'next/link';

export default function CasualPrivateRoomPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Match Route Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>사설 매칭 방 경로를 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          기존 사설 매칭 방은 구식 역할 점유/시작 흐름에 의존하고 있어 새 구조로 다시 만들 예정입니다.
        </p>
        <Link href="/match" style={{ color: '#93c5fd' }}>
          매치 화면으로 이동
        </Link>
      </div>
    </div>
  );
}
