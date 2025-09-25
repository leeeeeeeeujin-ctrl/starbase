import React from 'react'
import { supabase } from '../lib/supabase'

export default function AuthButton() {
  async function signIn() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth-callback`,
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

  function handleMouseEnter(event) {
    event.currentTarget.style.transform = 'translateY(-2px)'
    event.currentTarget.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.45)'
  }

  function handleMouseLeave(event) {
    event.currentTarget.style.transform = 'translateY(0)'
    event.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.35)'
  }

  return (
    <button
      onClick={signIn}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        padding: '14px 40px',
        borderRadius: 999,
        backgroundColor: '#040507',
        color: '#ffffff',
        fontSize: '18px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        fontFamily: '"Noto Sans KR", sans-serif',
      }}
    >
      신경망 접속
    </button>
  )
}
