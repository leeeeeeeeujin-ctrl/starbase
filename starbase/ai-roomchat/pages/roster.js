// pages/roster.js
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import LogoutButton from '../components/LogoutButton'

export default function Roster() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])

  useEffect(() => {
    let mounted = true
    async function load() {
const { data: { user } } = await supabase.auth.getUser()
const { data, error } = await supabase
  .from('heroes')
  .select('id,name,image_url,created_at')
 .eq('owner_id', user.id)
  .order('created_at', { ascending: false })
      if (error) alert(error.message)
      else if (mounted) setRows(data || [])
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [router])

  if (loading) return <div style={{ padding:20 }}>불러오는 중…</div>

  return (
    <div style={{ padding:20, maxWidth:1100, margin:'0 auto' }}>
      {/* 헤더: 타이틀 + 액션(생성/로그아웃) */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>내 로스터</h2>
        <div style={{ display:'flex', gap:8 }}>
          <Link href="/create">
            <a style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', textDecoration:'none', fontWeight:600 }}>
              + Create
            </a>
          </Link>
          <LogoutButton onAfter={() => router.replace('/')} />
        </div>
      </div>

      {rows.length === 0 && (
        <div style={{ padding:16, border:'1px dashed #cbd5e1', borderRadius:12, background:'#f8fafc', color:'#475569', marginBottom:16 }}>
          아직 캐릭터가 없습니다. 우측 상단 <b>Create</b> 버튼으로 첫 캐릭터를 만들어보세요.
        </div>
      )}

      {/* 카드 그리드 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:16 }}>
        {rows.map((r) => (
          <Link key={r.id} href={`/character/${r.id}`}>
            <a
              style={{
                position:'relative', borderRadius:16, overflow:'hidden',
                border:'1px solid #e5e7eb', background:'#fff', boxShadow:'0 1px 2px rgba(0,0,0,0.04)'
              }}
              title={`${r.name} 상세보기`}
            >
              <div style={{ aspectRatio:'1 / 1', width:'100%', background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {r.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image_url} alt={r.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                ) : (
                  <div style={{ fontSize:28, color:'#94a3b8', fontWeight:700 }}>
                    {r.name?.slice(0,2) ?? '??'}
                  </div>
                )}
              </div>
              <div style={{
                position:'absolute', left:0, right:0, bottom:0, padding:'10px 12px',
                background:'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 90%)',
                color:'#fff', display:'flex', alignItems:'flex-end', minHeight:56
              }}>
                <div style={{ fontWeight:700, fontSize:16, textShadow:'0 1px 2px rgba(0,0,0,0.4)' }}>{r.name}</div>
              </div>
            </a>
          </Link>
        ))}
      </div>
    </div>
  )
}
