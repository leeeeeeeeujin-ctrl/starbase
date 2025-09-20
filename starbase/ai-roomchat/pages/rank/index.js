// pages/rank/index.js
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import SharedChatDock from '../../components/common/SharedChatDock'

export default function RankHub() {
  const [games, setGames] = useState([])

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('rank_games')
        .select('id,name,description,created_at')
        .order('created_at', { ascending:false })
      setGames(data || [])
    })()
  }, [])

  return (
    <div style={{ maxWidth:1200, margin:'24px auto', padding:12, display:'grid', gridTemplateRows:'auto 1fr auto', gap:12 }}>
      {/* 상단 바 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <h2 style={{ margin:0 }}>랭킹</h2>
          <span style={{ color:'#64748b' }}>게임 목록에서 하나를 골라 들어가세요</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Link href="/rank/new"><a style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff' }}>+ 게임 등록</a></Link>
          <Link href="/maker"><a style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8 }}>게임 제작</a></Link>
        </div>
      </div>

      {/* 중앙: 게임 카드 리스트 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:12 }}>
        {games.map(g => (
          <Link key={g.id} href={`/rank/${g.id}`}>
            <a style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff', display:'block' }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>{g.name}</div>
              <div style={{ color:'#64748b', minHeight:32 }}>{g.description || '설명 없음'}</div>
              <div style={{ marginTop:8, fontSize:12, color:'#94a3b8' }}>{new Date(g.created_at).toLocaleString()}</div>
            </a>
          </Link>
        ))}
        {games.length===0 && <div style={{ color:'#64748b' }}>아직 등록된 게임이 없습니다. 우상단 “게임 등록”으로 새 게임을 만들어보세요.</div>}
      </div>

      {/* 하단: 공유 로비 채팅(중간 크기) */}
      <SharedChatDock height={320} />
    </div>
  )
}
