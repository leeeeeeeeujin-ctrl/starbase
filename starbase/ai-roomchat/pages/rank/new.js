// pages/rank/new.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import PromptSetPicker from '../../components/rank/PromptSetPicker'
import SlotMatrix from '../../components/rank/SlotMatrix'
import { uploadGameImage } from '../../lib/rank/storage'

async function registerGame(payload) {
  const r = await fetch('/api/rank/register-game', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  })
  return r.json()
}

export default function RankNew() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [imgFile, setImgFile] = useState(null)
  const [setId, setSetId] = useState('')
  const [slotMap, setSlotMap] = useState([])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      setUser(user)
    })()
  }, [router])

  async function onSubmit() {
    if (!user) return alert('로그인이 필요합니다.')
    if (!setId) return alert('프롬프트 세트를 선택하세요.')
    const active = (slotMap||[]).filter(s => s.active && s.role.trim())
    if (!active.length) return alert('최소 1개의 슬롯을 활성화하고 역할을 지정하세요.')

    let image_url = ''
    if (imgFile) {
      try { image_url = (await uploadGameImage(imgFile)).url } catch (e) { return alert('이미지 업로드 실패: ' + (e?.message || e)) }
    }

    const res = await registerGame({
      name: name || '새 게임',
      description: desc || '',
      image_url,
      prompt_set_id: setId,
      roles: active.map(s => ({ name:s.role, slot_count:1 })),
    })
    if (!res.ok) return alert('게임 등록 실패: ' + (res.error || 'unknown'))

    const gameId = res.gameId
    const payload = active.map(s => ({ game_id: gameId, slot_index: s.slot_index, role: s.role, active: true }))
    await supabase.from('rank_game_slots').upsert(payload, { onConflict:'game_id,slot_index' })

    alert('등록 완료')
    router.replace(`/rank/${gameId}`)
  }

  return (
    <div style={{ maxWidth:900, margin:'24px auto', padding:12, display:'grid', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h2 style={{ margin:0 }}>게임 등록</h2>
        <button onClick={()=>router.back()} style={{ padding:'6px 10px' }}>← 뒤로</button>
      </div>

      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12, display:'grid', gap:8 }}>
        <input placeholder="게임 이름" value={name} onChange={e=>setName(e.target.value)} />
        <textarea placeholder="설명" rows={3} value={desc} onChange={e=>setDesc(e.target.value)} />
        <PromptSetPicker value={setId} onChange={setSetId} />
        <label>대표 이미지(선택)
          <input type="file" accept="image/*" onChange={e=>setImgFile(e.target.files?.[0] || null)} />
        </label>
        <div>
          <div style={{ fontSize:12, color:'#475569', marginBottom:4 }}>슬롯 활성화/역할 지정</div>
          <SlotMatrix value={slotMap} onChange={setSlotMap} />
        </div>
        <button onClick={onSubmit} style={{ padding:'10px 12px', borderRadius:8, background:'#111827', color:'#fff', fontWeight:700 }}>
          등록
        </button>
      </div>
    </div>
  )
}
