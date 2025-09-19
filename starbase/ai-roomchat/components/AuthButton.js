import React from 'react'
import { supabase } from '../lib/supabase'

export default function AuthButton() {
  async function signIn() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined'
          ? `${window.location.origin}/auth-callback`
          : undefined,
      },
    })
    if (error) alert(error.message)
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) alert(error.message)
  }

  return (
    <div style={{ display:'flex', gap:8 }}>
      <button onClick={signIn} style={{ padding:6, borderRadius:6, background:'#ef4444', color:'#fff' }}>Google 로그인</button>
      <button onClick={signOut} style={{ padding:6, borderRadius:6 }}>로그아웃</button>
    </div>
  )
}
