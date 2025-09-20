// pages/lobby.js
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

// 상단 네비 → 다른 페이지로 이동
const NAV = [
  { label: '게임 제작', href: '/maker' },
  { label: '플레이',   href: '/play' },
  { label: '사설',     href: '/private' },
  { label: '랭킹',     href: '/rank' },
]

export default function Lobby() {
  const router = useRouter()
  const { heroId } = router.query
  const [displayName, setDisplayName] = useState('익명')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  // 프로필 결정: 선택 캐릭터 > 내 첫 캐릭터 > 구글 메타 > 이메일
  useEffect(() => {
    let mounted = true
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }

      let name = null, avatar = null

      if (heroId) {
        const { data: hero } = await supabase
          .from('heroes')
          .select('name,image_url,owner_id')
          .eq('id', heroId)
          .single()
        if (hero) { name = hero.name; avatar = hero.image_url || null }
      }

      if (!name) {
        const { data: heroes } = await supabase
          .from('heroes')
          .select('name,image_url')
          .order('created_at', { ascending: true })
          .limit(1)
        if (heroes && heroes.length > 0) {
          name = heroes[0].name
          avatar = heroes[0].image_url || null
        }
      }

      if (!name) {
        const { data: { user } } = await supabase.auth.getUser()
        const meta = user?.user_metadata || {}
        name = meta.full_name || meta.name || (user?.email ? user.email.split('@')[0] : '익명')
        avatar = meta.avatar_url || null
      }

      if (!mounted) return
      setDisplayName(name)
      setAvatarUrl(avatar)
    }
    init()
    return () => { mounted = false }
  }, [heroId, router])

  // 채팅: 초기 로드 + Realtime 구독
  useEffect(() => {
    let mounted = true
    async function bootstrap() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100)
      if (!mounted) return
      if (error) alert(error.message)
      setMessages(data || [])
      setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
    }
    bootstrap()

    const channel = supabase
      .channel('messages-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => [...prev, payload.new])
        setTimeout(() => listRef.current?.scrollTo(0, 1e9), 0)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel); mounted = false }
  }, [])

  async function send() {
    if (!input.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('로그인 필요'); return }

    const text = input.trim()
    setInput('')

    const { error } = await supabase.from('messages').insert({
      owner_id: user.id,
      username: displayName,
      avatar_url: avatarUrl,
      text
    })
    if (error) alert(error.message)
  }

  return (
    <div style={{ padding:16, maxWidth:1200, margin:'0 auto', display:'grid', gridTemplateRows:'auto 1fr', height:'100vh' }}>
      {/* 상단 바: 뒤로가기 + 페이지 버튼 */}
      <div style={{ marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
        <button
          onClick={() => router.replace('/roster')}
          style={{ padding:'8px 12px', borderRadius:8, background:'#e5e7eb', fontWeight:600, border:'1px solid #d1d5db' }}
          title="로스터로 돌아가기"
        >
          ← 로스터
        </button>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginLeft:'auto' }}>
          {NAV.map(item => (
            <Link key={item.href} href={item.href}>
              <a style={{
                border:'1px solid #e5e7eb', padding:'8px 12px', borderRadius:999,
                background:'#fff', color:'#111827', fontWeight:600, textDecoration:'none'
              }}>
                {item.label}
              </a>
            </Link>
          ))}
        </div>
      </div>

      {/* 하단: 로비 채팅 */}
      <div style={{ display:'grid', gridTemplateRows:'auto 1fr auto', border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden', background:'#fff', minHeight:0 }}>
        <div style={{ padding:'10px 12px', borderBottom:'1px solid #e5e7eb', background:'#f9fafb', display:'flex', alignItems:'center', gap:10 }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover' }} />
            : <div style={{ width:36, height:36, borderRadius:'50%', background:'#e5e7eb' }} />}
          <div style={{ fontWeight:700 }}>{displayName}</div>
          <div style={{ marginLeft:'auto', fontSize:12, color:'#6b7280' }}>로비 채팅</div>
        </div>

        <div ref={listRef} style={{ padding:12, overflow:'auto' }}>
          {messages.map(m => (
            <div key={m.id} style={{ display:'grid', gridTemplateColumns:'40px 1fr', gap:8, padding:'8px 0', borderBottom:'1px solid #f3f4f6' }}>
              {m.avatar_url
                ? <img src={m.avatar_url} alt="" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', marginTop:2 }} />
                : <div style={{ width:32, height:32, borderRadius:'50%', background:'#e5e7eb', marginTop:2 }} />}
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{m.username}</div>
                  <div style={{ fontSize:12, color:'#6b7280' }}>{new Date(m.created_at).toLocaleTimeString()}</div>
                </div>
                <div style={{ marginTop:4, whiteSpace:'pre-wrap' }}>{m.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:8, padding:12, borderTop:'1px solid #e5e7eb', background:'#fafafa' }}>
          <input
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() } }}
            placeholder="메시지를 입력하세요…"
            style={{ flex:1, padding:'10px 12px', border:'1px solid #e5e7eb', borderRadius:8 }}
          />
          <button
            onClick={send}
            style={{ padding:'10px 16px', borderRadius:8, background:'#2563eb', color:'#fff', border:'none', fontWeight:700, cursor:'pointer' }}
          >
            보내기
          </button>
        </div>
      </div>
    </div>
  )
}
