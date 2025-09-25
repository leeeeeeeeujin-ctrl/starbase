import React from 'react'
import Link from 'next/link'
import AuthButton from '../components/AuthButton'

export default function Home() {
  return (
    <main style={{ padding:24 }}>
      <h1>ai-roomchat (pages router)</h1>
      <AuthButton />
      <nav style={{ marginTop:12, display:'flex', gap:12 }}>
        <Link href="/create"><a>Create</a></Link>
        <Link href="/roster"><a>Roster</a></Link>
        <Link href="/chat"><a>Chat</a></Link>
      </nav>
      <p style={{ marginTop:12, color:'#666' }}>
        .env의 SUPABASE URL/ANON_KEY가 같은 프로젝트인지 꼭 확인.
      </p>
    </main>
  )
}
