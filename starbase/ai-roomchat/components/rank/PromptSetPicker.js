// components/rank/PromptSetPicker.js
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function PromptSetPicker({ value, onChange }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      // 최소 동작: 내 세트 위주로
      const { data } = await supabase
        .from('prompt_sets')
        .select('id,name,owner_id')
        .order('id', { ascending: false })
      // 필요 시 public 플래그 기반 필터를 추가하세요.
      setRows((data || []).filter(r => !user || r.owner_id === user.id))
      setLoading(false)
    })()
  }, [])

  if (loading) return <div>프롬프트 세트 로딩…</div>

  // 선택값을 항상 문자열로 강제
  const stringValue = value == null ? '' : String(value)

  return (
    <label style={{ display:'grid', gap:6 }}>
      <span>프롬프트 세트</span>
      <select
        value={stringValue}
        onChange={e => onChange?.(e.target.value)}
        disabled={loading}
        style={{ padding:'10px 12px', border:'1px solid #e5e7eb', borderRadius:10 }}
      >
        <option value="">선택</option>
        {rows.map(r => (
          <option key={r.id} value={String(r.id)}>
            {r.name} ({r.owner_id?.slice(0,8)}…)
          </option>
        ))}
      </select>
    </label>
  )
}
