// pages/rank/index.js
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import GameListPanel from '../../components/rank/GameListPanel'; // ← 추가

export default function RankHub() {
  const [count, setCount] = useState(0);

  // 총 게임 수(선택)
  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('rank_games')
        .select('id', { count: 'exact', head: true });
      setCount(count ?? 0);
    })();
  }, []);

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '24px auto',
        padding: 12,
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        gap: 12,
      }}
    >
      {/* 상단 바: 기존 문구 유지 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>랭킹</h2>
          <span style={{ color: '#64748b' }}>
            게임을 고르거나, 새 게임을 등록하세요 · 총 {count}개
          </span>
        </div>
        <Link
          href="/rank/new"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#111827',
            color: '#fff',
            fontWeight: 700,
            display: 'inline-block',
            textDecoration: 'none',
          }}
        >
          + 게임 등록
        </Link>
      </div>

      {/* 본문: 모바일 세로 최적화 스크롤 패널 */}
      <GameListPanel />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Link
          href="/chat"
          style={{
            padding: '10px 18px',
            borderRadius: 999,
            background: '#0f172a',
            color: '#bae6fd',
            fontWeight: 700,
            border: '1px solid rgba(56, 189, 248, 0.4)',
            textDecoration: 'none',
          }}
        >
          공용 채팅 페이지로 이동
        </Link>
      </div>
    </div>
  );
}
