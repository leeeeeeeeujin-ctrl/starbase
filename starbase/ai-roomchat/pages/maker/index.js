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
    const { data, error } = await supabase
      .from('prompt_sets')
      .select('*')
      .eq('owner_id', uid)
      .order('id', { ascending: true }) // created_at 없는 환경 대비
    if (!error) setRows(data || [])
  }

  async function createSet() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('prompt_sets')
      .insert({ name: '새 세트', owner_id: user.id })
      .select().single()
    if (!error && data) router.push(`/maker/${data.id}`)
  }

  async function removeSet(id) {
    if (!confirm('세트를 삭제할까요? (프롬프트/브릿지 포함)')) return
    await supabase.from('prompt_sets').delete().eq('id', id)
    setRows(rows => rows.filter(r => r.id !== id))
  }

  async function exportSet(id) {
    const [setRow, slots, bridges] = await Promise.all([
      supabase.from('prompt_sets').select('*').eq('id', id).single(),
      supabase.from('prompt_slots').select('*').eq('set_id', id),
      supabase.from('prompt_bridges').select('*').eq('from_set', id),
    ])
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
    const text = await file.text()
    const json = JSON.parse(text)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: newSet } = await supabase.from('prompt_sets')
      .insert({ name: json.set?.name || '가져온 세트', owner_id: user.id })
      .select().single()

    if (json.slots?.length) {
      await supabase.from('prompt_slots').insert(
        json.slots.map(s => ({
          set_id: newSet.id,
          slot_type: s.slot_type ?? 'ai',
          slot_pick: s.slot_pick ?? '1',
          template: s.template ?? ''
        }))
      )
    }
    if (json.bridges?.length) {
      await supabase.from('prompt_bridges').insert(
        json.bridges.map(b => ({
          from_set: newSet.id,
          from_slot_id: null,
          to_slot_id: null,
          trigger_words: b.trigger_words ?? [],
          action: b.action ?? 'continue',
          // 새 확장 필드들(없으면 무시되어도 OK)
          conditions: b.conditions ?? [],
          priority: b.priority ?? 0,
          probability: b.probability ?? 1.0,
          fallback: b.fallback ?? false,
        }))
      )
    }
    e.target.value = ''
    await refresh(userId)
  }

  return (
    <div style={{ padding:20, maxWidth:900, margin:'0 auto' }}>
      {/* 상단 툴바 */}
      <div style={{
        position:'sticky', top:0, zIndex:10, background:'#fff',
        display:'flex', alignItems:'center', gap:8,
        padding:'8px 0', borderBottom:'1px solid #e5e7eb'
      }}>
        <h2 style={{ margin:0 }}>세트 목록</h2>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button
            onClick={()=>router.push('/lobby')}
            style={{ padding:'6px 10px', borderRadius:8, background:'#111827', color:'#fff' }}
          >로비로</button>
        </div>
      </div>

      <div style={{ display:'flex', gap:8, margin:'12px 0' }}>
        <button onClick={createSet}
                style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700 }}>
          + 새 세트
        </button>
        <label style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #d1d5db', cursor:'pointer' }}>
          가져오기(JSON)
          <input type="file" accept="application/json" onChange={importSet} style={{ display:'none' }} />
        </label>
      </div>

      <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
        {rows.map(r => (
          <li key={r.id} style={{
            border:'1px solid #e5e7eb', borderRadius:10, padding:12,
            display:'flex', gap:12, alignItems:'center'
          }}>
            <div style={{ fontWeight:700, flex:1 }}>{r.name}</div>
            <button onClick={()=>router.push(`/maker/${r.id}`)}
                    style={{ padding:'6px 10px', borderRadius:8, background:'#111827', color:'#fff' }}>편집</button>
            <button onClick={()=>exportSet(r.id)}
                    style={{ padding:'6px 10px', borderRadius:8, background:'#0ea5e9', color:'#fff' }}>내보내기</button>
            <button onClick={()=>removeSet(r.id)}
                    style={{ padding:'6px 10px', borderRadius:8, background:'#ef4444', color:'#fff' }}>삭제</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
