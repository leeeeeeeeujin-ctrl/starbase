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
import {
  collectVariableNames,
  createActiveRule,
  createAutoRule,
  createManualRule,
  makeEmptyVariableRules,
  sanitizeVariableRules,
  variableRulesEqual,
  VARIABLE_RULE_COMPARATORS,
  VARIABLE_RULE_MODES,
  VARIABLE_RULE_OUTCOMES,
  VARIABLE_RULE_STATUS,
  VARIABLE_RULE_SUBJECTS,
} from '../../../lib/variableRules'

const nodeTypes = { prompt: PromptNode }

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

function isSaveHotkey(event) {
  if (event.key !== 's') return false
  return isMac() ? event.metaKey : event.ctrlKey
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
  const [variableDrawerOpen, setVariableDrawerOpen] = useState(false)

  // flowNodeId(string) -> slot.id(uuid)
  const mapFlowToSlot = useRef(new Map())

  useEffect(() => {
    setMounted(true)
  }, [])

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

  const buildEdgeLabel = useCallback((bridge) => rebuildEdgeLabel(bridge), [rebuildEdgeLabel])

  const markAsStart = useCallback(
    (flowNodeId) => {
      setNodes((existing) =>
        existing.map((node) => ({
          ...node,
          data: { ...node.data, isStart: node.id === flowNodeId },
        })),
      )
    },
    [setNodes],
  )

  const handleDeletePrompt = useCallback(
    async (flowNodeId) => {
      setNodes((existing) => existing.filter((node) => node.id !== flowNodeId))
      setEdges((existing) => existing.filter((edge) => edge.source !== flowNodeId && edge.target !== flowNodeId))
      setSelectedNodeId((current) => (current === flowNodeId ? null : current))
      setSelectedEdge((current) => (current && (current.source === flowNodeId || current.target === flowNodeId) ? null : current))

      const slotId = mapFlowToSlot.current.get(flowNodeId)
      if (!slotId) return

      await supabase.from('prompt_bridges').delete().or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)
      await supabase.from('prompt_slots').delete().eq('id', slotId)
      mapFlowToSlot.current.delete(flowNodeId)
    },
    [setNodes, setEdges],
  )

  useEffect(() => {
    if (!setId || !mounted) return

    let active = true

    async function load() {
      setLoading(true)

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

        const fallbackX = 120 + (index % 3) * 380
        const fallbackY = 120 + Math.floor(index / 3) * 260
        const posX = typeof slot?.canvas_x === 'number' ? slot.canvas_x : fallbackX
        const posY = typeof slot?.canvas_y === 'number' ? slot.canvas_y : fallbackY

        return {
          id: flowId,
          type: 'prompt',
          position: { x: posX, y: posY },
          data: {
            template: slot.template || '',
            slot_type: slot.slot_type || 'ai',
            slot_pick: slot.slot_pick || '1',
            isStart: !!slot.is_start,
            invisible: !!slot.invisible,
            slotNo: Number.isFinite(Number(slot.slot_no)) ? Number(slot.slot_no) : index + 1,
            var_rules_global: sanitizeVariableRules(slot.var_rules_global),
            var_rules_local: sanitizeVariableRules(slot.var_rules_local),
            onChange: (partial) =>
              setNodes((current) =>
                current.map((node) =>
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
  }, [setId, mounted, router, buildEdgeLabel, handleDeletePrompt, markAsStart, setNodes, setEdges])

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

  const onNodesDelete = useCallback(
    async (deleted) => {
      for (const node of deleted) {
        const slotId = mapFlowToSlot.current.get(node.id)
        if (!slotId) continue

        await supabase.from('prompt_bridges').delete().or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)
        await supabase.from('prompt_slots').delete().eq('id', slotId)
        mapFlowToSlot.current.delete(node.id)
      }
    },
    [],
  )

  const onEdgesDelete = useCallback(async (deleted) => {
    for (const edge of deleted) {
      const bridgeId = edge?.data?.bridgeId
      if (bridgeId) {
        await supabase.from('prompt_bridges').delete().eq('id', bridgeId)
      }
    }
  }, [])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  )

  const updateSelectedVarRules = useCallback(
    (key, builder) => {
      if (!selectedNodeId) return
      setNodes((existing) =>
        existing.map((node) => {
          if (node.id !== selectedNodeId) return node
          const base = sanitizeVariableRules(node.data?.[key])
          const draft = JSON.parse(JSON.stringify(base))
          const built = builder(draft)
          const next = sanitizeVariableRules(built)
          if (variableRulesEqual(base, next)) {
            return node
          }
          return {
            ...node,
            data: {
              ...node.data,
              [key]: next,
            },
          }
        }),
      )
    },
    [selectedNodeId, setNodes],
  )

  const selectedGlobalRules = useMemo(
    () => (selectedNode ? sanitizeVariableRules(selectedNode.data?.var_rules_global) : null),
    [selectedNode],
  )

  const selectedLocalRules = useMemo(
    () => (selectedNode ? sanitizeVariableRules(selectedNode.data?.var_rules_local) : null),
    [selectedNode],
  )

  const availableVariableNames = useMemo(() => {
    if (!selectedGlobalRules && !selectedLocalRules) return []
    const names = new Set()
    if (selectedGlobalRules) {
      collectVariableNames(selectedGlobalRules).forEach((name) => names.add(name))
    }
    if (selectedLocalRules) {
      collectVariableNames(selectedLocalRules).forEach((name) => names.add(name))
    }
    return Array.from(names)
  }, [selectedGlobalRules, selectedLocalRules])

  const commitGlobalRules = useCallback(
    (builder) => updateSelectedVarRules('var_rules_global', builder),
    [updateSelectedVarRules],
  )

  const commitLocalRules = useCallback(
    (builder) => updateSelectedVarRules('var_rules_local', builder),
    [updateSelectedVarRules],
  )

  const slotSuggestions = useMemo(() => {
    const suggestions = new Map()
    nodes.forEach((node, index) => {
      const rawSlotNo = node?.data?.slotNo
      const slotNo = Number.isFinite(Number(rawSlotNo)) ? Number(rawSlotNo) : index + 1
      const token = `slot${slotNo}`
      if (suggestions.has(token)) return

      let label = `슬롯 ${slotNo}`
      const type = node?.data?.slot_type
      if (type) {
        const typeLabel =
          type === 'user_action' ? '유저 행동' : type === 'system' ? '시스템' : type === 'ai' ? 'AI' : type
        label += ` · ${typeLabel}`
      }
      const previewLine = (node?.data?.template || '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0)
      if (previewLine) {
        const truncated = previewLine.length > 16 ? `${previewLine.slice(0, 16)}…` : previewLine
        label += ` · ${truncated}`
      }

      suggestions.set(token, { token, label })
    })
    return Array.from(suggestions.values())
  }, [nodes])

  const characterSuggestions = useMemo(() => {
    const names = new Set()
    const pushName = (value) => {
      if (typeof value !== 'string') return
      const trimmed = value.trim()
      if (trimmed) {
        names.add(trimmed)
      }
    }
    const explore = (value) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (typeof entry === 'string') {
            pushName(entry)
          } else if (entry && typeof entry === 'object') {
            pushName(entry.name)
            pushName(entry.label)
            pushName(entry.title)
            pushName(entry.nickname)
          }
        })
      }
    }

    explore(setInfo?.character_names)
    explore(setInfo?.characters)
    explore(setInfo?.heroes)
    explore(setInfo?.hero_names)
    explore(setInfo?.participants)
    explore(setInfo?.metadata?.characters)
    explore(setInfo?.metadata?.hero_names)
    explore(setInfo?.metadata?.participants)
    explore(setInfo?.roles?.map((role) => role?.name ?? role?.label ?? role))

    nodes.forEach((node) => {
      pushName(node?.data?.characterName)
      pushName(node?.data?.character_label)
    })

    return Array.from(names)
  }, [setInfo, nodes])

  const addPromptNode = useCallback(
    (type = 'ai') => {
      const flowId = `tmp_${Date.now()}`

      setNodes((existing) => {
        const slotNo = existing.length + 1
        return [
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
              slotNo,
              var_rules_global: makeEmptyVariableRules(),
              var_rules_local: makeEmptyVariableRules(),
              onChange: (partial) =>
                setNodes((current) =>
                  current.map((node) =>
                    node.id === flowId ? { ...node, data: { ...node.data, ...partial } } : node,
                  ),
                ),
              onDelete: handleDeletePrompt,
              onSetStart: () => markAsStart(flowId),
            },
          },
        ]
      })

      setSelectedNodeId(flowId)
    },
    [handleDeletePrompt, markAsStart, setNodes],
  )

  const saveAll = useCallback(async () => {
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
          canvas_x: typeof node.position?.x === 'number' ? node.position.x : null,
          canvas_y: typeof node.position?.y === 'number' ? node.position.y : null,
          var_rules_global: sanitizeVariableRules(node.data.var_rules_global),
          var_rules_local: sanitizeVariableRules(node.data.var_rules_local),
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

      setNodes((existing) =>
        existing.map((node, index) => ({
          ...node,
          data: { ...node.data, slotNo: slotOrder.get(node.id) || index + 1 },
        })),
      )

      alert('저장 완료')
    } finally {
      setBusy(false)
    }
  }, [busy, edges, nodes, setInfo])

  useEffect(() => {
    function handleKeyDown(event) {
      if (isSaveHotkey(event)) {
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
  }, [selectedNodeId, selectedEdge, saveAll, handleDeletePrompt, setEdges])

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
          padding: 12,
          borderBottom: '1px solid #e5e7eb',
          display: 'grid',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>
              {selectedNode ? '선택 노드 도구' : '편집할 프롬프트를 선택하세요'}
            </span>
            <button
              type="button"
              onClick={() => setVariableDrawerOpen(true)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                background: '#0ea5e9',
                color: '#fff',
                fontWeight: 600,
                boxShadow: '0 8px 20px -12px rgba(14, 165, 233, 0.6)',
              }}
            >
              변수 설정
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => selectedNodeId && markAsStart(selectedNodeId)}
              disabled={!selectedNodeId}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: selectedNode?.data?.isStart ? '#dbeafe' : '#e2e8f0',
              }}
            >
              시작 지정
            </button>
            <button
              onClick={() => {
                if (!selectedNodeId) return
                setNodes((existing) =>
                  existing.map((node) =>
                    node.id === selectedNodeId
                      ? { ...node, data: { ...node.data, invisible: !node.data.invisible } }
                      : node,
                  ),
                )
              }}
              disabled={!selectedNodeId}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #cbd5f5',
              }}
            >
              Invisible 토글
            </button>
            <button
              onClick={() => selectedNodeId && handleDeletePrompt(selectedNodeId)}
              disabled={!selectedNodeId}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: '#fee2e2',
                color: '#b91c1c',
              }}
            >
              삭제
            </button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
          AI 응답 형식 가이드: 마지막 줄에는 승·패·탈락 결과를, 마지막에서 두 번째 줄에는 조건을 만족한 변수명만 기재하고,
          필요한 경우 그 위쪽 줄은 공란으로 남겨 둔 상태로 전송하세요.
        </p>
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

      <button
        type="button"
        onClick={() => setVariableDrawerOpen(true)}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 120,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#2563eb',
          color: '#fff',
          fontWeight: 700,
          border: 'none',
          boxShadow: '0 18px 45px -20px rgba(37, 99, 235, 0.65)',
          zIndex: 55,
        }}
        aria-label="변수 설정 열기"
      >
        변수
      </button>

      <VariableDrawer
        open={variableDrawerOpen}
        onClose={() => setVariableDrawerOpen(false)}
        selectedNode={selectedNode}
        globalRules={selectedGlobalRules}
        localRules={selectedLocalRules}
        commitGlobalRules={commitGlobalRules}
        commitLocalRules={commitLocalRules}
        availableNames={availableVariableNames}
        slotSuggestions={slotSuggestions}
        characterSuggestions={characterSuggestions}
      />
    </div>
  )
}

