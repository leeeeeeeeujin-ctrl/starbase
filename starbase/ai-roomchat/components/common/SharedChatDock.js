import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SharedChatDock() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    // 초기 로드: 최근 200개 불러오기
    const load = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .order('id', { ascending: true })
        .limit(200)
      if (data) setMessages(data)
    }
    load()

    // 실시간 구독
    const channel = supabase
      .channel('shared_chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setMessages((prev) => {
            const next = [...prev, payload.new]
            return next.length > 200 ? next.slice(next.length - 200) : next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // 새 메시지 오면 맨 아래 고정
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim()) return
    await supabase.from('chat_messages').insert({ text: input })
    setInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          background: '#f9fafb',
        }}
      >
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 4 }}>
            <span style={{ fontWeight: 700, marginRight: 6 }}>{m.user || '익명'}</span>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          style={{ flex: 1, padding: 6, border: '1px solid #d1d5db', borderRadius: 6 }}
          placeholder="메시지 입력..."
        />
        <button
          onClick={sendMessage}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#2563eb', color: '#fff' }}
        >
          전송
        </button>
      </div>
    </div>
  )
}
