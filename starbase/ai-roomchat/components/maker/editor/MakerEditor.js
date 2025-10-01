'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useMakerEditor } from '../../../hooks/maker/useMakerEditor'
import { exportSet, importSet } from './importExport'
import MakerEditorCanvas from './MakerEditorCanvas'
import MakerEditorHeader from './MakerEditorHeader'
import MakerEditorPanel from './MakerEditorPanel'
import VariableDrawer from './VariableDrawer'

export default function MakerEditor() {
  const {
    isReady,
    loading,
    busy,
    setInfo,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    onSelectionChange,
    onNodesDelete,
    onEdgesDelete,
    selectedNode,
    selectedNodeId,
    selectedEdge,
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
    goToSetList,
    goToLobby,
    setNodes,
    setEdges,
    versionAlert,
    clearVersionAlert,
    saveReceipt,
    ackSaveReceipt,
  } = useMakerEditor()
  const [variableDrawerOpen, setVariableDrawerOpen] = useState(false)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [receiptVisible, setReceiptVisible] = useState(null)

  const collapsedQuickActions = useMemo(
    () => [
      { label: '+AI', onClick: () => addPromptNode('ai') },
      { label: '+유저', onClick: () => addPromptNode('user_action') },
      { label: '+시스템', onClick: () => addPromptNode('system') },
      { label: busy ? '저장 중…' : '저장', onClick: saveAll, disabled: busy },
    ],
    [addPromptNode, busy, saveAll],
  )

  const openInspector = useCallback(
    (tabId) => {
      if (tabId) {
        const hasTab = panelTabs?.some((tab) => tab.id === tabId)
        if (hasTab) {
          setActivePanelTab(tabId)
        } else if (panelTabs?.length) {
          setActivePanelTab(panelTabs[0].id)
        }
      } else if (panelTabs?.length) {
        setActivePanelTab(panelTabs[0].id)
      }

      setInspectorOpen(true)
    },
    [panelTabs, setActivePanelTab],
  )

  const handleNodeDoubleClick = useCallback(
    (event, node) => {
      if (typeof onNodeClick === 'function') {
        onNodeClick(event, node)
      }
      openInspector('selection')
    },
    [onNodeClick, openInspector],
  )

  const handleEdgeDoubleClick = useCallback(
    (event, edge) => {
      if (typeof onEdgeClick === 'function') {
        onEdgeClick(event, edge)
      }
      openInspector('selection')
    },
    [onEdgeClick, openInspector],
  )

  const handleAutoUpgrade = useCallback(async () => {
    if (busy) return
    try {
      await saveAll()
    } catch (error) {
      console.error(error)
    }
  }, [busy, saveAll])

  const handleDismissVersionAlert = useCallback(() => {
    clearVersionAlert()
  }, [clearVersionAlert])

  useEffect(() => {
    if (!saveReceipt) {
      setReceiptVisible(null)
      return
    }

    setReceiptVisible(saveReceipt)

    const timeout = window.setTimeout(() => {
      ackSaveReceipt(saveReceipt.id)
    }, 6000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [saveReceipt, ackSaveReceipt])

  useEffect(() => {
    if (!receiptVisible) return

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        ackSaveReceipt(receiptVisible.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [receiptVisible, ackSaveReceipt])

  if (!isReady || loading) {
    return <div style={{ padding: 20 }}>불러오는 중…</div>
  }

  return (
    <div style={{ height: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 900,
          width: '100%',
          margin: '0 auto',
          padding: '12px 16px 110px',
          boxSizing: 'border-box',
          gap: 10,
        }}
      >
        <MakerEditorHeader
          setName={setInfo?.name}
          busy={busy}
          onBack={goToSetList}
          onAddPrompt={() => addPromptNode('ai')}
          onAddUserAction={() => addPromptNode('user_action')}
          onAddSystem={() => addPromptNode('system')}
          onSave={saveAll}
          onExport={exportSet}
          onImport={importSet}
          onGoLobby={goToLobby}
          collapsed={headerCollapsed}
          onToggleCollapse={() => setHeaderCollapsed((prev) => !prev)}
          onOpenVariables={() => setVariableDrawerOpen(true)}
          quickActions={collapsedQuickActions}
        />

        {versionAlert && (
          <div
            style={{
              borderRadius: 14,
              background: '#fff7ed',
              border: '1px solid #fdba74',
              color: '#9a3412',
              padding: '14px 16px',
              display: 'grid',
              gap: 10,
            }}
            role="status"
            aria-live="polite"
          >
            <div style={{ display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: 15 }}>변수 규칙 버전 자동 갱신 필요</strong>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{versionAlert.summary}</p>
              {Array.isArray(versionAlert.details) && versionAlert.details.length > 0 && (
                <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.5 }}>
                  {versionAlert.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAutoUpgrade}
                disabled={busy}
                style={{
                  padding: '6px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#c2410c',
                  color: '#fff',
                  fontWeight: 600,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? '저장 중…' : '지금 자동 갱신'}
              </button>
              <button
                type="button"
                onClick={handleDismissVersionAlert}
                style={{
                  padding: '6px 12px',
                  borderRadius: 10,
                  border: '1px solid #fdba74',
                  background: '#fffbeb',
                  color: '#9a3412',
                  fontWeight: 500,
                }}
              >
                나중에 다시 보기
              </button>
            </div>
          </div>
        )}

        <MakerEditorCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeDoubleClick={handleEdgeDoubleClick}
          onPaneClick={onPaneClick}
          onSelectionChange={onSelectionChange}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
        />
      </div>

      <button
        type="button"
        onClick={() => (inspectorOpen ? setInspectorOpen(false) : openInspector())}
        style={{
          position: 'fixed',
          left: 16,
          bottom: 28,
          padding: '10px 18px',
          borderRadius: 999,
          background: inspectorOpen ? '#1d4ed8' : '#111827',
          color: '#fff',
          fontWeight: 700,
          border: 'none',
          boxShadow: '0 18px 42px -18px rgba(17, 24, 39, 0.7)',
          zIndex: 56,
        }}
        aria-expanded={inspectorOpen}
        aria-controls="maker-editor-inspector"
      >
        {inspectorOpen ? '패널 닫기' : '패널 열기'}
      </button>

      {inspectorOpen && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 110,
            width: 'min(420px, calc(100vw - 32px))',
            maxHeight: 'min(70vh, 600px)',
            zIndex: 90,
            display: 'grid',
            gap: 8,
          }}
          id="maker-editor-inspector"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderRadius: 16,
              background: '#111827',
              color: '#f8fafc',
              boxShadow: '0 18px 45px -26px rgba(15, 23, 42, 0.75)',
            }}
          >
            <strong style={{ fontSize: 14 }}>프롬프트 편집</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => openInspector('guide')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 10,
                  background: '#1d4ed8',
                  color: '#fff',
                  fontWeight: 600,
                  border: 'none',
                }}
              >
                가이드
              </button>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 10,
                  background: 'rgba(15, 23, 42, 0.6)',
                  color: '#e2e8f0',
                  fontWeight: 600,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                }}
              >
                닫기
              </button>
            </div>
          </div>
          <div
            style={{
              background: '#ffffff',
              borderRadius: 18,
              padding: '8px 10px',
              boxShadow: '0 22px 50px -36px rgba(15, 23, 42, 0.6)',
              overflow: 'hidden',
            }}
          >
            <MakerEditorPanel
              tabs={panelTabs}
              activeTab={activePanelTab}
              onTabChange={setActivePanelTab}
              onOpenVariables={() => setVariableDrawerOpen(true)}
              selectedNode={selectedNode}
              selectedNodeId={selectedNodeId}
              selectedEdge={selectedEdge}
              onMarkAsStart={markAsStart}
              onDeleteSelected={() => selectedNodeId && handleDeletePrompt(selectedNodeId)}
              onInsertToken={appendTokenToSelected}
              setNodes={setNodes}
              setEdges={setEdges}
            />
          </div>
        </div>
      )}

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

      {receiptVisible && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            background: '#0f172a',
            color: '#f8fafc',
            borderRadius: 16,
            padding: '14px 18px',
            boxShadow: '0 22px 48px -20px rgba(15, 23, 42, 0.85)',
            width: 'min(420px, calc(100vw - 40px))',
            zIndex: 120,
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 14 }}>저장 완료</strong>
            <button
              type="button"
              onClick={() => ackSaveReceipt(receiptVisible.id)}
              style={{
                appearance: 'none',
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: '#e2e8f0',
                borderRadius: 12,
                fontSize: 12,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{receiptVisible.message}</p>
          {Array.isArray(receiptVisible.details) && receiptVisible.details.length > 0 && (
            <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.5 }}>
              {receiptVisible.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