function VariableDrawer({
  open,
  onClose,
  selectedNode,
  globalRules,
  localRules,
  commitGlobalRules,
  commitLocalRules,
  availableNames,
  slotSuggestions,
  characterSuggestions,
}) {
  if (!open) {
    return null
  }

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.()
    }
  }

  const ready = !!(selectedNode && globalRules && localRules)

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          boxShadow: '-24px 0 60px -30px rgba(15, 23, 42, 0.4)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'grid' }}>
            <strong style={{ color: '#0f172a' }}>변수 규칙 설정</strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>전역/로컬 규칙을 한 번에 관리하세요.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: '#f1f5f9',
              border: '1px solid #cbd5f5',
              color: '#0f172a',
              fontWeight: 600,
            }}
          >
            닫기
          </button>
        </div>
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: 16,
            display: 'grid',
            gap: 16,
          }}
        >
          {ready ? (
            <>
              <VariableScopeEditor
                scopeKey={`${scopeKeyPrefix(selectedNode?.id)}-global`}
                label="전역 변수 규칙"
                rules={globalRules}
                onCommit={commitGlobalRules}
                availableNames={availableNames}
                slotSuggestions={slotSuggestions}
                characterSuggestions={characterSuggestions}
              />
              <VariableScopeEditor
                scopeKey={`${scopeKeyPrefix(selectedNode?.id)}-local`}
                label="로컬 변수 규칙"
                rules={localRules}
                onCommit={commitLocalRules}
                availableNames={availableNames}
                slotSuggestions={slotSuggestions}
                characterSuggestions={characterSuggestions}
              />
            </>
          ) : (
            <div
              style={{
                padding: '24px 16px',
                borderRadius: 12,
                border: '1px dashed #cbd5f5',
                background: '#f8fafc',
                color: '#475569',
                lineHeight: 1.5,
              }}
            >
              편집할 프롬프트를 먼저 선택하면 전역/로컬 변수 규칙을 설정할 수 있습니다.
            </div>
          )}
          <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
            AI 응답 가이드: 마지막 줄에는 승·패·탈락 결과를, 마지막에서 두 번째 줄에는 조건을 만족한 변수명만 기재하고,
            필요하다면 그 위 줄들은 공란으로 비워 두세요.
          </p>
        </div>
      </div>
    </div>
  )
}

