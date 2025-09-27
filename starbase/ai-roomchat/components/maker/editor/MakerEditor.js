'use client'

import { useEffect, useMemo, useState } from 'react'

import { useMakerEditor } from '../../../hooks/maker/useMakerEditor'
import { exportSet, importSet } from './importExport'
import MakerEditorCanvas from './MakerEditorCanvas'
import MakerEditorHeader from './MakerEditorHeader'
import MakerEditorPanel from './MakerEditorPanel'
import VariableDrawer from './VariableDrawer'

const NODE_TYPES = [
  { id: 'ai', label: 'AI 프롬프트' },
  { id: 'user_action', label: '유저 행동' },
  { id: 'system', label: '시스템' },
]

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
    setSelectedNodeId,
    setSelectedEdge,
    markAsStart,
    toggleInvisible,
    handleDeletePrompt,
    addPromptNode,
    saveAll,
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
  } = useMakerEditor()

  const [variableDrawerOpen, setVariableDrawerOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [spawnMenuOpen, setSpawnMenuOpen] = useState(false)
  const [moveMode, setMoveMode] = useState(false)

  useEffect(() => {
    if ((selectedNode || selectedEdge) && !panelOpen) {
      setPanelOpen(true)
    }
    if (!selectedNode && !selectedEdge && panelOpen) {
      setPanelOpen(false)
    }
  }, [selectedNode, selectedEdge, panelOpen])

  const handleClosePanel = () => {
    setPanelOpen(false)
    setSelectedNodeId(null)
    setSelectedEdge(null)
  }

  const handleAddNode = (type) => {
    addPromptNode(type)
    setSpawnMenuOpen(false)
  }

  const handleDeleteSelected = () => {
    if (selectedNodeId) {
      handleDeletePrompt(selectedNodeId)
    }
  }

  const canvasBackground = useMemo(
    () => ({
      padding: '0 36px 48px',
      flex: '1 1 auto',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }),
    [],
  )

  if (!isReady || loading) {
    return <div style={{ padding: 20, color: '#f8fafc' }}>불러오는 중…</div>
  }

  return (
    <div
      style={{
        height: '100vh',
        background: 'radial-gradient(circle at top, rgba(30, 64, 175, 0.25), transparent 55%) #020617',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <MakerEditorHeader
        setName={setInfo?.name}
        busy={busy}
        onBack={goToSetList}
        onSave={saveAll}
        onExport={exportSet}
        onImport={importSet}
        onGoLobby={goToLobby}
      />

      <div style={canvasBackground}>
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
          allowNodeDrag={moveMode}
        />

        <div
          style={{
            position: 'absolute',
            top: 32,
            left: 48,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setSpawnMenuOpen((open) => !open)}
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: spawnMenuOpen
                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.85))'
                : 'rgba(15, 23, 42, 0.75)',
              color: '#f8fafc',
              fontWeight: 700,
              boxShadow: '0 22px 48px -28px rgba(37, 99, 235, 0.7)',
            }}
          >
            +
          </button>
          {spawnMenuOpen && (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.92)',
                borderRadius: 16,
                border: '1px solid rgba(148, 163, 184, 0.25)',
                backdropFilter: 'blur(10px)',
                padding: 12,
                display: 'grid',
                gap: 8,
                minWidth: 180,
              }}
            >
              {NODE_TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAddNode(item.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'rgba(30, 41, 59, 0.65)',
                    color: '#f8fafc',
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    textAlign: 'left',
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setVariableDrawerOpen(true)}
          style={{
            position: 'absolute',
            right: 42,
            bottom: 120,
            padding: '12px 18px',
            borderRadius: 999,
            background: 'rgba(167, 139, 250, 0.3)',
            color: '#f5f3ff',
            border: '1px solid rgba(167, 139, 250, 0.5)',
            fontWeight: 600,
            boxShadow: '0 20px 48px -26px rgba(167, 139, 250, 0.6)',
          }}
        >
          변수 패널
        </button>

        <button
          type="button"
          onClick={() => setMoveMode((value) => !value)}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 32,
            transform: 'translateX(-50%)',
            padding: '12px 18px',
            borderRadius: 999,
            background: moveMode ? 'rgba(37, 99, 235, 0.45)' : 'rgba(148, 163, 184, 0.18)',
            color: '#f8fafc',
            border: '1px solid rgba(148, 163, 184, 0.28)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span role="img" aria-hidden="true">
            {moveMode ? '🖱️' : '✏️'}
          </span>
          {moveMode ? '이동 모드' : '편집 모드'}
        </button>
      </div>

      <MakerEditorPanel
        open={panelOpen}
        onClose={handleClosePanel}
        selectedNode={selectedNode}
        selectedNodeId={selectedNodeId}
        selectedEdge={selectedEdge}
        onMarkAsStart={markAsStart}
        onToggleInvisible={toggleInvisible}
        onDeleteSelected={handleDeleteSelected}
        onOpenVariables={() => setVariableDrawerOpen(true)}
        onInsertToken={appendTokenToSelected}
        setNodes={setNodes}
        setEdges={setEdges}
      />

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
