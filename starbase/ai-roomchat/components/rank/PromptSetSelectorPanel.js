import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'

export default function PromptSetSelectorPanel({
  value,
  onChange,
  onSelectRow,
  title = '프롬프트 세트',
  height = '60vh',
  manageLabel = '세트 관리로 이동',
  onManageSets,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      let sel = supabase
        .from('prompt_sets')
        .select('id,name,owner_id,created_at')
        .order('created_at', { ascending: false })
      if (user?.id) sel = sel.eq('owner_id', user.id)
      const { data, error } = await sel
      if (!alive) return
      if (!error) {
        setRows((data || []).map((row) => ({ ...row, id: String(row.id) })))
      }
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  const list = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return rows
    return rows.filter((row) => (row.name || '').toLowerCase().includes(key))
  }, [rows, q])

  const handlePick = (id) => {
    const nextId = String(id || '')
    if (typeof onChange === 'function') {
      onChange(nextId)
    }
    if (typeof onSelectRow === 'function') {
      const row = rows.find((item) => item.id === nextId)
      if (row) {
        onSelectRow(row)
      }
    }
  }

  const selectedId = value != null ? String(value) : ''

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {loading ? '불러오는 중…' : `${rows.length}개`}
        </div>
      </div>

      <input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="세트 검색"
        inputMode="search"
        style={{
          padding: '10px 12px',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          background: '#fff',
        }}
      />

      <div
        style={{
          height,
          minHeight: 320,
          maxHeight: 520,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          background: '#fff',
          padding: 10,
          display: 'grid',
          gap: 8,
        }}
      >
        {loading && (
          <div style={{ padding: 8, fontSize: 13, color: '#94a3b8' }}>불러오는 중…</div>
        )}
        {!loading && list.length === 0 && (
          <div style={{ padding: 8, fontSize: 13, color: '#64748b' }}>세트가 없습니다.</div>
        )}

        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 8,
          }}
        >
          {list.map((row) => {
            const isSelected = selectedId === row.id
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => handlePick(row.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 14,
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: isSelected ? '#eff6ff' : '#f8fafc',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 6,
                    transition: 'border-color 0.2s ease, background 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.name || `세트 #${row.id}`}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {typeof onManageSets === 'function' ? (
        <button
          type="button"
          onClick={onManageSets}
          style={{
            justifySelf: 'start',
            padding: '10px 16px',
            borderRadius: 12,
            border: '1px solid #0f172a',
            background: '#0f172a',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.2s ease',
          }}
        >
          {manageLabel}
        </button>
      ) : null}
    </div>
  )
}
