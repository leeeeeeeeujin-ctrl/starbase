// pages/rank/index.js
import Link from 'next/link'
import { useEffect, useState } from 'react'
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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <h2 style={{ margin:0 }}>랭킹</h2>
          <span style={{ color:'#64748b' }}>게임을 고르거나, 새 게임을 등록하세요</span>
        </div>
        <Link href="/rank/new">
          <a style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff', fontWeight:700 }}>+ 게임 등록</a>
        </Link>
      </div>

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
        {games.length===0 && <div style={{ color:'#64748b' }}>아직 등록된 게임이 없습니다.</div>}
      </div>

      <SharedChatDock height={320} />
    </div>
  )
}
