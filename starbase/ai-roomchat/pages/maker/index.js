// pages/maker/index.js
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function MakerList() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])

  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      setUserId(user.id)
      await refresh(user.id)
    })()
  }, [router])

  async function refresh(uid) {
    setLoading(true)
    const { data, error } = await supabase
      .from('prompt_sets')
      .select('*')
      .eq('owner_id', uid)
      .order('updated_at', { ascending: false })
    if (!error) setRows(data || [])
    setLoading(false)
  }

  async function createSet() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('prompt_sets')
      .insert({ name: '새 세트', owner_id: user.id })
      .select()
      .single()
    if (!error && data) router.push(`/maker/${data.id}`)
  }

  async function removeSet(id) {
    if (!confirm('세트를 삭제할까요? (프롬프트/브릿지 포함)')) return
    await supabase.from('prompt_sets').delete().eq('id', id)
    setRows(rows => rows.filter(r => r.id !== id))
  }

  async function renameSet(id, name) {
    const newName = prompt('세트 이름을 입력하세요', name || '')
    if (newName == null) return
    const { error } = await supabase.from('prompt_sets').update({ name: newName }).eq('id', id)
    if (!error) setRows(rs => rs.map(r => r.id === id ? { ...r, name: newName } : r))
  }

  async function exportSet(id) {
    const [setRow, slots, bridges] = await Promise.all([
      supabase.from('prompt_sets').select('*').eq('id', id).single(),
      supabase.from('prompt_slots').select('*').eq('set_id', id).order('slot_no'),
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
    const { data: newSet } = await supabase
      .from('prompt_sets')
      .insert({ name: json.set?.name || '가져온 세트', owner_id: user.id })
      .select()
      .single()

    if (json.slots?.length) {
      await supabase.from('prompt_slots').insert(
        json.slots.map(s => ({
          set_id: newSet.id,
          slot_no: s.slot_no ?? 1,
          slot_type: s.slot_type ?? 'ai',
          slot_pick: s.slot_pick ?? '1',
          template: s.template ?? '',
          is_start: !!s.is_start,
          invisible: !!s.invisible,
          var_rules_global: s.var_rules_global ?? [],
          var_rules_local: s.var_rules_local ?? [],
        }))
      )
    }
    if (json.bridges?.length) {
      await supabase.from('prompt_bridges').insert(
        json.bridges.map(b => ({
          from_set: newSet.id,
          from_slot_id: null, // 연결은 에디터에서 재지정
          to_slot_id: null,
          trigger_words: b.trigger_words ?? [],
          conditions: b.conditions ?? [],
          priority: b.priority ?? 0,
          probability: b.probability ?? 1.0,
          fallback: b.fallback ?? false,
          action: b.action ?? 'continue',
        }))
      )
    }
    e.target.value = ''
    await refresh(userId)
  }

  return (
    <div style={{ maxWidth: 960, margin: '24px auto', padding: 12, display: 'grid', gap: 16 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h2 style={{ margin: 0 }}>세트 목록</h2>
          <span style={{ color: '#64748b' }}>프롬프트 세트를 관리합니다</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={createSet} style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 700 }}>+ 새 세트</button>
          <label style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', cursor: 'pointer' }}>
            가져오기(JSON)
            <input type="file" accept="application/json" onChange={importSet} style={{ display: 'none' }} />
          </label>
          <Link href="/rank" legacyBehavior>
            <a style={{ padding: '8px 12px', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700 }}>랭킹 허브</a>
          </Link>
        </div>
      </div>

      {/* 목록 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 160px 260px',
          gap: 8, padding: 10,
          background: '#f8fafc', color: '#475569', fontWeight: 600
        }}>
          <div>이름</div>
          <div>업데이트</div>
          <div style={{ textAlign: 'right' }}>동작</div>
        </div>

        {loading && <div style={{ padding: 16, color: '#64748b' }}>불러오는 중…</div>}

        {!loading && rows.length === 0 && (
          <div style={{ padding: 16, color: '#64748b' }}>아직 세트가 없습니다. “+ 새 세트”로 시작하세요.</div>
        )}

        {!loading && rows.map(r => (
          <div key={r.id} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 160px 260px',
            gap: 8, padding: 10, alignItems: 'center',
            borderTop: '1px solid #eef2f7'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700 }}>{r.name}</span>
              <button onClick={() => renameSet(r.id, r.name)} style={{ padding: '4px 8px', fontSize: 12 }}>이름 변경</button>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {r.updated_at ? new Date(r.updated_at).toLocaleString() : (r.created_at ? new Date(r.created_at).toLocaleString() : '-')}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => router.push(`/maker/${r.id}`)} style={{ padding: '6px 10px', borderRadius: 8, background: '#111827', color: '#fff' }}>
                편집
              </button>
              <button onClick={() => exportSet(r.id)} style={{ padding: '6px 10px', borderRadius: 8, background: '#0ea5e9', color: '#fff' }}>
                내보내기
              </button>
              <button onClick={() => removeSet(r.id)} style={{ padding: '6px 10px', borderRadius: 8, background: '#ef4444', color: '#fff' }}>
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
