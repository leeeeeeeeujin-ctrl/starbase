import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function PromptSetPicker({ value, onChange }) {
  const [list, setList] = useState([])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('prompt_sets').select('id,name').order('id', { ascending: true })
      if (alive) setList(data || [])
    })()
    return () => { alive = false }
  }, [])
  return (
    <label style={{ display:'grid', gap:4 }}>
      <span>프롬프트 세트</span>
      <select value={value || ''} onChange={e=>onChange?.(e.target.value)}>
        <option value="">선택</option>
        {list.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
      </select>
    </label>
  )
}
