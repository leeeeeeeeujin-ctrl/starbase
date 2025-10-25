'use client';

import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';

import PromptNode from '../PromptNode';

const nodeTypes = { prompt: PromptNode };

export default function MakerEditorCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onNodeDoubleClick,
  onEdgeDoubleClick,
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
        background: '#0b1120',
        borderRadius: 18,
        boxShadow: '0 20px 45px -36px rgba(15, 23, 42, 0.6)',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.25)',
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
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
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
        <MiniMap
          pannable
          zoomable
          style={{ background: '#0f172a' }}
          maskColor="rgba(15,23,42,0.85)"
        />
        <Controls style={{ background: 'rgba(15,23,42,0.75)', borderRadius: 12 }} />
        <Background color="#1f2937" gap={28} size={2} />
      </ReactFlow>
    </div>
  );
}
