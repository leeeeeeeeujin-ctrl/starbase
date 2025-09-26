// pages/rank/new.js
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

// 클라이언트에서만 로드 (SSR 끔) — 기존 유지
const RankNewClient = dynamic(() => import('../../components/rank/RankNewClient'), {
  ssr: false,
})

/** ─────────────────────────────────────────────
 *  이 파일 안에만 만든 간단 세트 선택 패널
 *  - 내 세트만 표시 (owner_id = me)
 *  - 검색 가능
 *  - 스크롤 패널(모바일 터치/휠)
 *  - 선택 시 onChange(String(id))
 *  ───────────────────────────────────────────── */
function PromptSetSelectorPanel({
  value,            // string | ''
  onChange,         // (id:string)=>void
  title = '프롬프트 세트',
  height = '60vh',
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      let sel = supabase
        .from('prompt_sets')
        .select('id,name,owner_id,created_at')
        .order('id', { ascending: false })
      if (user?.id) sel = sel.eq('owner_id', user.id)
      const { data, error } = await sel
      if (!alive) return
      if (!error) {
        setRows((data || []).map(r => ({ ...r, id: String(r.id) }))) // id 문자열화
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const list = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return rows
    return rows.filter(r => (r.name || '').toLowerCase().includes(key))
  }, [rows, q])

  return (
    <div style={{ display:'grid', gap:8 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div style={{ fontWeight:800 }}>{title}</div>
        <div style={{ fontSize:12, color:'#64748b' }}>{rows.length}개</div>
      </div>

      <input
        value={q}
        onChange={e=>setQ(e.target.value)}
        placeholder="세트 검색"
        inputMode="search"
        style={{ padding:'10px 12px', border:'1px solid #e5e7eb', borderRadius:10 }}
      />

      <div
        style={{
          height, minHeight:360, maxHeight:560, overflowY:'auto', WebkitOverflowScrolling:'touch',
          border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:8
        }}
      >
        {loading && <div style={{ padding:8, fontSize:12, color:'#94a3b8' }}>불러오는 중…</div>}
        {!loading && list.length === 0 && (
          <div style={{ padding:8, fontSize:12, color:'#64748b' }}>세트가 없습니다.</div>
        )}

        <ul style={{ listStyle:'none', margin:0, padding:0, display:'grid', gap:8 }}>
          {list.map(r => {
            const isSel = value != null && String(value) === r.id
            return (
              <li key={r.id}>
                <button
                  onClick={()=>typeof onChange === 'function' && onChange(r.id)}
                  style={{
                    width:'100%', textAlign:'left',
                    padding:10, borderRadius:12,
                    border: isSel ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: isSel ? '#eff6ff' : '#fafafa', cursor:'pointer',
                    display:'grid', gap:4
                  }}
                >
                  <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {r.name || `세트 #${r.id}`}
                  </div>
                  <div style={{ fontSize:12, color:'#94a3b8' }}>
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/** ─────────────────────────────────────────────
 *  페이지: 기존 RankNewClient 왼쪽 + 세트 선택 패널 오른쪽
 *  - 선택 시 URL 쿼리 ?setId=... 로 동기화 (shallow)
 *  - RankNewClient는 수정하지 않음 (필요하면 쿼리 읽어 사용)
 *  ───────────────────────────────────────────── */
function RankNewPageWithSelector() {
  const router = useRouter()
  const init = typeof router.query?.setId === 'string' ? router.query.setId : ''
  const [setId, setSetId] = useState(init)

  // 쿼리 변경 → state 반영 (뒤/앞 이동 호환)
  useEffect(() => {
    const qVal = typeof router.query?.setId === 'string' ? router.query.setId : ''
    if (qVal !== setId) setSetId(qVal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query?.setId])

  // 선택 → 쿼리 반영 (shallow, 페이지 리로드 없음)
  function handlePick(id) {
    const val = String(id || '')
    setSetId(val)
    router.replace(
      { pathname: router.pathname, query: val ? { ...router.query, setId: val } : { ...router.query, setId: undefined } },
      undefined,
      { shallow: true }
    )
  }

  return (
    <div style={{ maxWidth:1200, margin:'24px auto', padding:12, display:'grid', gridTemplateColumns:'1fr 340px', gap:12 }}>
      {/* 왼쪽: 기존 클라이언트 편집기 (수정하지 않음) */}
      <div>
        <RankNewClient />
      </div>

      {/* 오른쪽: 세트 선택 패널 (이 파일 안에서만 추가) */}
      <div>
        <PromptSetSelectorPanel
          value={setId}
          onChange={handlePick}
          title="프롬프트 세트 선택"
          height="60vh"
        />
      </div>
    </div>
  )
}

export default function Page() {
  return <RankNewPageWithSelector />
}
