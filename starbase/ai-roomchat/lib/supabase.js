import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function PromptSetPicker({ value, onChange }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('prompt_sets')
        .select('id,name,owner_id')
        .order('id', { ascending: false })
      // 필요 시 공개 필터 추가 가능
      setRows((data || []).filter(r => !user || r.owner_id === user.id))
      setLoading(false)
    })()
  }, [])

  const stringValue = value == null ? '' : String(value)

  if (loading) return <div>프롬프트 세트 로딩…</div>

  return (
    <label style={{ display:'grid', gap:6 }}>
      <span>프롬프트 세트</span>
      <select
        value={stringValue}
        onChange={e => onChange?.(e.target.value)}   // 문자열 유지
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
