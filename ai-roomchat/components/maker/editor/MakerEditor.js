'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudioTemplate } from '../../../contexts/StudioStore';

import { useMakerEditor } from '../../../hooks/maker/useMakerEditor';
import { useWorkspace } from '../../workspace/CodeWorkspaceProvider.jsx';
import { saveSet } from '../../../lib/workspace/saveSet.js';
import { publishRankWorkspaceForPromptSet } from '../../../lib/rank/saveGameWorkspaceClient.js';
import MinimalMakerHeader from './MinimalMakerHeader';
import MakerEditorCanvas from './MakerEditorCanvas';
import MakerEditorPanel from './MakerEditorPanel';
import AddPromptFab from './AddPromptFab';
import { normalizeBattleConfig } from '../../../lib/battle/definition.js';

export default function MakerEditor() {
  const { status, graph, selection, persistence, history, definition: battleDefinition } = useMakerEditor();
  const { writeFile, files } = useWorkspace();

  let templateText = '';
  let setTemplateText = () => {};
  try {
    const ctx = useStudioTemplate();
    templateText = ctx.templateText;
    setTemplateText = ctx.setTemplateText;
  } catch {}

  const { isReady, loading } = status;
  const battleConfig = useMemo(() => {
    try {
      const parsed = JSON.parse(templateText || '{}');
      return normalizeBattleConfig(parsed?.battleConfig);
    } catch {
      return normalizeBattleConfig();
    }
  }, [templateText]);
  const resolvedBattleDefinition = useMemo(
    () => ({
      ...battleDefinition,
      ...battleConfig,
    }),
    [battleConfig, battleDefinition]
  );

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodesDelete,
    onEdgesDelete,
    setNodes,
    setEdges,
  } = graph;
  const syncingRef = useRef(false);
  const hydratedRef = useRef(false);

  const toTemplateObject = useCallback(() => {
    const template = (() => {
      try {
        return JSON.parse(templateText || '{}');
      } catch {
        return {};
      }
    })();

    return {
      ...template,
      nodes: (nodes || []).map(node => ({
        id: node.id,
        type: node.type || 'prompt',
        position: node.position || { x: 0, y: 0 },
        data: node.data || {},
      })),
      edges: (edges || []).map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || '',
        data: edge.data || {},
      })),
    };
  }, [templateText, nodes, edges]);

  const hydrateFromTemplate = useCallback(() => {
    let parsed;
    try {
      parsed = JSON.parse(templateText || '{}');
    } catch {
      parsed = {};
    }

    const templateNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const templateEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
    if (!templateNodes.length && !templateEdges.length) return;

    syncingRef.current = true;
    try {
      setNodes(
        templateNodes.map(node => ({
          id: node.id || `n_${Math.random().toString(36).slice(2, 8)}`,
          type: node.type || 'prompt',
          position: node.position || { x: 0, y: 0 },
          data: node.data || { template: '', slot_type: 'ai' },
        }))
      );
      setEdges(
        templateEdges.map(edge => ({
          id: edge.id || `e_${Math.random().toString(36).slice(2, 8)}`,
          source: edge.source,
          target: edge.target,
          label: edge.label || '',
          data: edge.data || {},
        }))
      );
      hydratedRef.current = true;
    } finally {
      syncingRef.current = false;
    }
  }, [templateText, setNodes, setEdges]);

  useEffect(() => {
    if (!hydratedRef.current && typeof setNodes === 'function' && typeof setEdges === 'function') {
      hydrateFromTemplate();
    }
  }, [hydrateFromTemplate, setNodes, setEdges]);

  useEffect(() => {
    if (syncingRef.current) return;
    const timeoutId = setTimeout(() => {
      try {
        setTemplateText(JSON.stringify(toTemplateObject(), null, 2));
      } catch {}
    }, 180);
    return () => clearTimeout(timeoutId);
  }, [nodes, edges, toTemplateObject, setTemplateText]);

  useEffect(() => {
    if (syncingRef.current || !writeFile) return;
    const timeoutId = setTimeout(() => {
      try {
        const graphData = {
          nodes: nodes.map(node => ({
            id: node.id,
            type: node.type || 'prompt',
            data: node.data || {},
          })),
          edges: edges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label || '',
            data: edge.data || {},
          })),
        };

        writeFile('/graph/prompt-graph.json', JSON.stringify(graphData, null, 2) + '\n');
        writeFile('/battle/definition.json', JSON.stringify(resolvedBattleDefinition, null, 2) + '\n');

        const startNode = nodes.find(node => node.data?.isStart);
        if (startNode && files) {
          try {
            const configPath = '/game/runtime.config.json';
            const existing = files[configPath]?.content;
            if (existing) {
              const config = JSON.parse(existing);
              config.entryNode = startNode.id;
              writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
            }
          } catch {}
        }
      } catch (error) {
        console.warn('[MakerEditor] sync to workspace failed', error);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, writeFile, files, resolvedBattleDefinition]);

  const {
    selectedNode,
    selectedNodeId,
    selectedEdge,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    onSelectionChange,
    setSelectedEdge,
    markAsStart,
  } = selection;

  const { busy, saveAll, deletePrompt, addPromptNode, goToSetList } = persistence;

  const unifiedSaveAll = useCallback(async () => {
    if (busy) return;
    const setKey = String(status?.setInfo?.id || status?.router?.query?.id || '').trim();

    await saveAll();

    try {
      if (setKey) {
        await saveSet(setKey, files || {});
      }
    } catch (error) {
      console.warn('[MakerEditor] workspace save failed', error);
    }

    try {
      if (setKey) {
        await publishRankWorkspaceForPromptSet(setKey, files || {});
      }
    } catch (error) {
      console.warn('[MakerEditor] rank workspace publish failed', error);
    }
  }, [busy, saveAll, files, status?.setInfo, status?.router]);

  const { receipt: saveReceipt, ackReceipt } = history;
  const [receiptVisible, setReceiptVisible] = useState(null);

  useEffect(() => {
    if (!saveReceipt) {
      setReceiptVisible(null);
      return;
    }
    setReceiptVisible(saveReceipt);
    const timeoutId = setTimeout(() => {
      ackReceipt(saveReceipt.id);
    }, 5000);
    return () => clearTimeout(timeoutId);
  }, [saveReceipt, ackReceipt]);

  if (!isReady || loading) {
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          background: '#e2e8f0',
          padding: 24,
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 18,
            background: '#ffffff',
            color: '#0f172a',
            fontWeight: 700,
          }}
        >
          메이커를 불러오는 중입니다...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        background: '#e2e8f0',
        padding: '12px 12px calc(env(safe-area-inset-bottom) + 96px)',
      }}
    >
      <div
        style={{
          width: 'min(1120px, 100%)',
          margin: '0 auto',
          display: 'grid',
          gap: 12,
        }}
      >
        <MinimalMakerHeader busy={busy} onBack={goToSetList} onSave={unifiedSaveAll} />

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

        <MakerEditorPanel
          selectedNode={selectedNode}
          selectedNodeId={selectedNodeId}
          selectedEdge={selectedEdge}
          onMarkAsStart={markAsStart}
          onDeleteSelected={() => selectedNodeId && deletePrompt(selectedNodeId)}
          setNodes={setNodes}
          setEdges={setEdges}
        />
      </div>

      <AddPromptFab
        onAdd={type => {
          addPromptNode(type, '');
          setSelectedEdge(null);
        }}
      />

      {receiptVisible && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
            transform: 'translateX(-50%)',
            background: '#0f172a',
            color: '#f8fafc',
            borderRadius: 16,
            padding: '12px 16px',
            boxShadow: '0 20px 46px -22px rgba(15, 23, 42, 0.85)',
            zIndex: 120,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {receiptVisible.message}
        </div>
      )}
    </div>
  );
}
