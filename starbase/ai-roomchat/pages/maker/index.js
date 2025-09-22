// pages/maker/index.js
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

/**
 * 프롬프트 세트 목록 페이지
 * - 목록 조회 / 검색 / 정렬
 * - 세트 생성 / 삭제
 * - JSON 내보내기 / 가져오기
 * - 상단 네비(로비, 랭킹, 로스터)
 */
export default function MakerList() {
  const router = useRouter()
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  // 검색/정렬 UI
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('created_desc') // created_desc | name_asc | name_desc

  useEffect(() => {
    ;(async () => {
      // 로그인 확인
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) { router.replace('/'); return }
      setUserId(user.id)
      await refresh(user.id)
      setLoading(false)
    })()
  }, [router])

  async function refresh(uid) {
    // created_at 없을 수도 있어 id 기준 정렬 fallback
    const { data, error } = await supabase
      .from('prompt_sets')
      .select('*')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false })
    if (!error) setRows(data || [])
  }

  // 클라이언트 정렬/검색
  const filtered = useMemo(() => {
    const key = (q || '').trim().toLowerCase()
    let list = rows
    if (key) {
      list = list.filter(r =>
        (r.name || '').toLowerCase().includes(key) ||
        (r.description || '').toLowerCase().includes(key)
      )
    }
    if (sort === 'name_asc') list = [...list].sort((a,b)=>(a.name||'').localeCompare(b.name||''))
    else if (sort === 'name_desc') list = [...list].sort((a,b)=>(b.name||'').localeCompare(a.name||''))
    else list = [...list].sort((a,b)=>(new Date(b.created_at||0))-(new Date(a.created_at||0)))
    return list
  }, [rows, q, sort])

  async function createSet() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('로그인이 필요합니다.'); return }
    const { data, error } = await supabase
      .from('prompt_sets')
      .insert({ name: '새 세트', owner_id: user.id, description: '' })
      .select()
      .single()
    if (error) { alert(error.message); return }
    router.push(`/maker/${data.id}`)
  }

  async function removeSet(id) {
    if (!confirm('세트를 삭제할까요? (프롬프트/브릿지 포함)')) return
    // bridges → slots → set 순서로 정리 (RLS 환경 고려)
    await supabase.from('prompt_bridges').delete().eq('from_set', id)
    await supabase.from('prompt_slots').delete().eq('set_id', id)
    await supabase.from('prompt_sets').delete().eq('id', id)
    setRows(list => list.filter(r => r.id !== id))
  }

  async function exportSet(id) {
    const [setRow, slots, bridges] = await Promise.all([
      supabase.from('prompt_sets').select('*').eq('id', id).single(),
      supabase.from('prompt_slots').select('*').eq('set_id', id),
      supabase.from('prompt_bridges').select('*').eq('from_set', id),
    ])
    const payload = {
      set: setRow.data,
      slots: slots.data || [],
      bridges: bridges.data || []
    }
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
      const text = await file.text()
      const json = JSON.parse(text)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('로그인이 필요합니다.'); return }

      // 1) 새 set 생성
      const { data: newSet, error: eSet } = await supabase
        .from('prompt_sets')
        .insert({
          name: json.set?.name || '가져온 세트',
          description: json.set?.description || '',
          owner_id: user.id
        })
        .select()
        .single()
      if (eSet) throw eSet

      // 2) slots 복원 (필드 유실 대비 기본값)
      if (Array.isArray(json.slots) && json.slots.length) {
        const safeSlots = json.slots.map(s => ({
          set_id: newSet.id,
          slot_no: s.slot_no ?? null,
          slot_type: s.slot_type ?? 'ai',
          slot_pick: s.slot_pick ?? '1',
          template: s.template ?? '',
          transform_code: s.transform_code ?? '',
          visible_roles: s.visible_roles ?? null,
          is_global: !!s.is_global,
          is_start: !!s.is_start,
        }))
        await supabase.from('prompt_slots').insert(safeSlots)
      }

      // 3) bridges 복원 (연결 id는 새로 매핑해야 해서 from/to는 비워둠)
      if (Array.isArray(json.bridges) && json.bridges.length) {
        const safeBr = json.bridges.map(b => ({
          from_set: newSet.id,
          from_slot_id: null,
          to_slot_id: null,
          trigger_words: b.trigger_words ?? [],
          action: b.action ?? 'continue',
          conditions: b.conditions ?? [],
          priority: b.priority ?? 0,
          probability: b.probability ?? 1.0,
          fallback: !!b.fallback,
        }))
        await supabase.from('prompt_bridges').insert(safeBr)
      }

      e.target.value = ''
      await refresh(userId)
      alert('가져오기 완료. 연결은 편집 화면에서 다시 지정하세요.')
    } catch (err) {
      console.error(err)
      alert('가져오기 실패: ' + (err?.message || err))
    }
  }

  if (loading) {
    return <div style={{ padding:20 }}>불러오는 중…</div>
  }

  return (
    <div style={{ maxWidth:1100, margin:'20px auto', padding:'0 12px', display:'grid', gridTemplateRows:'auto auto 1fr', gap:12 }}>
      {/* 상단 네비게이션 */}
      <div style={{ display:'flex', gap:8, alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <h2 style={{ margin:0 }}>프롬프트 세트</h2>
          <span style={{ color:'#64748b' }}>만들고, 불러오고, 편집하세요</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Link href="/lobby"><a className="btn-secondary">로비</a></Link>
          <Link href="/rank"><a className="btn-secondary">랭킹 허브</a></Link>
          <Link href="/roster"><a className="btn-secondary">로스터</a></Link>
        </div>
      </div>

      {/* 툴바 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:8 }}>
        <div style={{ display:'flex', gap:8 }}>
          <input
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder="세트 이름/설명 검색…"
            style={{ flex:1, padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8 }}
          />
          <select
            value={sort}
            onChange={e=>setSort(e.target.value)}
            style={{ padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8 }}
          >
            <option value="created_desc">최신 생성순</option>
            <option value="name_asc">이름 오름차순</option>
            <option value="name_desc">이름 내림차순</option>
          </select>
        </div>

        <button onClick={createSet} className="btn-primary">+ 새 세트</button>

        <label className="btn-ghost" style={{ cursor:'pointer' }}>
          가져오기(JSON)
          <input type="file" accept="application/json" onChange={importSet} style={{ display:'none' }} />
        </label>

        <button onClick={()=>refresh(userId)} className="btn-ghost">↻ 새로고침</button>
      </div>

      {/* 목록 */}
      <div style={{ display:'grid', gap:10 }}>
        {filtered.map(r => (
          <div key={r.id} style={{
            border:'1px solid #e5e7eb', borderRadius:12, padding:12,
            display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:8, alignItems:'center', background:'#fff'
          }}>
            <div>
              <div style={{ fontWeight:700 }}>{r.name || '(이름 없음)'}</div>
              <div style={{ color:'#64748b', fontSize:13, marginTop:4 }}>
                {r.description || '설명 없음'}
              </div>
              <div style={{ color:'#94a3b8', fontSize:12, marginTop:4 }}>
                {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
              </div>
            </div>
            <Link href={`/maker/${r.id}`}><a className="btn-dark">편집</a></Link>
            <button onClick={()=>exportSet(r.id)} className="btn-info">내보내기</button>
            <button onClick={()=>removeSet(r.id)} className="btn-danger">삭제</button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color:'#64748b', padding:'24px 0' }}>세트가 없습니다. “+ 새 세트”로 시작해 보세요.</div>
        )}
      </div>

      {/* 간단 스타일 */}
      <style jsx>{`
        .btn-primary {
          padding: 8px 12px; border-radius: 8px;
          background:#2563eb; color:#fff; font-weight:700; border:none;
        }
        .btn-secondary {
          padding: 8px 12px; border-radius: 8px;
          background:#f3f4f6; color:#111827; font-weight:600; border:1px solid #e5e7eb;
        }
        .btn-ghost {
          padding: 8px 12px; border-radius: 8px;
          background:#fff; color:#111827; font-weight:600; border:1px solid #e5e7eb;
        }
        .btn-dark {
          padding: 8px 12px; border-radius: 8px;
          background:#111827; color:#fff; font-weight:700; border:none; text-align:center;
        }
        .btn-info {
          padding: 8px 12px; border-radius: 8px;
          background:#0ea5e9; color:#fff; font-weight:700; border:none;
        }
        .btn-danger {
          padding: 8px 12px; border-radius: 8px;
          background:#ef4444; color:#fff; font-weight:700; border:none;
        }
      `}</style>
    </div>
  )
}
