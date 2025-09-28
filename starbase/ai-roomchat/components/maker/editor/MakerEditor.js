'use client'

import { useState } from 'react'

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
    rebuildEdgeLabel,
    goToSetList,
    goToLobby,
    setNodes,
    setEdges,
  } = useMakerEditor()
  const [variableDrawerOpen, setVariableDrawerOpen] = useState(false)

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
        />

        <MakerEditorPanel
          tabs={panelTabs}
          activeTab={activePanelTab}
          onTabChange={setActivePanelTab}
          onOpenVariables={() => setVariableDrawerOpen(true)}
          selectedNode={selectedNode}
          selectedNodeId={selectedNodeId}
          selectedEdge={selectedEdge}
          onMarkAsStart={markAsStart}
          onToggleInvisible={toggleInvisible}
          onDeleteSelected={() => selectedNodeId && handleDeletePrompt(selectedNodeId)}
          onInsertToken={appendTokenToSelected}
          rebuildEdgeLabel={rebuildEdgeLabel}
          setNodes={setNodes}
          setEdges={setEdges}
        />

        <MakerEditorCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onSelectionChange={onSelectionChange}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
        />
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
