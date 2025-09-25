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
import PromptNode from '../PromptNode'
import SidePanel from '../SidePanel'
import VariableDrawer from './VariableDrawer'
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
import { exportSet, importSet } from './importExport'

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

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [setInfo, setSetInfo] = useState(null)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [variableDrawerOpen, setVariableDrawerOpen] = useState(false)
  const [activePanelTab, setActivePanelTab] = useState('selection')

  const mapFlowToSlot = useRef(new Map())

  useEffect(() => {
    if (selectedEdge) {
      setActivePanelTab('tools')
    }
  }, [selectedEdge])

  useEffect(() => {
    if (!selectedNodeId && !selectedEdge && activePanelTab === 'tools') {
      setActivePanelTab('selection')
    }
  }, [selectedNodeId, selectedEdge, activePanelTab])

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

  const isReady = router.isReady

  useEffect(() => {
    if (!setId || !isReady) return

    let active = true

    async function load() {
      setLoading(true)

      try {
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

        const visibleList = Array.isArray(slot.visible_slots)
          ? slot.visible_slots
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value))
          : []

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
            visible_slots: visibleList,
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
      } catch (error) {
        if (!active) return
        console.error(error)
        alert('세트를 불러오지 못했습니다.')
        router.replace('/maker')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      active = false
    }
  }, [setId, isReady, router, buildEdgeLabel, markAsStart, setNodes, setEdges])

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

  const selectedVisibility = useMemo(() => {
    if (!selectedNode) {
      return { invisible: false, visible_slots: [] }
    }

    const list = Array.isArray(selectedNode.data?.visible_slots)
      ? selectedNode.data.visible_slots
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : []

    return { invisible: !!selectedNode.data?.invisible, visible_slots: list }
  }, [selectedNode])

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

  const panelTabs = useMemo(
    () => [
      { id: 'selection', label: '선택 정보' },
      { id: 'tools', label: '편집 도구' },
      { id: 'guide', label: '도움말' },
    ],
    [],
  )

  const updateVisibility = useCallback(
    (builder) => {
      if (!selectedNodeId) return
      setNodes((existing) =>
        existing.map((node) => {
          if (node.id !== selectedNodeId) return node

          const baseList = Array.isArray(node.data?.visible_slots)
            ? node.data.visible_slots
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
            : []
          const current = {
            invisible: !!node.data?.invisible,
            visible_slots: baseList,
          }
          const next = typeof builder === 'function' ? builder(current) : builder
          const normalizedList = Array.isArray(next?.visible_slots)
            ? next.visible_slots
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
            : []

          return {
            ...node,
            data: {
              ...node.data,
              invisible: !!next?.invisible,
              visible_slots: normalizedList,
            },
          }
        }),
      )
    },
    [selectedNodeId, setNodes],
  )

  const toggleInvisible = useCallback(() => {
    updateVisibility((current) => ({
      invisible: !current.invisible,
      visible_slots: current.visible_slots,
    }))
  }, [updateVisibility])

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
              visible_slots: [],
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
          visible_slots: Array.isArray(node.data.visible_slots)
            ? node.data.visible_slots
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
            : [],
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
        const target = event.target
        const tagName = target?.tagName?.toLowerCase?.() ?? ''
        const isEditableElement =
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          target?.isContentEditable ||
          target?.getAttribute?.('role') === 'textbox'

        if (isEditableElement) {
          return
        }

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

  if (!isReady || loading) {
    return <div style={{ padding: 20 }}>불러오는 중…</div>
  }

  return (
    <div style={{ height: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 720,
          width: '100%',
          margin: '0 auto',
          padding: '12px 16px 96px',
          boxSizing: 'border-box',
          gap: 12,
        }}
      >
        <header
          style={{
            background: '#ffffff',
            borderRadius: 16,
            padding: '14px 16px',
            boxShadow: '0 16px 40px -34px rgba(15, 23, 42, 0.45)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push('/maker')}
              style={{
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid #cbd5f5',
                background: '#f1f5f9',
                color: '#0f172a',
                fontWeight: 600,
              }}
            >
              ← 목록
            </button>
            <strong style={{ fontSize: 16, color: '#0f172a' }}>{setInfo?.name || '이름 없는 세트'}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => addPromptNode('ai')}
              style={{
                padding: '8px 14px',
                borderRadius: 12,
                background: '#2563eb',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              + 프롬프트
            </button>
            <button
              onClick={() => addPromptNode('user_action')}
              style={{
                padding: '8px 14px',
                borderRadius: 12,
                background: '#0ea5e9',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              + 유저 행동
            </button>
            <button
              onClick={() => addPromptNode('system')}
              style={{
                padding: '8px 14px',
                borderRadius: 12,
                background: '#6b7280',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              + 시스템
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={busy}
              style={{
                padding: '8px 14px',
                borderRadius: 12,
                background: '#111827',
                color: '#fff',
                fontWeight: 600,
                opacity: busy ? 0.65 : 1,
              }}
            >
              {busy ? '저장 중…' : '저장 (⌘/Ctrl+S)'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={exportSet} style={{ padding: '8px 14px', borderRadius: 12, background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
              내보내기
            </button>
            <label
              style={{
                padding: '8px 14px',
                borderRadius: 12,
                border: '1px dashed #94a3b8',
                background: '#f8fafc',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              가져오기
              <input type="file" accept="application/json" onChange={importSet} style={{ display: 'none' }} />
            </label>
            <button onClick={() => router.push('/rank')} style={{ padding: '8px 14px', borderRadius: 12, background: '#0f172a', color: '#fff', fontWeight: 600 }}>
              로비로
            </button>
          </div>
        </header>

        <section
          style={{
            background: '#ffffff',
            borderRadius: 18,
            padding: '12px 16px',
            boxShadow: '0 16px 36px -32px rgba(15, 23, 42, 0.45)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {panelTabs.map((tab) => {
                const active = tab.id === activePanelTab
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActivePanelTab(tab.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: active ? '1px solid #2563eb' : '1px solid #e2e8f0',
                      background: active ? '#e0f2fe' : '#f8fafc',
                      color: active ? '#1d4ed8' : '#475569',
                      fontWeight: 600,
                    }}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setVariableDrawerOpen(true)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                background: '#0ea5e9',
                color: '#fff',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              변수 설정
            </button>
          </div>

          <div
            style={{
              border: '1px solid #eef2f6',
              borderRadius: 14,
              padding: '12px 14px',
              minHeight: 140,
              maxHeight: '40vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              background: '#fdfdff',
            }}
          >
            {activePanelTab === 'selection' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>
                  {selectedNode
                    ? '선택한 프롬프트를 편집 중입니다.'
                    : selectedEdge
                    ? '선택한 브릿지를 편집 중입니다.'
                    : '편집할 프롬프트 또는 브릿지를 선택하세요.'}
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => selectedNodeId && markAsStart(selectedNodeId)}
                    disabled={!selectedNodeId}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      background: selectedNode?.data?.isStart ? '#dbeafe' : '#e2e8f0',
                      color: '#0f172a',
                      fontWeight: 600,
                      opacity: selectedNodeId ? 1 : 0.6,
                    }}
                  >
                    시작 지정
                  </button>
                  <button
                    onClick={toggleInvisible}
                    disabled={!selectedNodeId}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      background: '#f8fafc',
                      border: '1px solid #cbd5f5',
                      color: '#0f172a',
                      fontWeight: 600,
                      opacity: selectedNodeId ? 1 : 0.6,
                    }}
                  >
                    {selectedNode?.data?.invisible ? '숨김 해제' : '숨김 모드'}
                  </button>
                  <button
                    onClick={() => selectedNodeId && handleDeletePrompt(selectedNodeId)}
                    disabled={!selectedNodeId}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      background: '#fee2e2',
                      color: '#b91c1c',
                      fontWeight: 600,
                      opacity: selectedNodeId ? 1 : 0.6,
                    }}
                  >
                    삭제
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                  AI 응답 가이드: 마지막 줄에는 승·패·탈락 결과를, 마지막에서 두 번째 줄에는 조건을 만족한 변수명만 기재하고 필요할 때만 위 줄을 채워 주세요.
                </p>
              </div>
            )}

            {activePanelTab === 'tools' && (
              <div style={{ minHeight: 160 }}>
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
            )}

            {activePanelTab === 'guide' && (
              <div style={{ display: 'grid', gap: 8, color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
                <p style={{ margin: 0 }}>
                  • 노드를 선택해 템플릿과 변수 규칙을 다듬고, 필요하면 Invisible 토글로 노출 범위를 조정하세요.
                </p>
                <p style={{ margin: 0 }}>
                  • 브릿지를 선택하면 조건 빌더에서 턴/변수 조건과 확률을 설정할 수 있습니다.
                </p>
                <p style={{ margin: 0 }}>
                  • 오른쪽 하단의 변수 버튼을 눌러 전역·로컬 변수 규칙을 언제든지 확인할 수 있습니다.
                </p>
              </div>
            )}
          </div>
        </section>

        <div
          style={{
            flex: '1 1 auto',
            minHeight: 420,
            background: '#ffffff',
            borderRadius: 18,
            boxShadow: '0 20px 45px -36px rgba(15, 23, 42, 0.5)',
            overflow: 'hidden',
          }}
        >
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
            minZoom={0.1}
            maxZoom={2.4}
            zoomOnPinch
            zoomOnScroll
            panOnScroll
            panOnDrag
            fitViewOptions={{ padding: 0.24, duration: 400 }}
            style={{ width: '100%', height: '100%', touchAction: 'none' }}
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setVariableDrawerOpen(true)}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 28,
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
        visibility={selectedVisibility}
        onVisibilityChange={updateVisibility}
        onToggleInvisible={toggleInvisible}
      />
    </div>
  )
}


//
//
