'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import { sanitizeVariableRules } from '../../lib/variableRules'

const SharedChatDock = dynamic(() => import('../../components/common/SharedChatDock'), {
  ssr: false,
})

function formatTimestamp(value) {
  if (!value) return '기록 없음'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '기록 없음'
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
  const [actionSheetOpen, setActionSheetOpen] = useState(false)

  const fetchPromptSets = useCallback(async (owner) => {
    if (!owner) return []

    const { data, error } = await supabase
      .from('prompt_sets')
      .select('*')
      .eq('owner_id', owner)

    if (error) {
      throw new Error(error.message)
    }

    const rows = Array.isArray(data) ? data.slice() : []
    rows.sort((a, b) => {
      const left = new Date(a?.updated_at || a?.created_at || 0).getTime()
      const right = new Date(b?.updated_at || b?.created_at || 0).getTime()
      return right - left
    })
    return rows
  }, [])

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
  }, [fetchPromptSets, hydrated, router])

  const listHeader = useMemo(() => {
    if (loading) return '세트를 불러오는 중입니다.'
    if (rows.length === 0) return '아직 등록된 프롬프트 세트가 없습니다.'
    return `총 ${rows.length}개 세트`
  }, [loading, rows])

  const refreshList = useCallback(async (owner = userId) => {
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
  }, [fetchPromptSets, userId])

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

    setActionSheetOpen(false)
    router.push(`/maker/${inserted.id}`)
  }, [router])

  const removeSet = useCallback(async (id) => {
    if (!confirm('세트를 삭제할까요? (프롬프트/브릿지 포함)')) {
      return
    }

    const { error } = await supabase.from('prompt_sets').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }

    setRows((prev) => prev.filter((row) => row.id !== id))
  }, [])

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

      setActionSheetOpen(false)

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
              visible_slots: Array.isArray(slot?.visible_slots ?? slot?.visibleSlots)
                ? (slot.visible_slots ?? slot.visibleSlots)
                    .map((value) => Number(value))
                    .filter((value) => Number.isFinite(value))
                : [],
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
    router.push('/lobby')
  }, [router])

  if (!hydrated) {
    return null
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1f2937 28%, #f8fafc 100%)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: '1 1 auto',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '24px 16px 140px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <header
            style={{
              background: '#111827',
              color: '#f8fafc',
              borderRadius: 20,
              padding: '18px 20px',
              boxShadow: '0 30px 60px -38px rgba(15, 23, 42, 0.75)',
              display: 'grid',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={goBack}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  background: 'rgba(15, 23, 42, 0.55)',
                  border: '1px solid rgba(148, 163, 184, 0.4)',
                  color: '#f8fafc',
                  fontWeight: 600,
                }}
              >
                ← 로비로
              </button>
              <div style={{ display: 'grid', gap: 4 }}>
                <h1 style={{ margin: 0, fontSize: 24 }}>프롬프트 메이커</h1>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#cbd5f5' }}>
                  터치 기반 워크플로우에 맞게 세트 목록을 중앙에 배치했어요. 빠른 작업은 우측 하단 버튼을 눌러 열 수 있습니다.
                </p>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{listHeader}</span>
              {errorMessage && <span style={{ fontSize: 12, color: '#fca5a5' }}>{errorMessage}</span>}
            </div>
          </header>

          <section
            style={{
              background: '#ffffff',
              borderRadius: 24,
              boxShadow: '0 28px 62px -48px rgba(15, 23, 42, 0.55)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              minHeight: 420,
            }}
          >
            <div
              style={{
                flex: '1 1 auto',
                maxHeight: '60vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
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
                    lineHeight: 1.6,
                  }}
                >
                  아직 세트가 없습니다. 빠른 작업 버튼을 눌러 첫 세트를 만들어 보세요.
                </div>
              )}

              {!loading &&
                rows.map((row, index) => {
                  const timestamp = formatTimestamp(row.updated_at ?? row.created_at)

                  return (
                    <div
                      key={row.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 18,
                        padding: '18px 18px 16px',
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr',
                        gap: 16,
                        alignItems: 'flex-start',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                        boxShadow: '0 18px 36px -30px rgba(30, 64, 175, 0.55)',
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          background: '#2563eb',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 15,
                        }}
                      >
                        {index + 1}
                      </div>

                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {editingId === row.id ? (
                            <form onSubmit={submitRename} style={{ display: 'grid', gap: 8 }}>
                              <input
                                value={editingName}
                                onChange={(event) => setEditingName(event.target.value)}
                                autoFocus
                                style={{
                                  border: '1px solid #94a3b8',
                                  borderRadius: 14,
                                  padding: '9px 12px',
                                  fontSize: 15,
                                }}
                              />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="submit"
                                  disabled={savingRename}
                                  style={{
                                    flex: 1,
                                    padding: '8px 12px',
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
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: 12,
                                    border: '1px solid #cbd5f5',
                                    background: '#fff',
                                    color: '#1e293b',
                                    fontWeight: 600,
                                  }}
                                >
                                  취소
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                              <h3 style={{ margin: 0, color: '#0f172a', fontSize: 18 }}>{row.name || '이름 없는 세트'}</h3>
                              <button
                                onClick={() => beginRename(row)}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 999,
                                  border: '1px solid #93c5fd',
                                  background: 'rgba(219, 234, 254, 0.6)',
                                  color: '#1d4ed8',
                                  fontWeight: 600,
                                }}
                              >
                                이름 편집
                              </button>
                            </div>
                          )}
                          <span style={{ color: '#475569', fontSize: 12 }}>최근 업데이트: {timestamp}</span>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          <button
                            onClick={() => router.push(`/maker/${row.id}`)}
                            style={{
                              flex: '1 1 120px',
                              padding: '9px 12px',
                              borderRadius: 12,
                              background: '#0f172a',
                              color: '#fff',
                              fontWeight: 600,
                            }}
                          >
                            세트 열기
                          </button>
                          <button
                            onClick={() => exportSet(row.id)}
                            style={{
                              flex: '1 1 120px',
                              padding: '9px 12px',
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
                              flex: '1 1 120px',
                              padding: '9px 12px',
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
                    </div>
                  )
                })}
            </div>
          </section>

          <SharedChatDock height={260} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setActionSheetOpen(true)}
        style={{
          position: 'fixed',
          right: 20,
          bottom: 28,
          width: 64,
          height: 64,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
          color: '#fff',
          fontSize: 28,
          fontWeight: 700,
          boxShadow: '0 24px 60px -28px rgba(37, 99, 235, 0.65)',
          zIndex: 60,
        }}
        aria-label="빠른 작업 열기"
      >
        ＋
      </button>

      {actionSheetOpen && (
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setActionSheetOpen(false)
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            zIndex: 80,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            padding: '0 16px 32px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: '#ffffff',
              borderRadius: 28,
              boxShadow: '0 32px 80px -40px rgba(15, 23, 42, 0.65)',
              padding: '20px 20px 28px',
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16, color: '#0f172a' }}>빠른 작업</strong>
              <button
                type="button"
                onClick={() => setActionSheetOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                닫기
              </button>
            </div>

            <button
              onClick={createSet}
              style={{
                padding: '12px 14px',
                borderRadius: 16,
                background: '#2563eb',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
              }}
            >
              새 세트 만들기
            </button>

            <label
              style={{
                padding: '12px 14px',
                borderRadius: 16,
                border: '1px dashed #94a3b8',
                background: '#f8fafc',
                color: '#0f172a',
                fontWeight: 600,
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              JSON 가져오기
              <input type="file" accept="application/json" onChange={importSet} style={{ display: 'none' }} />
            </label>

            <button
              onClick={() => {
                setActionSheetOpen(false)
                refreshList()
              }}
              style={{
                padding: '12px 14px',
                borderRadius: 16,
                background: '#e2e8f0',
                color: '#0f172a',
                fontWeight: 600,
                border: 'none',
              }}
            >
              목록 새로고침
            </button>

            <button
              onClick={() => {
                setActionSheetOpen(false)
                router.push('/rank')
              }}
              style={{
                padding: '12px 14px',
                borderRadius: 16,
                background: '#0f172a',
                color: '#fff',
                fontWeight: 600,
                border: 'none',
              }}
            >
              랭킹 허브로 이동
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
