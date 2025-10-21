'use client'

import { useCallback } from 'react'
import { addEdge, useEdgesState, useNodesState } from 'reactflow'

import {
  buildEdgeLabel,
  createEdgesFromBridges,
  mapSlotRowsToNodes,
  normalizeSlotId,
} from './graphTransforms'
import { useGraphSelection, variablePanelTabs } from './useGraphSelection'

export function useMakerEditorGraph(flowMapRef) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const selection = useGraphSelection(nodes, setNodes)

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

  const rebuildEdgeLabel = useCallback((data) => buildEdgeLabel(data), [])

  const loadGraph = useCallback(
    (slotRows = [], bridgeRows = [], options = {}) => {
      const { onDelete = () => {}, onSetStart } = options
      const { slotMap, nodes: preparedNodes } = mapSlotRowsToNodes(slotRows)
      flowMapRef.current = slotMap

      setNodes(
        preparedNodes.map((node) => ({
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

      setEdges(createEdgesFromBridges(bridgeRows))
    },
    [flowMapRef, markAsStart, setEdges, setNodes],
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
    ...selection,
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

export { variablePanelTabs }
