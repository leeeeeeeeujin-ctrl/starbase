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
  onEdgeClick,
  onNodeDoubleClick,
  onEdgeDoubleClick,
  onPaneClick,
  onSelectionChange,
  onNodesDelete,
  onEdgesDelete,
}) {
  const hasNodes = Array.isArray(nodes) && nodes.length > 0;
  const flowRef = useRef(null);
  const previousNodeCountRef = useRef(Array.isArray(nodes) ? nodes.length : 0);

  useEffect(() => {
    const currentCount = Array.isArray(nodes) ? nodes.length : 0;
    const previousCount = previousNodeCountRef.current;
    previousNodeCountRef.current = currentCount;

    if (!flowRef.current) return;
    if (currentCount <= 0) return;
    if (currentCount === previousCount) return;

    const timeoutId = window.setTimeout(() => {
      try {
        flowRef.current.fitView({
          padding: 0.28,
          duration: 420,
          maxZoom: 1.15,
        });
      } catch {}
    }, 40);

    return () => window.clearTimeout(timeoutId);
  }, [nodes]);

  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 520,
        background: '#0b1120',
        borderRadius: 18,
        boxShadow: '0 20px 45px -36px rgba(15, 23, 42, 0.6)',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 5,
          display: 'grid',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 14,
            background: 'rgba(2, 6, 23, 0.82)',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            color: '#e2e8f0',
            boxShadow: '0 16px 38px -24px rgba(15, 23, 42, 0.9)',
          }}
        >
          <strong style={{ fontSize: 13 }}>배틀 그래프</strong>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            노드 {nodes?.length || 0} / 연결 {edges?.length || 0}
          </span>
        </div>
        <div
          style={{
            maxWidth: 320,
            padding: '10px 12px',
            borderRadius: 14,
            background: 'rgba(15, 23, 42, 0.78)',
            border: '1px solid rgba(59, 130, 246, 0.22)',
            color: '#cbd5e1',
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          `+` 버튼으로 턴을 추가하고, 노드를 드래그해 배치한 뒤 연결선으로 다음 턴 흐름을 만듭니다.
        </div>
      </div>

      {!hasNodes && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 4,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 'min(440px, calc(100% - 32px))',
              display: 'grid',
              gap: 10,
              padding: '22px 24px',
              borderRadius: 20,
              background: 'rgba(15, 23, 42, 0.86)',
              border: '1px solid rgba(148, 163, 184, 0.24)',
              color: '#e2e8f0',
              boxShadow: '0 30px 80px -40px rgba(15, 23, 42, 0.95)',
            }}
          >
            <strong style={{ fontSize: 22, lineHeight: 1.2 }}>여기에 턴 그래프를 만듭니다</strong>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: '#cbd5e1' }}>
              아래 `+` 버튼으로 AI 턴, 유저 입력 턴, 시스템 턴을 추가하면 이 영역에 바로 카드가 생깁니다.
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#94a3b8' }}>
              <div>1. 턴 추가</div>
              <div>2. 카드 선택 후 세부 설정 편집</div>
              <div>3. 카드끼리 연결해 분기와 순서를 구성</div>
            </div>
          </div>
        </div>
      )}

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
          style={{ background: '#0f172a', width: 120, height: 84, right: 8, bottom: 8 }}
          maskColor="rgba(15,23,42,0.85)"
        />
        <Controls style={{ background: 'rgba(15,23,42,0.75)', borderRadius: 12 }} />
        <Background color="#1f2937" gap={28} size={2} />
      </ReactFlow>
    </div>
  );
}
