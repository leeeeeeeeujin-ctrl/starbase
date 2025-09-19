// pages/maker/index.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function MakerList() {
  const router = useRouter()
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      setUserId(user.id)
      await refresh(user.id)
    })()
  }, [router])

  async function refresh(uid) {
    // created_at 정렬(없어도 안전하게 name로 fallback 가능)
    let { data, error } = await supabase
      .from('prompt_sets').select('*').eq('owner_id', uid)
      .order('created_at', { ascending: true })
    if (error) {
      // 컬럼이 없을 때 대비
      const alt = await supabase.from('prompt_sets').select('*').eq('owner_id', uid).order('name', { ascending: true })
      data = alt.data
    }
    setRows(data || [])
  }

  async function createSet() {
    const { data, error } = await supabase.from('prompt_sets')
      .insert({ name: '새 세트', owner_id: userId })
      .select().single()
    if (!error && data) router.push(`/maker/${data.id}`)
    if (error) alert(error.message)
  }

  async function removeSet(id) {
    if (!confirm('세트를 삭제할까요? (프롬프트/브릿지 포함)')) return
    const { error } = await supabase.from('prompt_sets').delete().eq('id', id)
    if (error) { alert(error.message); return }
    setRows(rows => rows.filter(r => r.id !== id))
  }

  async function exportSet(id) {
    const [setRow, slots, bridges] = await Promise.all([
      supabase.from('prompt_sets').select('*').eq('id', id).single(),
      supabase.from('prompt_slots').select('*').eq('set_id', id),
      supabase.from('prompt_bridges').select('*').eq('from_set', id),
    ])
    if (setRow.error) { alert(setRow.error.message); return }
    const payload = { set: setRow.data, slots: slots.data || [], bridges: bridges.data || [] }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `promptset-${setRow.data?.name || 'export'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importSet(e) {
    const file = e.target.files?.[0]; if (!file) return
    try {
      const json = JSON.parse(await file.text())
      const { data: newSet, error: setErr } = await supabase.from('prompt_sets')
        .insert({ name: json.set?.name || '가져온 세트', owner_id: userId })
        .select().single()
      if (setErr) throw setErr

      if (json.slots?.length) {
        const rows = json.slots.map(s => ({
          set_id: newSet.id,
          slot_type: s.slot_type ?? 'custom',
          slot_pick: s.slot_pick ?? '1',
          template: s.template ?? ''
        }))
        const ins = await supabase.from('prompt_slots').insert(rows)
        if (ins.error) throw ins.error
      }
      if (json.bridges?.length) {
        const rows = json.bridges.map(b => ({
          from_set: newSet.id,
          from_slot_id: null,
          to_slot_id: null,
          trigger_words: b.trigger_words ?? [],
          action: b.action ?? 'continue'
        }))
        const ins2 = await supabase.from('prompt_bridges').insert(rows)
        if (ins2.error) throw ins2.error
      }
      await refresh(userId)
    } catch (err) {
      alert(err.message || String(err))
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div style={{ padding:20, maxWidth:900, margin:'0 auto' }}>
      <h2 style={{ marginBottom:12 }}>세트 목록</h2>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button onClick={createSet} style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700 }}>+ 새 세트</button>
        <label style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #d1d5db', cursor:'pointer' }}>
          가져오기(JSON)
          <input type="file" accept="application/json" onChange={importSet} style={{ display:'none' }} />
        </label>
      </div>

      <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
        {rows.map(r => (
          <li key={r.id} style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:12, display:'flex', gap:12, alignItems:'center' }}>
            <div style={{ fontWeight:700, flex:1 }}>{r.name}</div>
            <button onClick={()=>router.push(`/maker/${r.id}`)} style={{ padding:'6px 10px', borderRadius:8, background:'#111827', color:'#fff' }}>편집</button>
            <button onClick={()=>exportSet(r.id)} style={{ padding:'6px 10px', borderRadius:8, background:'#0ea5e9', color:'#fff' }}>내보내기</button>
            <button onClick={()=>removeSet(r.id)} style={{ padding:'6px 10px', borderRadius:8, background:'#ef4444', color:'#fff' }}>삭제</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
