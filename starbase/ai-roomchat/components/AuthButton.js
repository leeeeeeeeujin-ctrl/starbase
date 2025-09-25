import React from 'react'
import { supabase } from '../lib/supabase'

export default function AuthButton() {
  async function signIn() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth-callback`, // auth-callback.js랑 일치
        },
      })
      if (error) {
        console.error(error)
        alert('로그인 실패: ' + error.message)
      }
    } catch (e) {
      console.error(e)
      alert('로그인 중 오류')
    }
  }

  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error(error)
        alert('로그아웃 실패: ' + error.message)
      }
    } catch (e) {
      console.error(e)
      alert('로그아웃 중 오류')
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        onClick={signIn}
        style={{ padding: 6, borderRadius: 6, background: '#ef4444', color: '#fff' }}
      >
        Google 로그인
      </button>
      <button
        onClick={signOut}
        style={{ padding: 6, borderRadius: 6 }}
      >
        로그아웃
      </button>
    </div>
  )
}
