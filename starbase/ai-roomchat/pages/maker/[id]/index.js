import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import ReactFlow, { Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '../../../lib/supabase'
import PromptNode from './PromptNode'
import SidePanel from './SidePanel'

const nodeTypes = { prompt: PromptNode }

export default function MakerEditor() {
  const router = useRouter()
  const { id: setId } = router.query

  const [loading, setLoading] = useState(true)
  const [setInfo, setSetInfo] = useState(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)

  const idMapRef = useRef(new Map()) // flowNodeId → DB slot.id

  // … (여기서 Supabase 불러오기, saveAll, addPromptNode, handleDeletePrompt 같은 “데이터 로직”만 남김)

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  if (loading) return <div style={{ padding: 20 }}>불러오는 중…</div>

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <div style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={() => router.push('/maker')} style={{ padding: '6px 10px' }}>
          ← 목록
        </button>
        <span style={{ fontWeight: 800, marginLeft: 10 }}>{setInfo?.name}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px' }}>
        <div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id)
              setSelectedEdge(null)
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdge(edge)
              setSelectedNodeId(null)
            }}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>

        <SidePanel
          selectedNodeId={selectedNodeId}
          selectedEdge={selectedEdge}
          setEdges={setEdges}
          setNodes={setNodes}
        />
      </div>
    </div>
  )
}
