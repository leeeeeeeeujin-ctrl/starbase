'use client'

import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import 'reactflow/dist/style.css'

import PromptNode from '../PromptNode'

const nodeTypes = { prompt: PromptNode }

export default function MakerEditorCanvas({
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
}) {
  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 420,
        background: '#ffffff',
        borderRadius: 18,
        boxShadow: '0 20px 45px -36px rgba(15, 23, 42, 0.5)',
        overflow: 'hidden',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        fitView
        minZoom={0.1}
        maxZoom={2.4}
        zoomOnPinch
        zoomOnScroll
        panOnScroll
        panOnDrag
        fitViewOptions={{ padding: 0.24, duration: 400 }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  )
}

//
