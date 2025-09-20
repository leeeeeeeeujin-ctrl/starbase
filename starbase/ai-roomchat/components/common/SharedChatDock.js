'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function SharedChatDock({ height=320 }) {
  const [msgs, setMsgs] = useState([])
  const [me, setMe] = useState({ name:'익명', avatar_url:null })
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const meta = user?.user_metadata || {}
      setMe({ name: meta.full_name || meta.name || (user?.email?.split('@')[0] ?? '익명'), avatar_url: meta.avatar_url || null })

      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(100)
      setMsgs(data || [])
    })()
  

    const ch = supabase
      .channel('messages-rankdock')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages' }, (p) => {
        setMsgs(m => [...m, p.new])
        setTimeout(()=>listRef.current?.scrollTo(0, 1e9), 0)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  async function send() {
    const text = input.trim(); if (!text) return
    setInput('')
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return alert('로그인 필요')
    const { error } = await supabase.from('messages').insert({
      owner_id: user.id, username: me.name, avatar_url: me.avatar_url, text
    })
    if (error) alert(error.message)
  }

  return (
    <div style={{ display:'grid', gridTemplateRows:'auto 1fr auto', border:'1px solid #e5e7eb', borderRadius:12, overflow:'hidden', background:'#fff', height }}>
      <div style={{ padding:'8px 12px', borderBottom:'1px solid #e5e7eb', background:'#f9fafb', fontWeight:700 }}>공유 로비 채팅</div>
      <div ref={listRef} style={{ padding:12, overflow:'auto' }}>
        {msgs.map(m=>(
          <div key={m.id} style={{ display:'grid', gridTemplateColumns:'36px 1fr', gap:8, padding:'6px 0', borderBottom:'1px solid #f3f4f6' }}>
            {m.avatar_url ? <img src={m.avatar_url} alt="" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/> : <div style={{ width:32, height:32, borderRadius:'50%', background:'#e5e7eb' }}/>}
            <div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <b style={{ fontSize:13 }}>{m.username}</b>
                <span style={{ fontSize:12, color:'#6b7280' }}>{new Date(m.created_at).toLocaleTimeString()}</span>
              </div>
              <div style={{ marginTop:2, whiteSpace:'pre-wrap' }}>{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, padding:12, borderTop:'1px solid #e5e7eb', background:'#fafafa' }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); send() }}} placeholder="메시지를 입력…" style={{ flex:1, border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 10px' }}/>
        <button onClick={send} style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff' }}>보내기</button>
      </div>
    </div>
  )
}
