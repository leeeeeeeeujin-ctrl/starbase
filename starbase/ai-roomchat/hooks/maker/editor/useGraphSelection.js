'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  collectVariableNames,
  sanitizeVariableRules,
  variableRulesEqual,
} from '../../../lib/variableRules'
import { normalizeVisibleList } from './graphTransforms'

const TAB_LABELS = { selection: '선택', tools: '도구', guide: '가이드' }

export const variablePanelTabs = ['selection', 'tools', 'guide']

export function useGraphSelection(nodes, setNodes) {
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [activePanelTab, setActivePanelTab] = useState('selection')

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

  const onSelectionChange = useCallback(({ nodes: pickedNodes, edges: pickedEdges }) => {
    if (pickedNodes?.length) {
      setSelectedNodeId(pickedNodes[0].id)
      setSelectedEdge(null)
      return
    }
    if (pickedEdges?.length) {
      setSelectedEdge(pickedEdges[0])
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
    () => variablePanelTabs.map((id) => ({ id, label: TAB_LABELS[id] || id })),
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

  return {
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
    appendTokenToSelected,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    onSelectionChange,
  }
}
