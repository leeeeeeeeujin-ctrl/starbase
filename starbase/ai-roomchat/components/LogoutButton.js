// components/LogoutButton.js
import React from 'react'
import { supabase } from '../lib/supabase'

export default function LogoutButton({ onAfter }) {
  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) alert(error.message)
    if (onAfter) onAfter()
  }
  return (
    <button
      onClick={signOut}
      style={{ padding:'8px 12px', borderRadius:8, background:'#e5e7eb', color:'#111827', fontWeight:600 }}
      title="로그아웃"
    >
      로그아웃
    </button>
  )
}
