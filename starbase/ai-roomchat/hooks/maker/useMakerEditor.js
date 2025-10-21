'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [saveHistory, setSaveHistory] = useState([])
  const [historyStorageKey, setHistoryStorageKey] = useState('')
  const historyStorageKeyRef = useRef(null)
  const historyLoadedRef = useRef(false)

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
    const timestamp = Date.now()
    const receipt = {
      id: timestamp,
      timestamp,
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
      setSaveHistory((current) => {
        const entry = {
          id: timestamp,
          timestamp,
          message: receipt.message,
          details: receipt.details,
          summary: notice?.summary || null,
        }
        return [entry, ...current].slice(0, 25)
      })
    } else {
      console.info('[MakerEditor] 저장 완료 - 변수 규칙은 이미 최신 상태였습니다.')
    }

    setSaveReceipt(receipt)
    versionNoticeRef.current = null
    setVersionAlert(null)
  }, [])

  useEffect(() => {
    if (!router.isReady || !setId) {
      historyStorageKeyRef.current = null
      historyLoadedRef.current = false
      setHistoryStorageKey('')
      return
    }
    if (typeof window === 'undefined') return

    const key = `maker:history:${setId}`
    historyStorageKeyRef.current = key
    historyLoadedRef.current = false
    setHistoryStorageKey(key)

    try {
      const stored = window.localStorage.getItem(key)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setSaveHistory(parsed)
        } else {
          setSaveHistory([])
        }
      } else {
        setSaveHistory([])
      }
    } catch (error) {
      console.warn('[MakerEditor] 저장된 히스토리 불러오기 실패', error)
    } finally {
      historyLoadedRef.current = true
    }
  }, [router.isReady, setId])

  useEffect(() => {
    if (!historyLoadedRef.current) return
    if (!historyStorageKeyRef.current) return
    if (typeof window === 'undefined') return

    try {
      if (saveHistory.length === 0) {
        window.localStorage.removeItem(historyStorageKeyRef.current)
      } else {
        window.localStorage.setItem(
          historyStorageKeyRef.current,
          JSON.stringify(saveHistory),
        )
      }
    } catch (error) {
      console.warn('[MakerEditor] 히스토리 저장 실패', error)
    }
  }, [saveHistory])

  const clearSaveHistory = useCallback(() => {
    setSaveHistory([])
    if (typeof window === 'undefined') return
    if (!historyStorageKeyRef.current) return
    try {
      window.localStorage.removeItem(historyStorageKeyRef.current)
    } catch (error) {
      console.warn('[MakerEditor] 히스토리 초기화 실패', error)
    }
  }, [])

  const ackSaveReceipt = useCallback((id) => {
    setSaveReceipt((current) => {
      if (!current) return current
      if (current.id !== id) return current
      return null
    })
  }, [])

  const setInfoName = setInfo?.name || ''

  const exportSaveHistory = useCallback(() => {
    if (!Array.isArray(saveHistory) || saveHistory.length === 0) {
      return
    }

    if (typeof window === 'undefined') return

    const rawSetId = router?.query?.id
    const setIdValue = Array.isArray(rawSetId) ? rawSetId[0] : rawSetId
    const safeName = (setInfoName || 'maker-set')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 60)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filenameParts = [safeName || 'maker-set']
    if (setIdValue) {
      filenameParts.push(setIdValue)
    }
    filenameParts.push(`history-${timestamp}`)
    const filename = `${filenameParts.join('-')}.json`

    try {
      const payload = JSON.stringify(saveHistory, null, 2)
      const blob = new Blob([payload], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url)
      }, 1000)
    } catch (error) {
      console.error('[MakerEditor] 히스토리 내보내기에 실패했습니다.', error)
    }
  }, [router?.query?.id, saveHistory, setInfoName])

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
    (type = 'ai', template = '') => {
      const flowId = `tmp_${Date.now()}`

      setNodes((existing) => {
        const slotNo = existing.length + 1
        return [
          ...existing,
          {
            id: flowId,
            type: 'prompt',
            position: { x: 160 + (existing.length * 200), y: 120 + (existing.length * 50) },
            data: {
              template: template,
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

  const characterVisibility = useMemo(
    () => ({
      invisible: selectedVisibility.invisible,
      visible_slots: selectedVisibility.visible_slots,
    }),
    [selectedVisibility],
  )

  return {
    status: {
      router,
      isReady: router.isReady,
      loading,
      setInfo,
    },
    graph: {
      nodes,
      setNodes,
      edges,
      setEdges,
      onNodesChange,
      onEdgesChange,
      onConnect,
      onNodesDelete,
      onEdgesDelete,
    },
    selection: {
      selectedNodeId,
      selectedEdge,
      selectedNode,
      onNodeClick,
      onEdgeClick,
      onPaneClick,
      onSelectionChange,
      panelTabs,
      activePanelTab,
      setActivePanelTab,
      markAsStart,
      appendTokenToSelected,
    },
    variables: {
      selectedGlobalRules,
      selectedLocalRules,
      commitGlobalRules,
      commitLocalRules,
      availableVariableNames,
      selectedVisibility: characterVisibility,
      updateVisibility,
      toggleInvisible,
      slotSuggestions,
      characterSuggestions,
    },
    persistence: {
      busy,
      saveAll,
      deletePrompt: handleDeletePrompt,
      addPromptNode,
      goToSetList,
      goToLobby,
    },
    history: {
      entries: saveHistory,
      storageKey: historyStorageKey,
      exportEntries: exportSaveHistory,
      clearEntries: clearSaveHistory,
      receipt: saveReceipt,
      ackReceipt: ackSaveReceipt,
    },
    version: {
      alert: versionAlert,
      clearAlert: clearVersionAlert,
    },
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
