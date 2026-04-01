'use client';

import { useEffect, useRef } from 'react';
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
  onNodeDoubleClick,
  onEdgeClick,
  onPaneClick,
  onSelectionChange,
  onNodesDelete,
  onEdgesDelete,
}) {
  const flowRef = useRef(null);
  const nodeCount = Array.isArray(nodes) ? nodes.length : 0;
  const prevNodeCountRef = useRef(nodeCount);

  useEffect(() => {
    if (!flowRef.current) return;
    if (nodeCount === 0) return;
    if (prevNodeCountRef.current === nodeCount) return;
    prevNodeCountRef.current = nodeCount;

    const id = window.setTimeout(() => {
      try {
        flowRef.current.fitView({ padding: 0.22, duration: 280, maxZoom: 1.1 });
      } catch {}
    }, 30);
    return () => window.clearTimeout(id);
  }, [nodeCount]);

  return (
    <section
      style={{
        background: '#0b1120',
        borderRadius: 24,
        border: '1px solid rgba(148, 163, 184, 0.24)',
        overflow: 'hidden',
        minHeight: '62svh',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: 6,
          padding: '14px 16px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
          background: 'rgba(2, 6, 23, 0.72)',
        }}
      >
        <strong style={{ color: '#f8fafc', fontSize: 15 }}>실행 노드 흐름</strong>
        <span style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>
          사각형 노드는 실행입니다. 선은 조건 분기입니다. 노드를 선택하면 아래에서 내용을 편집합니다.
        </span>
      </div>

      {nodeCount === 0 ? (
        <div
          style={{
            minHeight: 'calc(62svh - 66px)',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: 'radial-gradient(circle at top, rgba(59,130,246,0.08), transparent 42%)',
          }}
        >
          <div
            style={{
              width: 'min(420px, 100%)',
              borderRadius: 20,
              background: '#0f172a',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              padding: '22px 20px',
              display: 'grid',
              gap: 10,
              color: '#e2e8f0',
            }}
          >
            <strong style={{ fontSize: 20 }}>빈 메이커입니다</strong>
            <span style={{ fontSize: 13, lineHeight: 1.7, color: '#cbd5e1' }}>
              아래 `+` 버튼으로 AI 실행 노드나 유저 응답 노드를 추가하세요.
            </span>
            <div style={{ display: 'grid', gap: 4, fontSize: 12, color: '#94a3b8' }}>
              <div>1. 노드 추가</div>
              <div>2. 노드 클릭 후 프롬프트와 저장 키 편집</div>
              <div>3. 노드끼리 연결하고 선에 조건을 적어 분기 구성</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ height: 'calc(62svh - 66px)' }}>
          <ReactFlow
            onInit={instance => {
              flowRef.current = instance;
            }}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onSelectionChange={onSelectionChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            fitView
            minZoom={0.2}
            maxZoom={1.6}
            defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
            style={{ width: '100%', height: '100%' }}
          >
            <MiniMap
              pannable
              zoomable
              style={{ background: '#020617', borderRadius: 12 }}
              maskColor="rgba(2,6,23,0.88)"
            />
            <Controls
              style={{
                background: 'rgba(2,6,23,0.88)',
                borderRadius: 14,
                border: '1px solid rgba(148, 163, 184, 0.18)',
              }}
            />
            <Background color="#1e293b" gap={24} size={1.3} />
          </ReactFlow>
        </div>
      )}
    </section>
  );
}
