'use client'

import ReactFlow from 'reactflow'
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
  allowNodeDrag,
}) {
  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 420,
        position: 'relative',
        borderRadius: 28,
        overflow: 'hidden',
        backgroundColor: '#04070f',
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '84px 84px',
        boxShadow: '0 60px 120px -80px rgba(37, 99, 235, 0.6)',
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
        nodesDraggable={!!allowNodeDrag}
        selectionOnDrag
        style={{ width: '100%', height: '100%', touchAction: 'none', background: 'transparent' }}
        connectionLineStyle={{ stroke: 'rgba(96, 165, 250, 0.8)', strokeWidth: 2 }}
        defaultEdgeOptions={{
          type: 'default',
          style: { stroke: 'rgba(148, 163, 184, 0.5)', strokeWidth: 2 },
          markerEnd: {
            type: 'arrowclosed',
            color: 'rgba(148, 163, 184, 0.6)',
            width: 18,
            height: 18,
          },
        }}
        fitViewOptions={{ padding: 0.24, duration: 400 }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 0 1px rgba(148, 163, 184, 0.08)',
          }}
        />
      </ReactFlow>
    </div>
  )
}

//
