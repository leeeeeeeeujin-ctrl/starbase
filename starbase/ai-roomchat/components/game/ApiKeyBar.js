// components/game/ApiKeyBar.js
import { useEffect, useState } from 'react'

export default function ApiKeyBar({ storageKey = 'OPENAI_API_KEY' }) {
  const [key, setKey] = useState('')

  useEffect(() => {
    try {
      const v = localStorage.getItem(storageKey)
      if (v) setKey(v)
    } catch {}
  }, [storageKey])

  function save() {
    try {
      localStorage.setItem(storageKey, key.trim())
      alert('API 키 저장 완료(로컬)')
    } catch {
      alert('저장 실패: 브라우저 저장소 접근 불가')
    }
  }

  return (
    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
      <label style={{ fontSize:12, color:'#64748b' }}>API Key</label>
      <input
        type="password"
        value={key}
        onChange={e=>setKey(e.target.value)}
        placeholder="sk-..."
        style={{ flex:1, padding:'8px 10px' }}
      />
      <button onClick={save} style={{ padding:'8px 12px', borderRadius:8 }}>저장</button>
    </div>
  )
}
