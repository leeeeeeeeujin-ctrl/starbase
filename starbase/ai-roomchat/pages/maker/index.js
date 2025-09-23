'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import { sanitizeVariableRules } from '../../lib/variableRules'

const SharedChatDock = dynamic(() => import('../../components/common/SharedChatDock'), {
  ssr: false,
})

const ORDER_COLUMN = 'created_at'

async function fetchPromptSets(ownerId) {
  const { data, error } = await supabase
    .from('prompt_sets')
    .select('*')
    .eq('owner_id', ownerId)
    .order(ORDER_COLUMN, { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

function formatTimestamp(value) {
  if (!value) {
    return '기록 없음'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '기록 없음'
  }

  return parsed.toLocaleString()
}

export default function MakerIndex() {
  const router = useRouter()

  const [hydrated, setHydrated] = useState(false)
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [savingRename, setSavingRename] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return

    let active = true

    async function bootstrap() {
      setLoading(true)
      setErrorMessage('')

      const { data: authData } = await supabase.auth.getUser()
      if (!active) return

      const user = authData?.user
      if (!user) {
        router.replace('/')
        return
      }

      setUserId(user.id)

      try {
        const list = await fetchPromptSets(user.id)
        if (!active) return
        setRows(list)
      } catch (err) {
        if (!active) return
        setRows([])
        setErrorMessage(err instanceof Error ? err.message : '세트를 불러오지 못했습니다.')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [hydrated, router])

  const listHeader = useMemo(() => {
    if (loading) return '세트를 불러오는 중입니다.'
    if (rows.length === 0) return '아직 등록된 프롬프트 세트가 없습니다.'
    return `총 ${rows.length}개 세트`
  }, [loading, rows])

  const refreshList = useCallback(
    async (owner = userId) => {
      if (!owner) return

      setLoading(true)
      setErrorMessage('')

      try {
        const list = await fetchPromptSets(owner)
        setRows(list)
      } catch (err) {
        setRows([])
        setErrorMessage(err instanceof Error ? err.message : '세트를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    },
    [userId],
  )

  const beginRename = useCallback((row) => {
    setEditingId(row.id)
    setEditingName(row.name ?? '')
  }, [])

  const cancelRename = useCallback(() => {
    setEditingId(null)
    setEditingName('')
    setSavingRename(false)
  }, [])

  const submitRename = useCallback(
    async (event) => {
      event.preventDefault()
      if (!editingId) return

      const nextName = editingName.trim()
      if (!nextName) {
        alert('세트 이름을 입력하세요.')
        return
      }

      setSavingRename(true)

      const { error } = await supabase
        .from('prompt_sets')
        .update({ name: nextName })
        .eq('id', editingId)

      setSavingRename(false)

      if (error) {
        alert(error.message)
        return
      }

      setRows((prev) => prev.map((row) => (row.id === editingId ? { ...row, name: nextName } : row)))
      cancelRename()
    },
    [editingId, editingName, cancelRename],
  )

  const createSet = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    const user = data?.user
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }

    const { data: inserted, error } = await supabase
      .from('prompt_sets')
      .insert({ name: '새 세트', owner_id: user.id })
      .select()
      .single()

    if (error || !inserted) {
      alert(error?.message || '세트를 생성하지 못했습니다.')
      return
    }

    router.push(`/maker/${inserted.id}`)
  }, [router])

  const removeSet = useCallback(
    async (id) => {
      if (!confirm('세트를 삭제할까요? (프롬프트/브릿지 포함)')) {
        return
      }

      const { error } = await supabase.from('prompt_sets').delete().eq('id', id)
      if (error) {
        alert(error.message)
        return
      }

      setRows((prev) => prev.filter((row) => row.id !== id))
    },
    [],
  )

  const exportSet = useCallback(async (id) => {
    const [setResult, slotsResult, bridgesResult] = await Promise.all([
      supabase.from('prompt_sets').select('*').eq('id', id).single(),
      supabase.from('prompt_slots').select('*').eq('set_id', id).order('slot_no'),
      supabase.from('prompt_bridges').select('*').eq('from_set', id),
    ])

    if (setResult.error) {
      alert(setResult.error.message)
      return
    }

    if (!setResult.data) {
      alert('세트를 찾지 못했습니다.')
      return
    }

    const payload = {
      set: setResult.data,
      slots: (slotsResult.data || []).map((slot) => ({
        ...slot,
        var_rules_global: sanitizeVariableRules(slot?.var_rules_global),
        var_rules_local: sanitizeVariableRules(slot?.var_rules_local),
      })),
      bridges: bridgesResult.data || [],
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `promptset-${setResult.data.name || 'export'}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }, [])

  const importSet = useCallback(
    async (event) => {
      const file = event.target.files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const payload = JSON.parse(text)

        const { data } = await supabase.auth.getUser()
        const user = data?.user
        if (!user) {
          alert('로그인이 필요합니다.')
          return
        }

        const { data: insertedSet, error: insertError } = await supabase
          .from('prompt_sets')
          .insert({ name: payload?.set?.name || '가져온 세트', owner_id: user.id })
          .select()
          .single()

        if (insertError || !insertedSet) {
          throw new Error(insertError?.message || '세트를 생성하지 못했습니다.')
        }

        const slotIdMap = new Map()

        if (Array.isArray(payload?.slots) && payload.slots.length) {
          const slotRows = payload.slots.map((slot) => {
            const normalizedGlobal = sanitizeVariableRules(slot?.var_rules_global ?? slot?.varRulesGlobal)
            const normalizedLocal = sanitizeVariableRules(slot?.var_rules_local ?? slot?.varRulesLocal)
            const canvasX =
              typeof slot?.canvas_x === 'number'
                ? slot.canvas_x
                : typeof slot?.position?.x === 'number'
                ? slot.position.x
                : null
            const canvasY =
              typeof slot?.canvas_y === 'number'
                ? slot.canvas_y
                : typeof slot?.position?.y === 'number'
                ? slot.position.y
                : null

            return {
              set_id: insertedSet.id,
              slot_no: slot.slot_no ?? 1,
              slot_type: slot.slot_type ?? 'ai',
              slot_pick: slot.slot_pick ?? '1',
              template: slot.template ?? '',
              is_start: !!slot.is_start,
              invisible: !!slot.invisible,
              canvas_x: canvasX,
              canvas_y: canvasY,
              var_rules_global: normalizedGlobal,
              var_rules_local: normalizedLocal,
            }
          })

          const { data: insertedSlots, error: slotError } = await supabase
            .from('prompt_slots')
            .insert(slotRows)
            .select()

          if (slotError) {
            throw new Error(slotError.message)
          }

          const insertedBySlotNo = new Map()
          insertedSlots?.forEach((row) => {
            if (row?.slot_no != null) {
              insertedBySlotNo.set(row.slot_no, row)
            }
          })

          payload.slots.forEach((original) => {
            const key = original.slot_no ?? 1
            const inserted = insertedBySlotNo.get(key)
            if (!inserted) return
            if (original.id) {
              slotIdMap.set(original.id, inserted.id)
            }
            if (original.slot_no != null) {
              slotIdMap.set(`slot_no:${original.slot_no}`, inserted.id)
            }
          })
        }

        if (Array.isArray(payload?.bridges) && payload.bridges.length) {
          const remapSlotId = (oldId) => {
            if (!oldId) return null
            if (slotIdMap.has(oldId)) {
              return slotIdMap.get(oldId)
            }
            const fallbackSlot = payload.slots?.find((slot) => slot.id === oldId)
            if (fallbackSlot?.slot_no != null) {
              return slotIdMap.get(`slot_no:${fallbackSlot.slot_no}`) ?? null
            }
            return null
          }

          const bridgeRows = payload.bridges.map((bridge) => ({
            from_set: insertedSet.id,
            from_slot_id: remapSlotId(bridge.from_slot_id),
            to_slot_id: remapSlotId(bridge.to_slot_id),
            trigger_words: bridge.trigger_words ?? [],
            conditions: bridge.conditions ?? [],
            priority: bridge.priority ?? 0,
            probability: bridge.probability ?? 1,
            fallback: !!bridge.fallback,
            action: bridge.action ?? 'continue',
          }))

          if (bridgeRows.length) {
            const { error: bridgeError } = await supabase.from('prompt_bridges').insert(bridgeRows)
            if (bridgeError) {
              throw new Error(bridgeError.message)
            }
          }
        }

        await refreshList(user.id)
      } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : 'JSON을 불러오지 못했습니다.')
      } finally {
        event.target.value = ''
      }
    },
    [refreshList],
  )

  const goBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/rank')
    }
  }, [router])

  if (!hydrated) {
    return null
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
            onClick={() => refreshList()}
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
              <span style={{ color: '#64748b', fontSize: 14 }}>{listHeader}</span>
            </div>
            {errorMessage && (
              <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }}>{errorMessage}</span>
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

            {!loading && rows.length === 0 && !errorMessage && (
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

            {!loading &&
              rows.map((row, index) => {
                const timestamp = formatTimestamp(row.updated_at || row.created_at)

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
                            disabled={savingRename}
                            style={{
                              padding: '8px 14px',
                              borderRadius: 12,
                              background: '#2563eb',
                              color: '#fff',
                              fontWeight: 600,
                              opacity: savingRename ? 0.6 : 1,
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
