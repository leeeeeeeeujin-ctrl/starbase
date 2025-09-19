// pages/create.js
import React, { useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function Create() {
  const router = useRouter()
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [blob, setBlob] = useState(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [ability1, setAbility1] = useState('')
  const [ability2, setAbility2] = useState('')
  const [ability3, setAbility3] = useState('')
  const [ability4, setAbility4] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleFile(f) {
    const b = await f.arrayBuffer()
    const bb = new Blob([new Uint8Array(b)], { type: f.type })
    setBlob(bb)
    setPreview(URL.createObjectURL(bb))
  }

  async function save() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('로그인이 필요합니다.'); setLoading(false); return }

      let image_url = null
      if (blob) {
        const path = `heroes/${Date.now()}-${name.replace(/\W+/g,'-')}.jpg`
        const { error: upErr } = await supabase.storage.from('heroes').upload(path, blob, { upsert: true })
        if (upErr) throw upErr
        image_url = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl
      }

      const { error: insErr } = await supabase.from('heroes').insert({
        owner_id: user.id,
        name, description: desc,
        ability1, ability2, ability3, ability4,
        image_url
      })
      if (insErr) throw insErr

      // ✅ 저장 완료 → 로스터로 이동
      router.replace('/roster')
    } catch (e) {
      alert('저장 실패: ' + (e.message || e))
    } finally { setLoading(false) }
  }

  return (
    <div style={{ padding:20, maxWidth:720, margin:'0 auto' }}>
      {/* 상단 바: 뒤로가기 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <button
          onClick={() => router.back()}
          style={{ padding:'8px 12px', borderRadius:8, background:'#e5e7eb', fontWeight:600 }}
          title="로스터로 돌아가기"
        >
          ← 로스터로
        </button>
        <div style={{ fontSize:18, fontWeight:700 }}>캐릭터 생성</div>
        <div style={{ width:96 }} /> {/* 자리 맞춤 */}
      </div>

      <div style={{ marginBottom:8 }}>
        {preview ? <img src={preview} alt="" style={{ width:240, height:240, objectFit:'cover', borderRadius:12, border:'1px solid #e5e7eb' }} />
                 : <div style={{ width:240, height:240, background:'#eee', borderRadius:12 }} />}
      </div>
      <input type="file" accept="image/*" ref={fileRef}
             onChange={(e)=>{ const f=e.target.files?.[0]; if(f) handleFile(f) }}
             style={{ display:'block', marginBottom:8 }} />

      <input placeholder="이름" value={name} onChange={e=>setName(e.target.value)}
             style={{ display:'block', width:'100%', padding:10, marginBottom:8 }} />
      <textarea placeholder="설명" value={desc} onChange={e=>setDesc(e.target.value)}
                style={{ display:'block', width:'100%', padding:10, height:120, marginBottom:8 }} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <input placeholder="능력1" value={ability1} onChange={e=>setAbility1(e.target.value)} style={{ padding:10 }} />
        <input placeholder="능력2" value={ability2} onChange={e=>setAbility2(e.target.value)} style={{ padding:10 }} />
        <input placeholder="능력3" value={ability3} onChange={e=>setAbility3(e.target.value)} style={{ padding:10 }} />
        <input placeholder="능력4" value={ability4} onChange={e=>setAbility4(e.target.value)} style={{ padding:10 }} />
      </div>

      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <button onClick={save} disabled={loading}
                style={{ padding:'10px 16px', background:'#2563eb', color:'#fff', borderRadius:8, fontWeight:700 }}>
          {loading ? '저장 중…' : '저장'}
        </button>
        <button onClick={() => router.back()}
                style={{ padding:'10px 16px', background:'#e5e7eb', borderRadius:8, fontWeight:600 }}>
          취소
        </button>
      </div>
    </div>
  )
}
