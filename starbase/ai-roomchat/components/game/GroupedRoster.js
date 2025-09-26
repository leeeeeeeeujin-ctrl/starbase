// components/game/GroupedRoster.js
export default function GroupedRoster({ grouped = [], compact = false }) {
  return (
    <div style={{ display:'grid', gap:12 }}>
      {grouped.map(g => (
        <div key={g.role} style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
          <div style={{ fontWeight:800, marginBottom:8 }}>{g.role}</div>
          <div style={{
            display:'grid',
            gridTemplateColumns: compact ? 'repeat(auto-fill, minmax(180px, 1fr))'
                                         : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap:10
          }}>
            {g.rows.map(r => (
              <div key={r.id} style={{ border:'1px solid #eef2f7', borderRadius:10, padding:10, background:'#fafafa' }}>
                <div style={{ display:'flex', gap:8 }}>
                  <div style={{ width:44, height:44, borderRadius:8, overflow:'hidden', background:'#e5e7eb' }}>
                    {r.hero?.image_url && <img src={r.hero.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {r.hero?.name || `#${r.hero_id}`}
                    </div>
                    <div data-numeric style={{ fontSize:12, color:'#64748b' }}>점수 {r.score}</div>
                  </div>
                </div>
                {!compact && r.hero?.abilities?.length > 0 && (
                  <ul style={{ margin:8, marginTop:10, padding:0, listStyle:'none', display:'grid', gap:4 }}>
                    {r.hero.abilities.slice(0,4).map((a, i) => (
                      <li key={i} style={{ fontSize:12, color:'#475569' }}>#{i+1} {a}</li>
                    ))}
                  </ul>
                )}
                {!compact && r.hero?.description && (
                  <div style={{ fontSize:12, color:'#475569', whiteSpace:'pre-wrap' }}>
                    {r.hero.description}
                  </div>
                )}
              </div>
            ))}
            {g.rows.length === 0 && <div style={{ color:'#94a3b8' }}>해당 역할 참여자 없음</div>}
          </div>
        </div>
      ))}
      {grouped.length === 0 && <div style={{ color:'#94a3b8' }}>참여자가 없습니다.</div>}
    </div>
  )
}
