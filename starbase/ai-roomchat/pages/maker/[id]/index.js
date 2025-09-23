'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { supabase } from '../../../lib/supabase'
import PromptNode from '../../../components/maker/PromptNode'
import SidePanel from '../../../components/maker/SidePanel'

const nodeTypes = { prompt: PromptNode }

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

function hot(event, key, { meta = true, ctrl = true } = {}) {
  if (key !== 's') return false
  if (meta && (isMac() ? event.metaKey : event.ctrlKey)) return true
  if (ctrl && event.ctrlKey) return true
  return false
}

export default function MakerEditor() {
  const router = useRouter()
  const { id: setId } = router.query

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [setInfo, setSetInfo] = useState(null)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)

  const mapFlowToSlot = useRef(new Map())

  const [quickSlot, setQuickSlot] = useState('1')
  const [quickProp, setQuickProp] = useState('name')
  const [quickAbility, setQuickAbility] = useState('1')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!setId) return

    let active = true

    async function load() {
      const { data: authData } = await supabase.auth.getUser()
      if (!active) return

      const user = authData?.user
      if (!user) {
        router.replace('/')
        return
      }

      const { data: setRow, error: setError } = await supabase
        .from('prompt_sets')
        .select('*')
        .eq('id', setId)
        .single()

      if (!active) return

      if (setError || !setRow) {
        alert('세트를 불러오지 못했습니다.')
        router.replace('/maker')
        return
      }

      setSetInfo(setRow)

      const [{ data: slotRows }, { data: bridgeRows }] = await Promise.all([
        supabase
          .from('prompt_slots')
          .select('*')
          .eq('set_id', setId)
          .order('slot_no', { ascending: true }),
        supabase
          .from('prompt_bridges')
          .select('*')
          .eq('from_set', setId)
          .order('priority', { ascending: false }),
      ])

      if (!active) return

      const slotMap = new Map()
      const initialNodes = (slotRows || []).map((slot, index) => {
        const flowId = `n${slot.id}`
        slotMap.set(flowId, slot.id)
        return {
          id: flowId,
          type: 'prompt',
          position: {
            x: 120 + (index % 3) * 380,
            y: 120 + Math.floor(index / 3) * 260,
          },
          data: {
            template: slot.template || '',
            slot_type: slot.slot_type || 'ai',
            slot_pick: slot.slot_pick || '1',
            isStart: !!slot.is_start,
            invisible: !!slot.invisible,
            var_rules_global: slot.var_rules_global || [],
            var_rules_local: slot.var_rules_local || [],
            onChange: (partial) =>
              setNodes((existing) =>
                existing.map((node) =>
                  node.id === flowId ? { ...node, data: { ...node.data, ...partial } } : node,
                ),
              ),
            onDelete: handleDeletePrompt,
            onSetStart: () => markAsStart(flowId),
          },
        }
      })

      mapFlowToSlot.current = slotMap

      const initialEdges = (bridgeRows || [])
        .filter((bridge) => bridge.from_slot_id && bridge.to_slot_id)
        .map((bridge) => ({
          id: `e${bridge.id}`,
          source: `n${bridge.from_slot_id}`,
          target: `n${bridge.to_slot_id}`,
          label: buildEdgeLabel(bridge),
          data: {
            bridgeId: bridge.id,
            trigger_words: bridge.trigger_words || [],
            conditions: bridge.conditions || [],
            priority: bridge.priority ?? 0,
            probability: bridge.probability ?? 1,
            fallback: !!bridge.fallback,
            action: bridge.action || 'continue',
          },
        }))

      setNodes(initialNodes)
      setEdges(initialEdges)
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [setId, router, setNodes, setEdges])

  const rebuildEdgeLabel = useCallback((data) => {
    const parts = []
    const conditions = data?.conditions || []

    conditions.forEach((condition) => {
      if (condition?.type === 'turn_gte' && (condition.value ?? condition.gte) != null) {
        parts.push(`턴 ≥ ${condition.value ?? condition.gte}`)
      }
      if (condition?.type === 'turn_lte' && (condition.value ?? condition.lte) != null) {
        parts.push(`턴 ≤ ${condition.value ?? condition.lte}`)
      }
      if (condition?.type === 'prev_ai_contains') {
        parts.push(`이전응답 "${condition.value}"`)
      }
      if (condition?.type === 'prev_prompt_contains') {
        parts.push(`이전프롬프트 "${condition.value}"`)
      }
      if (condition?.type === 'prev_ai_regex') {
        parts.push(`이전응답 /${condition.pattern}/${condition.flags || ''}`)
      }
      if (condition?.type === 'visited_slot') {
        parts.push(`경유 #${condition.slot_id ?? '?'}`)
      }
      if (condition?.type === 'role_alive_gte') {
        parts.push(`[${condition.role}] 생존≥${condition.count}`)
      }
      if (condition?.type === 'role_dead_gte') {
        parts.push(`[${condition.role}] 탈락≥${condition.count}`)
      }
      if (condition?.type === 'custom_flag_on') {
        parts.push(`변수:${condition.name}=ON`)
      }
      if (condition?.type === 'fallback') {
        parts.push('Fallback')
      }
    })

    if (data?.probability != null && data.probability !== 1) {
      parts.push(`확률 ${Math.round(Number(data.probability) * 100)}%`)
    }
    if (data?.action && data.action !== 'continue') {
      parts.push(`→ ${data.action}`)
    }

    return parts.join(' | ')
  }, [])

  function buildEdgeLabel(bridge) {
    return rebuildEdgeLabel(bridge)
  }

  const onConnect = useCallback(
    (params) => {
      setEdges((existing) =>
        addEdge(
          {
            ...params,
            type: 'default',
            animated: false,
            data: {
              trigger_words: [],
              conditions: [],
              priority: 0,
              probability: 1,
              fallback: false,
              action: 'continue',
            },
          },
          existing,
        ),
      )
    },
    [setEdges],
  )

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id)
    setSelectedEdge(null)
  }, [])

  const onEdgeClick = useCallback((_, edge) => {
    setSelectedEdge(edge)
    setSelectedNodeId(null)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdge(null)
  }, [])

  const onSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }) => {
    if (selectedNodes?.length) {
      setSelectedNodeId(selectedNodes[0].id)
      setSelectedEdge(null)
      return
    }
    if (selectedEdges?.length) {
      setSelectedEdge(selectedEdges[0])
      setSelectedNodeId(null)
      return
    }
    setSelectedNodeId(null)
    setSelectedEdge(null)
  }, [])

  const onNodesDelete = useCallback(async (deleted) => {
    for (const node of deleted) {
      const slotId = mapFlowToSlot.current.get(node.id)
      if (!slotId) continue

      await supabase.from('prompt_bridges').delete().or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)
      await supabase.from('prompt_slots').delete().eq('id', slotId)
      mapFlowToSlot.current.delete(node.id)
    }
  }, [])

  const onEdgesDelete = useCallback(async (deleted) => {
    for (const edge of deleted) {
      const bridgeId = edge?.data?.bridgeId
      if (bridgeId) {
        await supabase.from('prompt_bridges').delete().eq('id', bridgeId)
      }
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      if (hot(event, 's')) {
        event.preventDefault()
        saveAll()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNodeId) {
          handleDeletePrompt(selectedNodeId)
        } else if (selectedEdge) {
          setEdges((existing) => existing.filter((edge) => edge.id !== selectedEdge.id))
          const bridgeId = selectedEdge?.data?.bridgeId
          if (bridgeId) {
            supabase.from('prompt_bridges').delete().eq('id', bridgeId)
          }
          setSelectedEdge(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdge, setEdges])

  function markAsStart(flowNodeId) {
    setNodes((existing) =>
      existing.map((node) => ({
        ...node,
        data: { ...node.data, isStart: node.id === flowNodeId },
      })),
    )
  }

  function toggleInvisible() {
    if (!selectedNodeId) return

    setNodes((existing) =>
      existing.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, invisible: !node.data.invisible } }
          : node,
      ),
    )
  }

  function insertQuickToken() {
    if (!selectedNodeId) return

    const token =
      quickProp === 'ability'
        ? `{{slot${quickSlot}.ability${quickAbility}}}`
        : `{{slot${quickSlot}.${quickProp}}}`

    setNodes((existing) =>
      existing.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, template: `${node.data.template || ''}${token}` } }
          : node,
      ),
    )
  }

  function insertHistoryToken(kind) {
    if (!selectedNodeId) return

    const token =
      kind === 'last1' ? '{{history.last1}}' : kind === 'last2' ? '{{history.last2}}' : '{{history.last5}}'

    setNodes((existing) =>
      existing.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, template: `${node.data.template || ''}${token}` } }
          : node,
      ),
    )
  }

  function addPromptNode(type = 'ai') {
    const flowId = `tmp_${Date.now()}`

    setNodes((existing) => [
      ...existing,
      {
        id: flowId,
        type: 'prompt',
        position: { x: 160, y: 120 },
        data: {
          template: '',
          slot_type: type,
          slot_pick: '1',
          isStart: false,
          invisible: false,
          var_rules_global: [],
          var_rules_local: [],
          onChange: (partial) =>
            setNodes((current) =>
              current.map((node) => (node.id === flowId ? { ...node, data: { ...node.data, ...partial } } : node)),
            ),
          onDelete: handleDeletePrompt,
          onSetStart: () => markAsStart(flowId),
        },
      },
    ])

    setSelectedNodeId(flowId)
  }

  async function handleDeletePrompt(flowNodeId) {
    setNodes((existing) => existing.filter((node) => node.id !== flowNodeId))
    setEdges((existing) => existing.filter((edge) => edge.source !== flowNodeId && edge.target !== flowNodeId))
    setSelectedNodeId(null)

    const slotId = mapFlowToSlot.current.get(flowNodeId)
    if (!slotId) return

    await supabase.from('prompt_bridges').delete().or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)
    await supabase.from('prompt_slots').delete().eq('id', slotId)
    mapFlowToSlot.current.delete(flowNodeId)
  }

  async function saveAll() {
    if (!setInfo || busy) return

    setBusy(true)
    try {
      const slotOrder = new Map()
      nodes.forEach((node, index) => {
        slotOrder.set(node.id, index + 1)
      })

      for (const node of nodes) {
        const slotNo = slotOrder.get(node.id) || 1
        let slotId = mapFlowToSlot.current.get(node.id)

        const payload = {
          set_id: setInfo.id,
          slot_no: slotNo,
          slot_type: node.data.slot_type || 'ai',
          slot_pick: node.data.slot_pick || '1',
          template: node.data.template || '',
          is_start: !!node.data.isStart,
          invisible: !!node.data.invisible,
          var_rules_global: node.data.var_rules_global || [],
          var_rules_local: node.data.var_rules_local || [],
        }

        if (!slotId) {
          const { data: inserted, error } = await supabase.from('prompt_slots').insert(payload).select().single()
          if (error || !inserted) {
            console.error(error)
            continue
          }
          slotId = inserted.id
          mapFlowToSlot.current.set(node.id, slotId)
        } else {
          await supabase.from('prompt_slots').update(payload).eq('id', slotId)
        }
      }

      const { data: existingBridges } = await supabase
        .from('prompt_bridges')
        .select('id')
        .eq('from_set', setInfo.id)

      const keep = new Set()

      for (const edge of edges) {
        const fromSlot = mapFlowToSlot.current.get(edge.source)
        const toSlot = mapFlowToSlot.current.get(edge.target)
        if (!fromSlot || !toSlot) continue

        const payload = {
          from_set: setInfo.id,
          from_slot_id: fromSlot,
          to_slot_id: toSlot,
          trigger_words: edge.data?.trigger_words || [],
          conditions: edge.data?.conditions || [],
          priority: edge.data?.priority ?? 0,
          probability: edge.data?.probability ?? 1,
          fallback: !!edge.data?.fallback,
          action: edge.data?.action || 'continue',
        }

        let bridgeId = edge.data?.bridgeId
        if (!bridgeId) {
          const { data: inserted, error } = await supabase.from('prompt_bridges').insert(payload).select().single()
          if (error || !inserted) {
            console.error(error)
            continue
          }
          bridgeId = inserted.id
          edge.data = { ...(edge.data || {}), bridgeId }
        } else {
          await supabase.from('prompt_bridges').update(payload).eq('id', bridgeId)
        }

        keep.add(bridgeId)
      }

      for (const bridge of existingBridges || []) {
        if (!keep.has(bridge.id)) {
          await supabase.from('prompt_bridges').delete().eq('id', bridge.id)
        }
      }

      alert('저장 완료')
    } finally {
      setBusy(false)
    }
  }

  const quickTokenLabel = useMemo(() => {
    if (quickProp === 'ability') {
      return `{{slot${quickSlot}.ability${quickAbility}}}`
    }
    return `{{slot${quickSlot}.${quickProp}}}`
  }, [quickSlot, quickProp, quickAbility])

  if (!mounted || loading) {
    return <div style={{ padding: 20 }}>불러오는 중…</div>
  }

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto auto 1fr' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#fff',
          padding: 10,
          borderBottom: '1px solid #e5e7eb',
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/maker')} style={{ padding: '6px 10px' }}>
            ← 목록
          </button>
          <b style={{ marginLeft: 4 }}>{setInfo?.name}</b>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => addPromptNode('ai')}
            style={{ padding: '6px 10px', background: '#2563eb', color: '#fff', borderRadius: 8 }}
          >
            + 프롬프트
          </button>
          <button
            onClick={() => addPromptNode('user_action')}
            style={{ padding: '6px 10px', background: '#0ea5e9', color: '#fff', borderRadius: 8 }}
          >
            + 유저 행동
          </button>
          <button
            onClick={() => addPromptNode('system')}
            style={{ padding: '6px 10px', background: '#6b7280', color: '#fff', borderRadius: 8 }}
          >
            + 시스템
          </button>
          <button
            type="button"
            onClick={saveAll}
            disabled={busy}
            style={{ padding: '6px 10px', background: '#111827', color: '#fff', borderRadius: 8 }}
          >
            {busy ? '저장 중…' : '저장 (⌘/Ctrl+S)'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportSet} style={{ padding: '6px 10px' }}>
            내보내기
          </button>
          <label style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer' }}>
            가져오기
            <input type="file" accept="application/json" onChange={importSet} style={{ display: 'none' }} />
          </label>
          <button onClick={() => router.push('/rank')} style={{ padding: '6px 10px' }}>
            로비로
          </button>
        </div>
      </div>

      <div
        style={{
          position: 'sticky',
          top: 52,
          zIndex: 45,
          background: '#f8fafc',
          padding: 8,
          borderBottom: '1px solid #e5e7eb',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>퀵 토큰</span>
          <select value={quickSlot} onChange={(event) => setQuickSlot(event.target.value)}>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                슬롯
                {index + 1}
              </option>
            ))}
          </select>
          <select value={quickProp} onChange={(event) => setQuickProp(event.target.value)}>
            <option value="name">이름</option>
            <option value="description">설명</option>
            <option value="ability">능력</option>
          </select>
          {quickProp === 'ability' && (
            <select value={quickAbility} onChange={(event) => setQuickAbility(event.target.value)}>
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  능력
                  {index + 1}
                </option>
              ))}
            </select>
          )}
          <button onClick={insertQuickToken} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>
            {quickTokenLabel} 삽입
          </button>
          <button onClick={() => insertHistoryToken('last1')} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>
            history.last1 삽입
          </button>
          <button onClick={() => insertHistoryToken('last2')} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>
            history.last2 삽입
          </button>
          <button onClick={() => insertHistoryToken('last5')} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>
            history.last5 삽입
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>선택 노드</span>
          <button
            onClick={() => selectedNodeId && markAsStart(selectedNodeId)}
            disabled={!selectedNodeId}
            style={{ padding: '6px 10px' }}
          >
            시작 지정
          </button>
          <button onClick={toggleInvisible} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>
            Invisible 토글
          </button>
          <button
            onClick={() => selectedNodeId && handleDeletePrompt(selectedNodeId)}
            disabled={!selectedNodeId}
            style={{ padding: '6px 10px', color: '#ef4444' }}
          >
            삭제
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px' }}>
        <div style={{ position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onSelectionChange={onSelectionChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>

        <SidePanel
          selectedNodeId={selectedNodeId}
          selectedEdge={selectedEdge}
          setEdges={setEdges}
          setNodes={setNodes}
          onInsertToken={(token) => {
            if (!selectedNodeId) return
            setNodes((existing) =>
              existing.map((node) =>
                node.id === selectedNodeId
                  ? { ...node, data: { ...node.data, template: `${node.data.template || ''}${token}` } }
                  : node,
              ),
            )
          }}
          rebuildEdgeLabel={rebuildEdgeLabel}
        />
      </div>
    </div>
  )
}

async function exportSet() {
  const match = (typeof window !== 'undefined' ? window.location.pathname : '').match(/\/maker\/([^/]+)/)
  const setId = match?.[1]
  if (!setId) {
    alert('세트 ID를 파싱하지 못했습니다.')
    return
  }

  const [setRow, slots, bridges] = await Promise.all([
    supabase.from('prompt_sets').select('*').eq('id', setId).single(),
    supabase.from('prompt_slots').select('*').eq('set_id', setId).order('slot_no'),
    supabase.from('prompt_bridges').select('*').eq('from_set', setId),
  ])

  const payload = {
    set: setRow.data,
    slots: slots.data || [],
    bridges: bridges.data || [],
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = `promptset-${setRow.data?.name || 'export'}.json`
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

async function importSet(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const payload = JSON.parse(text)

    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }

    const { data: insertedSet, error: setError } = await supabase
      .from('prompt_sets')
      .insert({ name: payload?.set?.name || '가져온 세트', owner_id: user.id })
      .select()
      .single()

    if (setError || !insertedSet) {
      throw new Error(setError?.message || '세트를 생성하지 못했습니다.')
    }

    const slotIdMap = new Map()

    if (Array.isArray(payload?.slots) && payload.slots.length) {
      const slotRows = payload.slots.map((slot) => ({
        set_id: insertedSet.id,
        slot_no: slot.slot_no ?? 1,
        slot_type: slot.slot_type ?? 'ai',
        slot_pick: slot.slot_pick ?? '1',
        template: slot.template ?? '',
        is_start: !!slot.is_start,
        invisible: !!slot.invisible,
        var_rules_global: slot.var_rules_global ?? [],
        var_rules_local: slot.var_rules_local ?? [],
      }))

      const { data: insertedSlots, error: slotError } = await supabase
        .from('prompt_slots')
        .insert(slotRows)
        .select()

      if (slotError) {
        throw new Error(slotError.message)
      }

      insertedSlots?.forEach((insertedSlot, index) => {
        const original = payload.slots[index]
        if (!original) return
        if (original.id) {
          slotIdMap.set(original.id, insertedSlot.id)
        }
        if (original.slot_no != null) {
          slotIdMap.set(`slot_no:${original.slot_no}`, insertedSlot.id)
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

    window.location.assign(`/maker/${insertedSet.id}`)
  } catch (err) {
    console.error(err)
    alert(err instanceof Error ? err.message : 'JSON을 불러오지 못했습니다.')
  } finally {
    event.target.value = ''
  }
}
