'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import {
  addEdge,
  useEdgesState,
  useNodesState,
} from 'reactflow'

import { supabase } from '../../lib/supabase'
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
} from '../../lib/variableRules'

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

function isSaveHotkey(event) {
  if (event.key !== 's') return false
  return isMac() ? event.metaKey : event.ctrlKey
}

export function useMakerEditor() {
  const router = useRouter()
  const { id: setId } = router.query || {}

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [setInfo, setSetInfo] = useState(null)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [activePanelTab, setActivePanelTab] = useState('selection')

  const mapFlowToSlot = useRef(new Map())

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
    if (selectedEdge) {
      setActivePanelTab('tools')
    }
  }, [selectedEdge])

  useEffect(() => {
    if (!selectedNodeId && !selectedEdge && activePanelTab === 'tools') {
      setActivePanelTab('selection')
    }
  }, [selectedNodeId, selectedEdge, activePanelTab])

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
  }, [setId, isReady, router, buildEdgeLabel, markAsStart, setNodes, setEdges, handleDeletePrompt])

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

  const panelTabs = useMemo(
    () => [
      { id: 'selection', label: '선택' },
      { id: 'tools', label: '도구' },
      { id: 'guide', label: '가이드' },
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

  const appendTokenToSelected = useCallback(
    (token) => {
      if (!selectedNodeId) return
      setNodes((existing) =>
        existing.map((node) =>
          node.id === selectedNodeId
            ? { ...node, data: { ...node.data, template: `${node.data.template || ''}${token}` } }
            : node,
        ),
      )
    },
    [selectedNodeId, setNodes],
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

  const goToSetList = useCallback(() => {
    router.push('/maker')
  }, [router])

  const goToLobby = useCallback(() => {
    router.push('/rank')
  }, [router])

  const slotSuggestions = useMemo(() => {
    const suggestions = nodes
      .map((node) => node?.data?.slotNo)
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)

    return suggestions.map((value) => ({ label: `슬롯 #${value}`, value }))
  }, [nodes])

  const characterSuggestions = useMemo(() => {
    const suggestions = new Map()
    nodes.forEach((node) => {
      const template = node?.data?.template || ''
      template
        .split(/\s+/)
        .filter((word) => word.startsWith('@'))
        .forEach((word) => {
          const key = word.replace(/^@/, '')
          if (!key) return
          suggestions.set(key, key)
        })
    })

    return Array.from(suggestions.values()).map((value) => ({ label: value, value }))
  }, [nodes])

  return {
    router,
    isReady,
    loading,
    busy,
    setInfo,
    nodes,
    setNodes,
    edges,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    onSelectionChange,
    onNodesDelete,
    onEdgesDelete,
    selectedNodeId,
    selectedEdge,
    selectedNode,
    setSelectedNodeId,
    setSelectedEdge,
    markAsStart,
    toggleInvisible,
    handleDeletePrompt,
    addPromptNode,
    saveAll,
    panelTabs,
    activePanelTab,
    setActivePanelTab,
    selectedGlobalRules,
    selectedLocalRules,
    commitGlobalRules,
    commitLocalRules,
    availableVariableNames,
    selectedVisibility,
    updateVisibility,
    slotSuggestions,
    characterSuggestions,
    appendTokenToSelected,
    rebuildEdgeLabel,
    goToSetList,
    goToLobby,
  }
}

export const variableRuleMetadata = {
  comparators: VARIABLE_RULE_COMPARATORS,
  modes: VARIABLE_RULE_MODES,
  outcomes: VARIABLE_RULE_OUTCOMES,
  status: VARIABLE_RULE_STATUS,
  subjects: VARIABLE_RULE_SUBJECTS,
  createAutoRule,
  createManualRule,
  createActiveRule,
}

//
