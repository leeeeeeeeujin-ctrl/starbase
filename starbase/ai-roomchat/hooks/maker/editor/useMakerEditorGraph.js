'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { addEdge, useEdgesState, useNodesState } from 'reactflow'

import {
  collectVariableNames,
  sanitizeVariableRules,
  variableRulesEqual,
} from '../../../lib/variableRules'

function normalizeVisibleList(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
}

function readSlotPosition(slot, index) {
  const fallbackX = 120 + (index % 3) * 380
  const fallbackY = 120 + Math.floor(index / 3) * 260
  const posX = typeof slot?.canvas_x === 'number' ? slot.canvas_x : fallbackX
  const posY = typeof slot?.canvas_y === 'number' ? slot.canvas_y : fallbackY
  return { x: posX, y: posY }
}

function normalizeSlotId(value) {
  if (value == null) return null
  if (typeof value === 'number') return value
  const str = String(value)
  if (str.startsWith('n')) {
    const num = Number(str.slice(1))
    return Number.isFinite(num) ? num : str
  }
  const num = Number(str)
  return Number.isFinite(num) ? num : str
}

export function useMakerEditorGraph(flowMapRef) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [activePanelTab, setActivePanelTab] = useState('selection')

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

  const loadGraph = useCallback(
    (slotRows = [], bridgeRows = [], options = {}) => {
      const { onDelete = () => {}, onSetStart } = options
      const slotMap = new Map()
      const initialNodes = slotRows.map((slot, index) => {
        const flowId = `n${slot.id}`
        slotMap.set(flowId, slot.id)
        const position = readSlotPosition(slot, index)
        const visibleList = normalizeVisibleList(slot.visible_slots)

        return {
          id: flowId,
          type: 'prompt',
          position,
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
          },
        }
      })

      flowMapRef.current = slotMap

      setNodes(
        initialNodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            onChange: (partial) =>
              setNodes((current) =>
                current.map((item) =>
                  item.id === node.id ? { ...item, data: { ...item.data, ...partial } } : item,
                ),
              ),
            onDelete: () => onDelete(node.id),
            onSetStart: () => (onSetStart ? onSetStart(node.id) : markAsStart(node.id)),
          },
        })),
      )

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

      setEdges(initialEdges)
    },
    [buildEdgeLabel, flowMapRef, markAsStart, setEdges, setNodes],
  )

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

    return {
      invisible: !!selectedNode.data?.invisible,
      visible_slots: normalizeVisibleList(selectedNode.data?.visible_slots),
    }
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

          const current = {
            invisible: !!node.data?.invisible,
            visible_slots: normalizeVisibleList(node.data?.visible_slots),
          }
          const next = typeof builder === 'function' ? builder(current) : builder
          return {
            ...node,
            data: {
              ...node.data,
              invisible: !!next?.invisible,
              visible_slots: normalizeVisibleList(next?.visible_slots),
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

  const forgetFlowNode = useCallback(
    (flowNodeId) => {
      flowMapRef.current.delete(flowNodeId)
    },
    [flowMapRef],
  )

  return {
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
    selectedNodeId,
    setSelectedNodeId,
    selectedEdge,
    setSelectedEdge,
    selectedNode,
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
    toggleInvisible,
    slotSuggestions,
    characterSuggestions,
    appendTokenToSelected: (token) => {
      if (!selectedNodeId) return
      setNodes((existing) =>
        existing.map((node) =>
          node.id === selectedNodeId
            ? { ...node, data: { ...node.data, template: `${node.data.template || ''}${token}` } }
            : node,
        ),
      )
    },
    rebuildEdgeLabel,
    loadGraph,
    markAsStart,
    forgetFlowNode,
    flowMapRef,
  }
}

export function normalizeTargetSlot(target) {
  return normalizeSlotId(target)
}

export const variablePanelTabs = ['selection', 'tools', 'guide']

//
