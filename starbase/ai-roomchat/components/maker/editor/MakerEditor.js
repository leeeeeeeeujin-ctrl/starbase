'use client'

import { useEffect, useMemo, useState } from 'react'

import { useMakerEditor } from '../../../hooks/maker/useMakerEditor'
import { exportSet, importSet } from './importExport'
import MakerEditorCanvas from './MakerEditorCanvas'
import MakerEditorHeader from './MakerEditorHeader'
import MakerEditorPanel from './MakerEditorPanel'
import VariableDrawer from './VariableDrawer'
import TutorialHint from './TutorialHint'

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
        minHeight: '100vh',
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
            left: 32,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => setSpawnMenuOpen((open) => !open)}
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              border: '1px solid rgba(148, 163, 184, 0.45)',
              background: spawnMenuOpen
                ? 'linear-gradient(135deg, rgba(191, 219, 254, 0.95), rgba(96, 165, 250, 0.9))'
                : 'linear-gradient(135deg, rgba(248, 250, 252, 0.95), rgba(226, 232, 240, 0.9))',
              color: spawnMenuOpen ? '#0f172a' : '#1e293b',
              fontWeight: 700,
              boxShadow: '0 20px 48px -24px rgba(37, 99, 235, 0.35)',
              transition: 'transform 0.2s ease',
            }}
          >
            +
          </button>
          {spawnMenuOpen && (
            <div
              style={{
                background: 'rgba(248, 250, 252, 0.96)',
                borderRadius: 16,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                boxShadow: '0 28px 64px -32px rgba(15, 23, 42, 0.55)',
                padding: 12,
                display: 'grid',
                gap: 8,
                minWidth: 188,
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
                    background: 'linear-gradient(135deg, rgba(226, 232, 240, 0.85), rgba(203, 213, 225, 0.8))',
                    color: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.45)',
                    textAlign: 'left',
                    fontWeight: 600,
                    boxShadow: '0 10px 24px -18px rgba(15, 23, 42, 0.5)',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          <TutorialHint
            description="노드를 추가해 프롬프트 흐름을 설계하고, 서로 연결해 다음 단계로 이어주세요."
          />
        </div>

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
            background: moveMode
              ? 'linear-gradient(135deg, rgba(191, 219, 254, 0.9), rgba(59, 130, 246, 0.85))'
              : 'linear-gradient(135deg, rgba(248, 250, 252, 0.9), rgba(226, 232, 240, 0.88))',
            color: moveMode ? '#0f172a' : '#1e293b',
            border: '1px solid rgba(148, 163, 184, 0.45)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 18px 48px -26px rgba(37, 99, 235, 0.45)',
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
