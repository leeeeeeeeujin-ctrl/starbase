// components/rank/GameListPanel.js
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { DEFAULT_SORT_KEY, METRIC_SORT_KEYS } from '../lobby/constants'
import { isMissingColumnError } from '../../lib/supabaseErrors'

const SORTS = [
  { key:'latest',   label:'최신순',     order:[{col:'created_at', asc:false}] },
  { key:'name',     label:'이름순',     order:[{col:'name', asc:true}] },
  { key:'likes',    label:'좋아요순',   order:[{col:'likes_count', asc:false}, {col:'created_at', asc:false}] },
  { key:'plays',    label:'게임횟수순', order:[{col:'play_count',  asc:false}, {col:'created_at', asc:false}] },
]

export default function GameListPanel(){
  const router = useRouter()
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('latest')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [supportsMetrics, setSupportsMetrics] = useState(true)
  const [sortOptions, setSortOptions] = useState(() => SORTS)
  const LIMIT = 30
  const sentinelRef = useRef(null)

  const sortPlan = useMemo(() => (SORTS.find((s) => s.key === sortKey) || SORTS[0]), [sortKey])

  useEffect(() => {
    const nextOptions = supportsMetrics ? SORTS : SORTS.filter((option) => !METRIC_SORT_KEYS.has(option.key))
    setSortOptions(nextOptions)
    setSortKey((current) => {
      if (nextOptions.some((option) => option.key === current)) {
        return current
      }
      return nextOptions[0]?.key || DEFAULT_SORT_KEY
    })
  }, [supportsMetrics])

  // 검색어 디바운스
  const [debouncedQ, setDebouncedQ] = useState(q)
  useEffect(()=>{
    const t = setTimeout(()=>setDebouncedQ(q), 250)
    return ()=>clearTimeout(t)
  }, [q])

  // 조건 바뀌면 리셋
  useEffect(()=>{
    setRows([]); setPage(0); setHasMore(true)
  }, [debouncedQ, sortKey])

  // 페이지 로드
  useEffect(()=>{
    if (!hasMore || loading) return
    ;(async()=>{
      setLoading(true)
      const selectColumns = supportsMetrics
        ? 'id,name,description,image_url,created_at,likes_count,play_count'
        : 'id,name,description,image_url,created_at'
      let sel = supabase.from('rank_games')
        .select(selectColumns, { count:'exact' })

      if (debouncedQ.trim()){
        const qq = `%${debouncedQ.trim()}%`
        sel = sel.or(`name.ilike.${qq},description.ilike.${qq}`)
      }

      for (const o of sortPlan.order) sel = sel.order(o.col, { ascending:o.asc })

      const from = page * LIMIT, to = from + LIMIT - 1
      sel = sel.range(from, to)

      let { data, error, count } = await sel

      if (error && supportsMetrics && isMissingColumnError(error, ['likes_count', 'play_count'])) {
        setSupportsMetrics(false)

        const fallback = supabase
          .from('rank_games')
          .select('id,name,description,image_url,created_at', { count: 'exact' })

        if (debouncedQ.trim()) {
          const qq = `%${debouncedQ.trim()}%`
          fallback.or(`name.ilike.${qq},description.ilike.${qq}`)
        }

        fallback.order('created_at', { ascending: false })

        fallback.range(from, to)
        const fallbackResult = await fallback
        data = fallbackResult.data
        error = fallbackResult.error
        count = fallbackResult.count

        if (METRIC_SORT_KEYS.has(sortKey)) {
          setSortKey(DEFAULT_SORT_KEY)
        }
      }

      if (error) { console.error(error); setLoading(false); return }
      setRows(prev => [...prev, ...(data||[])])
      const total = count ?? 0
      setHasMore((from + (data?.length||0)) < total)
      setLoading(false)
    })()
  }, [page, debouncedQ, sortPlan, hasMore, loading, supportsMetrics, sortKey])

  // 인피니트 스크롤
  useEffect(()=>{
    const root = document.querySelector('#gameListScrollRoot')
    const el = sentinelRef.current
    if (!el || !root) return
    const io = new IntersectionObserver((ents)=>{
      ents.forEach(e=>{
        if (e.isIntersecting && hasMore && !loading) setPage(p=>p+1)
      })
    }, { root, threshold:0.1 })
    io.observe(el)
    return ()=>io.disconnect()
  }, [hasMore, loading, rows.length])

  function go(id){ router.push(`/rank/${id}`) }

  return (
    <div style={{ display:'grid', gap:8 }}>
      {/* 상단 컨트롤 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:8 }}>
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="게임 검색(이름/설명)"
          inputMode="search"
          style={{ padding:'10px 12px', border:'1px solid #e5e7eb', borderRadius:10 }}
        />
        <select
          value={sortKey}
          onChange={e=>setSortKey(e.target.value)}
          style={{ padding:'10px 12px', border:'1px solid #e5e7eb', borderRadius:10 }}
        >
          {sortOptions.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* 고정 높이 스크롤 박스 (모바일 세로 최적화) */}
      <div
        id="gameListScrollRoot"
        style={{
          height:'60vh', minHeight:380, maxHeight:560,
          overflowY:'auto', WebkitOverflowScrolling:'touch',
          border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:8
        }}
      >
        <ul style={{ listStyle:'none', margin:0, padding:0, display:'grid', gap:8 }}>
          {rows.map(g=>(
            <li key={g.id}>
              <button
                onClick={()=>go(g.id)}
                style={{
                  width:'100%', textAlign:'left',
                  display:'grid', gridTemplateColumns:'64px 1fr auto', gap:10, alignItems:'center',
                  padding:8, border:'1px solid #eef2f7', borderRadius:12, background:'#fafafa'
                }}
              >
                <div style={{ width:64, height:64, borderRadius:10, overflow:'hidden', background:'#e5e7eb' }}>
                  {g.image_url
                    ? <img alt="" src={g.image_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : null}
                </div>
                <div>
                  <div style={{ fontWeight:700, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {g.name}
                  </div>
                  <div style={{ fontSize:12, color:'#64748b', display:'flex', gap:8 }}>
                    <span>좋아요 {g.likes_count ?? 0}</span>
                    <span>게임횟수 {g.play_count ?? 0}</span>
                  </div>
                </div>
                <div style={{ fontSize:12, color:'#94a3b8' }}>
                  {new Date(g.created_at).toLocaleDateString()}
                </div>
              </button>
            </li>
          ))}
        </ul>

        <div ref={sentinelRef} style={{ height:1 }} />
        {loading && <div style={{ padding:8, fontSize:12, color:'#94a3b8' }}>불러오는 중…</div>}
        {!loading && rows.length===0 && <div style={{ padding:8, color:'#64748b' }}>검색 결과가 없습니다.</div>}
      </div>
    </div>
  )
}
