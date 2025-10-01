'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { useMakerEditorGraph } from './editor/useMakerEditorGraph'
import { useMakerEditorLoader } from './editor/useMakerEditorLoader'
import { useMakerEditorPersistence } from './editor/useMakerEditorPersistence'
import { useMakerEditorShortcuts } from './editor/useMakerEditorShortcuts'
import {
  createActiveRule,
  createAutoRule,
  createManualRule,
  makeEmptyVariableRules,
  VARIABLE_RULE_COMPARATORS,
  VARIABLE_RULE_MODES,
  VARIABLE_RULE_OUTCOMES,
  VARIABLE_RULE_STATUS,
  VARIABLE_RULE_SUBJECTS,
  VARIABLE_RULES_VERSION,
} from '../../lib/variableRules'

export function useMakerEditor() {
  const router = useRouter()
  const { id: setId } = router.query || {}

  const [loading, setLoading] = useState(true)
  const [setInfo, setSetInfo] = useState(null)
  const [versionAlert, setVersionAlert] = useState(null)
  const [saveReceipt, setSaveReceipt] = useState(null)

  const flowMapRef = useRef(new Map())
  const deleteNodeRef = useRef(() => {})
  const versionNoticeRef = useRef(null)
  const graph = useMakerEditorGraph(flowMapRef)

  const clearVersionAlert = useCallback(() => {
    setVersionAlert(null)
  }, [])

  const handleVersionDrift = useCallback((alert) => {
    versionNoticeRef.current = alert
    setVersionAlert(alert)
  }, [])

  const handleAfterSave = useCallback(() => {
    const notice = versionNoticeRef.current
    const detailCount = Array.isArray(notice?.details) ? notice.details.length : 0
    const receipt = {
      id: Date.now(),
      timestamp: Date.now(),
      message: detailCount
        ? `변수 규칙 ${detailCount}건을 v${VARIABLE_RULES_VERSION}로 자동 갱신했습니다.`
        : '모든 변수 규칙이 최신 버전입니다.',
      details: detailCount ? notice.details : [],
    }

    if (detailCount) {
      console.info(
        '[MakerEditor] 변수 규칙 버전 자동 갱신 완료',
        { count: detailCount, details: receipt.details },
      )
    } else {
      console.info('[MakerEditor] 저장 완료 - 변수 규칙은 이미 최신 상태였습니다.')
    }

    setSaveReceipt(receipt)
    versionNoticeRef.current = null
    setVersionAlert(null)
  }, [])

  const ackSaveReceipt = useCallback((id) => {
    setSaveReceipt((current) => {
      if (!current) return current
      if (current.id !== id) return current
      return null
    })
  }, [])

  const {
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
    appendTokenToSelected,
    rebuildEdgeLabel,
    loadGraph,
    markAsStart,
  } = graph

  const { busy, saveAll, handleDeletePrompt, onNodesDelete, onEdgesDelete, removeEdge } =
    useMakerEditorPersistence({ graph, setInfo, onAfterSave: handleAfterSave })

  deleteNodeRef.current = handleDeletePrompt

  const loadGraphWithHandlers = useCallback(
    (slots, bridges) =>
      loadGraph(slots, bridges, {
        onDelete: (flowNodeId) => deleteNodeRef.current(flowNodeId),
        onSetStart: markAsStart,
      }),
    [loadGraph, markAsStart],
  )

  useMakerEditorLoader({
    setId,
    isReady: router.isReady,
    router,
    setLoading,
    setSetInfo,
    loadGraph: loadGraphWithHandlers,
    onVersionDrift: handleVersionDrift,
  })

  useMakerEditorShortcuts({
    selectedNodeId,
    selectedEdge,
    onDeleteNode: handleDeletePrompt,
    onDeleteEdge: removeEdge,
    saveAll,
  })

  const goToSetList = useCallback(() => {
    router.push('/maker')
  }, [router])

  const goToLobby = useCallback(() => {
    router.push('/rank')
  }, [router])

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
              onDelete: () => handleDeletePrompt(flowId),
              onSetStart: () => markAsStart(flowId),
            },
          },
        ]
      })

      setSelectedNodeId(flowId)
    },
    [handleDeletePrompt, markAsStart, setNodes, setSelectedNodeId],
  )

  const characterVisibility = useMemo(() => ({
    invisible: selectedVisibility.invisible,
    visible_slots: selectedVisibility.visible_slots,
  }), [selectedVisibility])

  return {
    router,
    isReady: router.isReady,
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
    selectedVisibility: characterVisibility,
    updateVisibility,
    slotSuggestions,
    characterSuggestions,
    appendTokenToSelected,
    rebuildEdgeLabel,
    goToSetList,
    goToLobby,
    versionAlert,
    clearVersionAlert,
    saveReceipt,
    ackSaveReceipt,
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
