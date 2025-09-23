'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'

const SharedChatDock = dynamic(() => import('../../components/common/SharedChatDock'), { ssr: false })

export default function MakerList() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [savingName, setSavingName] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!mounted) return

    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const user = data?.user
      if (!alive) return

      if (!user) {
        router.replace('/')
        return
      }

      setUserId(user.id)
      await refresh(user.id)
    })()

    return () => { alive = false }
  }, [mounted, router])

  if (!mounted) return null

  async function refresh(uid) {
    const targetId = uid || userId
    if (!targetId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('prompt_sets')
      .select('*')
      .eq('owner_id', targetId)
      .order('updated_at', { ascending: false })

    if (!error) {
      setRows(data || [])
    }
    setLoading(false)
  }

  async function createSet() {
    const { data } = await supabase.auth.getUser()
    const user = data?.user
    if (!user) return

    const { data: newRow, error } = await supabase
      .from('prompt_sets')
      .insert({ name: '새 세트', owner_id: user.id })
      .select()
      .single()

    if (!error && newRow) {
      router.push(`/maker/${newRow.id}`)
    }
  }

  async function removeSet(id) {
    if (!confirm('세트를 삭제할까요? (프롬프트/브릿지 포함)')) return
    const { error } = await supabase.from('prompt_sets').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  function beginRename(row) {
    setEditingId(row.id)
    setEditingName(row.name ?? '')
  }

  function cancelRename() {
    setEditingId(null)
    setEditingName('')
    setSavingName(false)
  }

  async function submitRename(e) {
    e.preventDefault()
    if (!editingId) return

    const nextName = editingName.trim()
    if (!nextName) {
      alert('세트 이름을 입력하세요.')
      return
    }

    setSavingName(true)
    const { error } = await supabase
      .from('prompt_sets')
      .update({ name: nextName })
      .eq('id', editingId)

    setSavingName(false)

    if (error) {
      alert(error.message)
      return
    }

    setRows((prev) => prev.map((r) => (r.id === editingId ? { ...r, name: nextName } : r)))
    cancelRename()
  }

  async function exportSet(id) {
    const [setRow, slots, bridges] = await Promise.all([
      supabase.from('prompt_sets').select('*').eq('id', id).single(),
      supabase.from('prompt_slots').select('*').eq('set_id', id).order('slot_no'),
      supabase.from('prompt_bridges').select('*').eq('from_set', id),
    ])

    const payload = {
      set: setRow.data,
      slots: slots.data || [],
      bridges: bridges.data || [],
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `promptset-${setRow.data?.name || 'export'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importSet(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const json = JSON.parse(text)
    const { data } = await supabase.auth.getUser()
    const user = data?.user
    if (!user) return

    const { data: newSet } = await supabase
      .from('prompt_sets')
      .insert({ name: json.set?.name || '가져온 세트', owner_id: user.id })
      .select()
      .single()

    if (!newSet) return

    if (json.slots?.length) {
      await supabase.from('prompt_slots').insert(
        json.slots.map((s) => ({
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
        json.bridges.map((b) => ({
          from_set: newSet.id,
          from_slot_id: null,
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

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/rank')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '32px 16px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={goBack}
            style={{
              border: '1px solid #cbd5f5',
              background: '#e2e8f0',
              color: '#0f172a',
              borderRadius: 999,
              padding: '8px 14px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
            }}
          >
            ← 뒤로가기
          </button>
          <div style={{ flex: '1 1 320px', minWidth: 260 }}>
            <h1 style={{ margin: 0, fontSize: 28, color: '#0f172a' }}>프롬프트 메이커</h1>
            <p style={{ margin: '6px 0 0', color: '#475569' }}>
              내가 만든 프롬프트 세트를 모아 빠르게 편집하고 공유 채팅으로 팀과 소통할 수 있어요.
            </p>
          </div>
          <button
            onClick={createSet}
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              boxShadow: '0 12px 30px -12px rgba(37, 99, 235, 0.75)',
            }}
          >
            + 새 세트
          </button>
        </header>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <label
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              border: '1px dashed #94a3b8',
              background: '#f8fafc',
              cursor: 'pointer',
              color: '#0f172a',
              fontWeight: 600,
            }}
          >
            JSON 가져오기
            <input type="file" accept="application/json" onChange={importSet} style={{ display: 'none' }} />
          </label>
          <button
            onClick={() => router.push('/rank')}
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              border: '1px solid #0f172a',
              background: '#0f172a',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            랭킹 허브로 이동
          </button>
          <button
            onClick={() => refresh()}
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              border: '1px solid #cbd5f5',
              background: '#fff',
              color: '#1e293b',
              fontWeight: 600,
            }}
          >
            새로고침
          </button>
        </div>

        <section
          style={{
            borderRadius: 20,
            border: '1px solid #cbd5f5',
            background: '#ffffff',
            boxShadow: '0 24px 60px -40px rgba(15, 23, 42, 0.55)',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: '#0f172a' }}>내 프롬프트 세트</h2>
              <span style={{ color: '#64748b', fontSize: 14 }}>
                카드 하나를 탭하거나 클릭해 편집기로 이동하세요.
              </span>
            </div>
            {!loading && rows.length > 0 && (
              <span style={{ color: '#1d4ed8', fontWeight: 600 }}>
                총 {rows.length}개 세트
              </span>
            )}
          </div>

          <div
            style={{
              minHeight: 360,
              maxHeight: '60vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              paddingRight: 4,
            }}
          >
            {loading && (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontWeight: 600,
                }}
              >
                불러오는 중…
              </div>
            )}

            {!loading && rows.length === 0 && (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontWeight: 600,
                }}
              >
                아직 세트가 없습니다. “+ 새 세트” 버튼으로 첫 프롬프트를 만들어 보세요.
              </div>
            )}

            {!loading && rows.map((row, index) => {
              const updated = row.updated_at || row.created_at
              const timestamp = updated ? new Date(updated).toLocaleString() : '기록 없음'

              return (
                <div
                  key={row.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    padding: '18px 20px',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 16,
                    alignItems: 'center',
                    background: '#f8fafc',
                    boxShadow: '0 12px 40px -32px rgba(15, 23, 42, 0.65)',
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: '#2563eb',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {editingId === row.id ? (
                      <form
                        onSubmit={submitRename}
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
                      >
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          autoFocus
                          style={{
                            flex: '1 1 220px',
                            border: '1px solid #94a3b8',
                            borderRadius: 12,
                            padding: '8px 12px',
                          }}
                        />
                        <button
                          type="submit"
                          disabled={savingName}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 12,
                            background: '#2563eb',
                            color: '#fff',
                            fontWeight: 600,
                            opacity: savingName ? 0.6 : 1,
                          }}
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 12,
                            border: '1px solid #cbd5f5',
                            background: '#fff',
                            color: '#1e293b',
                            fontWeight: 600,
                          }}
                        >
                          취소
                        </button>
                      </form>
                    ) : (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, color: '#0f172a' }}>{row.name || '이름 없는 세트'}</h3>
                        <button
                          onClick={() => beginRename(row)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: '1px solid #93c5fd',
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontWeight: 600,
                          }}
                        >
                          세트 이름 편집
                        </button>
                      </div>
                    )}

                    <span style={{ color: '#64748b', fontSize: 13 }}>최근 업데이트: {timestamp}</span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      alignItems: 'stretch',
                    }}
                  >
                    <button
                      onClick={() => router.push(`/maker/${row.id}`)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 12,
                        background: '#0f172a',
                        color: '#fff',
                        fontWeight: 700,
                      }}
                    >
                      세트 열기
                    </button>
                    <button
                      onClick={() => exportSet(row.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 12,
                        background: '#0ea5e9',
                        color: '#fff',
                        fontWeight: 600,
                      }}
                    >
                      JSON 내보내기
                    </button>
                    <button
                      onClick={() => removeSet(row.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 12,
                        background: '#ef4444',
                        color: '#fff',
                        fontWeight: 600,
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <SharedChatDock height={280} />
      </div>
    </div>
  )
}