function scopeKeyPrefix(nodeId) {
  if (!nodeId) return 'node'
  return String(nodeId)
}

function VariableScopeEditor({
  scopeKey,
  label,
  rules,
  onCommit,
  availableNames = [],
  slotSuggestions = [],
  characterSuggestions = [],
}) {
  const safeRules = rules || makeEmptyVariableRules()
  const mode = safeRules.mode || 'auto'

  const datalistId = `${scopeKey}-variable-names`
  const suggestionTokens = useMemo(() => {
    const entries = []
    const seen = new Set()
    slotSuggestions.forEach((item) => {
      if (!item || !item.token) return
      const token = String(item.token)
      if (seen.has(token)) return
      seen.add(token)
      entries.push({ token, label: item.label || token })
    })
    characterSuggestions.forEach((name) => {
      if (typeof name !== 'string') return
      const token = name.trim()
      if (!token || seen.has(token)) return
      seen.add(token)
      entries.push({ token, label: token })
    })
    return entries
  }, [slotSuggestions, characterSuggestions])

  const variableOptions = useMemo(() => {
    const options = new Set()
    availableNames.forEach((name) => {
      if (typeof name === 'string') {
        const trimmed = name.trim()
        if (trimmed) options.add(trimmed)
      }
    })
    suggestionTokens.forEach((item) => options.add(item.token))
    return Array.from(options)
  }, [availableNames, suggestionTokens])

  const appendToken = (value, token) => {
    if (!value) return token
    if (value.includes(token)) return value
    const needsSpace = value.length > 0 && !/\s$/.test(value)
    return `${value}${needsSpace ? ' ' : ''}${token}`
  }

  const renderSuggestionButtons = (onSelect, prefix) => {
    if (!suggestionTokens.length) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {suggestionTokens.map((item) => (
          <button
            key={`${prefix}-${item.token}`}
            type="button"
            onClick={() => onSelect(item.token)}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              background: '#e0f2fe',
              border: '1px solid #38bdf8',
              color: '#0369a1',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    )
  }

  const setMode = (nextMode) => {
    if (nextMode === mode) return
    onCommit((current) => ({ ...current, mode: nextMode }))
  }

  const addAutoRule = () => {
    onCommit((current) => ({ ...current, auto: [...current.auto, createAutoRule()] }))
  }

  const updateAutoRule = (index, patch) => {
    onCommit((current) => ({
      ...current,
      auto: current.auto.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    }))
  }

  const removeAutoRule = (index) => {
    onCommit((current) => ({
      ...current,
      auto: current.auto.filter((_, idx) => idx !== index),
    }))
  }

  const addManualRule = () => {
    onCommit((current) => ({ ...current, manual: [...current.manual, createManualRule()] }))
  }

  const updateManualRule = (index, patch) => {
    onCommit((current) => ({
      ...current,
      manual: current.manual.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    }))
  }

  const removeManualRule = (index) => {
    onCommit((current) => ({
      ...current,
      manual: current.manual.filter((_, idx) => idx !== index),
    }))
  }

  const addActiveRule = () => {
    onCommit((current) => ({ ...current, active: [...current.active, createActiveRule()] }))
  }

  const updateActiveRule = (index, patch) => {
    onCommit((current) => ({
      ...current,
      active: current.active.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    }))
  }

  const removeActiveRule = (index) => {
    onCommit((current) => ({
      ...current,
      active: current.active.filter((_, idx) => idx !== index),
    }))
  }

  const renderModeSelector = () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {VARIABLE_RULE_MODES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          onClick={() => setMode(candidate)}
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            border: mode === candidate ? '1px solid #0ea5e9' : '1px solid #cbd5f5',
            background: mode === candidate ? '#e0f2fe' : '#f8fafc',
            fontWeight: 600,
            color: mode === candidate ? '#0369a1' : '#475569',
          }}
        >
          {candidate === 'auto' ? '자동 승패 변수' : candidate === 'manual' ? '수동 변수' : '적극 변수'}
        </button>
      ))}
    </div>
  )

  const renderAutoMode = () => (
    <div style={{ display: 'grid', gap: 10 }}>
      {safeRules.auto.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b' }}>
          역할/상태 조건을 기반으로 자동으로 변수명을 기록할 규칙을 추가하세요.
        </div>
      )}
      {safeRules.auto.map((rule, index) => (
        <div
          key={rule.id || index}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 12,
            background: '#fff',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>변수명 (AI가 마지막에서 두 번째 줄에 적어줄 이름)</label>
            <input
              value={rule.variable || ''}
              onChange={(event) => updateAutoRule(index, { variable: event.target.value })}
              placeholder="예: guardian_protect"
              list={datalistId}
            />
            {renderSuggestionButtons(
              (token) => updateAutoRule(index, { variable: token }),
              `auto-variable-${index}`,
            )}
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>승패 처리</span>
              <select
                value={rule.outcome || 'win'}
                onChange={(event) => updateAutoRule(index, { outcome: event.target.value })}
              >
                {VARIABLE_RULE_OUTCOMES.map((option) => (
                  <option key={option} value={option}>
                    {option === 'win' ? '승리 처리' : option === 'lose' ? '패배 처리' : '무승부 처리'}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>대상</span>
              <select
                value={rule.subject || 'same'}
                onChange={(event) => updateAutoRule(index, { subject: event.target.value })}
              >
                {VARIABLE_RULE_SUBJECTS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'same' ? '같은 역할' : option === 'other' ? '상대 역할' : '특정 역할'}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>비교</span>
              <select
                value={rule.comparator || 'gte'}
                onChange={(event) => updateAutoRule(index, { comparator: event.target.value })}
              >
                {VARIABLE_RULE_COMPARATORS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'gte' ? '이상' : option === 'lte' ? '이하' : '정확히'}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>인원 수</span>
              <input
                type="number"
                min="0"
                value={Number.isFinite(Number(rule.count)) ? rule.count : ''}
                onChange={(event) => updateAutoRule(index, { count: Number(event.target.value) })}
              />
            </label>
          </div>
          {rule.subject === 'specific' && (
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#475569' }}>역할 이름</label>
              <input
                value={rule.role || ''}
                onChange={(event) => updateAutoRule(index, { role: event.target.value })}
                placeholder="예: 힐러"
              />
            </div>
          )}
          <div style={{ display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>조건</label>
            <select
              value={rule.status || 'alive'}
              onChange={(event) => updateAutoRule(index, { status: event.target.value })}
            >
              {VARIABLE_RULE_STATUS.map((option) => (
                <option key={option} value={option}>
                  {option === 'alive'
                    ? '생존 상태'
                    : option === 'dead'
                    ? '탈락 상태'
                    : option === 'won'
                    ? '승리 상태'
                    : option === 'lost'
                    ? '패배 상태'
                    : '다른 변수 ON'}
                </option>
              ))}
            </select>
          </div>
          {rule.status === 'flag_on' && (
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#475569' }}>참조할 변수명</label>
              <input
                list={datalistId}
                value={rule.flag || ''}
                onChange={(event) => updateAutoRule(index, { flag: event.target.value })}
                placeholder="예: guardian_protect"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => removeAutoRule(index)}
            style={{ alignSelf: 'start', padding: '6px 10px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' }}
          >
            규칙 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addAutoRule}
        style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600 }}
      >
        + 자동 규칙 추가
      </button>
    </div>
  )

  const renderManualMode = () => (
    <div style={{ display: 'grid', gap: 10 }}>
      {safeRules.manual.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b' }}>
          직접 조건을 설명하면 AI가 해당 변수명만 마지막에서 두 번째 줄에 출력하도록 안내할 수 있습니다.
        </div>
      )}
      {safeRules.manual.map((rule, index) => (
        <div
          key={rule.id || index}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 12,
            background: '#fff',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>변수명</label>
            <input
              value={rule.variable || ''}
              onChange={(event) => updateManualRule(index, { variable: event.target.value })}
              placeholder="예: custom_flag"
              list={datalistId}
            />
            {renderSuggestionButtons(
              (token) => updateManualRule(index, { variable: token }),
              `manual-variable-${index}`,
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>조건 설명</label>
            <textarea
              rows={3}
              value={rule.condition || ''}
              onChange={(event) => updateManualRule(index, { condition: event.target.value })}
              placeholder="예: 이전 턴 응답에 '회복'이 포함되면"
            />
            {renderSuggestionButtons(
              (token) => updateManualRule(index, { condition: appendToken(rule.condition || '', token) }),
              `manual-condition-${index}`,
            )}
          </div>
          <button
            type="button"
            onClick={() => removeManualRule(index)}
            style={{ alignSelf: 'start', padding: '6px 10px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' }}
          >
            규칙 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addManualRule}
        style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600 }}
      >
        + 수동 변수 추가
      </button>
    </div>
  )

  const renderActiveMode = () => (
    <div style={{ display: 'grid', gap: 10 }}>
      {safeRules.active.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b' }}>
          적극 변수는 AI에게 특정 지시를 직접 전달할 때 사용합니다. 조건을 만족하면 실행할 지시문을 작성하세요.
        </div>
      )}
      {safeRules.active.map((rule, index) => (
        <div
          key={rule.id || index}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 12,
            background: '#fff',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>조건 (자연어 또는 규칙 설명)</label>
            <textarea
              rows={3}
              value={rule.condition || ''}
              onChange={(event) => updateActiveRule(index, { condition: event.target.value })}
              placeholder="예: 이번 턴에 방어 성공이라는 단어가 포함되면"
            />
            {renderSuggestionButtons(
              (token) => updateActiveRule(index, { condition: appendToken(rule.condition || '', token) }),
              `active-condition-${index}`,
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#475569' }}>AI에게 전달할 지시</label>
            <textarea
              rows={3}
              value={rule.directive || ''}
              onChange={(event) => updateActiveRule(index, { directive: event.target.value })}
              placeholder="예: 다음 턴에는 적의 약점을 분석하라"
            />
            {renderSuggestionButtons(
              (token) => updateActiveRule(index, { directive: appendToken(rule.directive || '', token) }),
              `active-directive-${index}`,
            )}
          </div>
          <button
            type="button"
            onClick={() => removeActiveRule(index)}
            style={{ alignSelf: 'start', padding: '6px 10px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' }}
          >
            지시 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addActiveRule}
        style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600 }}
      >
        + 적극 변수 추가
      </button>
    </div>
  )

  return (
    <div
      style={{
        border: '1px solid #cbd5f5',
        borderRadius: 16,
        background: '#ffffff',
        padding: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      <datalist id={datalistId}>
        {variableOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{label}</span>
        {renderModeSelector()}
      </div>
      {mode === 'auto' && renderAutoMode()}
      {mode === 'manual' && renderManualMode()}
      {mode === 'active' && renderActiveMode()}
    </div>
  )
}

// 내보내기/가져오기 - 컴포넌트 바깥에 정의
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
    slots: (slots.data || []).map((slot) => ({
      ...slot,
      var_rules_global: sanitizeVariableRules(slot?.var_rules_global),
      var_rules_local: sanitizeVariableRules(slot?.var_rules_local),
    })),
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

    window.location.assign(`/maker/${insertedSet.id}`)
  } catch (err) {
    console.error(err)
    alert(err instanceof Error ? err.message : 'JSON을 불러오지 못했습니다.')
  } finally {
    event.target.value = ''
  }
}


