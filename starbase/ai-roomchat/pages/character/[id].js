// pages/character/[id].js
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

export default function CharacterDetail() {
  const router = useRouter()
  const { id } = router.query
  const [loading, setLoading] = useState(true)
  const [hero, setHero] = useState(null)
  const [edit, setEdit] = useState({ name:'', description:'', ability1:'', ability2:'', ability3:'', ability4:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      const { data, error } = await supabase
        .from('heroes')
        .select('id,name,image_url,description,ability1,ability2,ability3,ability4,owner_id,created_at')
        .eq('id', id).single()
      if (error) { alert('캐릭터를 불러오지 못했습니다.'); router.replace('/roster'); return }
      if (!mounted) return
      setHero(data)
      setEdit({
        name: data.name, description: data.description,
        ability1: data.ability1, ability2: data.ability2,
        ability3: data.ability3, ability4: data.ability4
      })
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [id, router])

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase.from('heroes').update({
        name: edit.name, description: edit.description,
        ability1: edit.ability1, ability2: edit.ability2,
        ability3: edit.ability3, ability4: edit.ability4
      }).eq('id', id)
      if (error) throw error
      alert('저장 완료')
    } catch (e) {
      alert(e.message || e)
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!confirm('정말 삭제할까요? 복구할 수 없습니다.')) return
    const { error } = await supabase.from('heroes').delete().eq('id', id)
    if (error) { alert(error.message); return }
    router.replace('/roster')
  }

  if (loading) return <div style={{ padding:20 }}>불러오는 중…</div>
  if (!hero) return null

  return (
    <div style={{ padding:20, maxWidth:1000, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <Link href="/roster"><a>← 내 로스터</a></Link>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={save} disabled={saving}
                  style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700 }}>
            {saving ? '저장 중…' : '저장'}
          </button>
          <button onClick={remove}
                  style={{ padding:'8px 12px', borderRadius:8, background:'#ef4444', color:'#fff', fontWeight:700 }}>
            삭제
          </button>
          <Link href={`/lobby?heroId=${hero.id}`}><a
            style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff', fontWeight:700 }}>
            로비로 입장
          </a></Link>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:20 }}>
        <div>
          <div style={{ width:'100%', aspectRatio:'1/1', background:'#f1f5f9', borderRadius:12, overflow:'hidden', border:'1px solid #e5e7eb' }}>
            {hero.image_url ? <img src={hero.image_url} alt={hero.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
          </div>
        </div>
        <div>
          <label>이름</label>
          <input value={edit.name} onChange={e=>setEdit(s=>({...s, name:e.target.value}))}
                 style={{ display:'block', width:'100%', padding:10, margin:'4px 0 12px', border:'1px solid #d1d5db', borderRadius:8 }} />
          <label>설명</label>
          <textarea value={edit.description} onChange={e=>setEdit(s=>({...s, description:e.target.value}))}
                    style={{ display:'block', width:'100%', padding:10, height:120, margin:'4px 0 12px', border:'1px solid #d1d5db', borderRadius:8 }} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <input placeholder="능력1" value={edit.ability1} onChange={e=>setEdit(s=>({...s, ability1:e.target.value}))} style={{ padding:10, border:'1px solid #d1d5db', borderRadius:8 }} />
            <input placeholder="능력2" value={edit.ability2} onChange={e=>setEdit(s=>({...s, ability2:e.target.value}))} style={{ padding:10, border:'1px solid #d1d5db', borderRadius:8 }} />
            <input placeholder="능력3" value={edit.ability3} onChange={e=>setEdit(s=>({...s, ability3:e.target.value}))} style={{ padding:10, border:'1px solid #d1d5db', borderRadius:8 }} />
            <input placeholder="능력4" value={edit.ability4} onChange={e=>setEdit(s=>({...s, ability4:e.target.value}))} style={{ padding:10, border:'1px solid #d1d5db', borderRadius:8 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
