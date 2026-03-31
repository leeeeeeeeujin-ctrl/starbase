'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudioTemplate } from '../../../contexts/StudioStore';
import useIsMobile from '../../../utils/useIsMobile';

import { useMakerEditor } from '../../../hooks/maker/useMakerEditor';
import { useWorkspace } from '../../workspace/CodeWorkspaceProvider.jsx';
import { saveSet } from '../../../lib/workspace/saveSet.js';
import { publishRankWorkspaceForPromptSet } from '../../../lib/rank/saveGameWorkspaceClient.js';
import MakerTurnBoard from './MakerTurnBoard';
import MinimalMakerHeader from './MinimalMakerHeader';
import MakerEditorPanel from './MakerEditorPanel';
import AddPromptFab from './AddPromptFab';
import VariableDrawer from './VariableDrawer';
import { normalizeBattleConfig } from '../../../lib/battle/definition.js';
import { isWorkspaceDebug } from '../../../lib/workspace/debugFlags.js';

export default function MakerEditor() {
  const isMobile = useIsMobile(820);
  const editorInstanceRef = useRef(null);

  if (editorInstanceRef.current == null) {
    editorInstanceRef.current = Math.random().toString(36).slice(2, 8);
  }

  useEffect(() => {
    if (!isWorkspaceDebug()) return undefined;
    try {
      console.log('[MakerEditor] mount', { instance: editorInstanceRef.current });
    } catch {}
    return () => {
      try {
        console.log('[MakerEditor] unmount', { instance: editorInstanceRef.current });
      } catch {}
    };
  }, []);

  const { status, graph, selection, variables, persistence, history, definition: battleDefinition } = useMakerEditor();

  let templateText = '';
  let setTemplateText = () => {};
  try {
    const ctx = useStudioTemplate();
    templateText = ctx.templateText;
    setTemplateText = ctx.setTemplateText;
  } catch {}

  const { isReady, loading } = status;
  const { writeFile, files } = useWorkspace();
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
        label: node.data?.name || node.data?.title || '',
        data: node.data || {},
      })),
      edges: (edges || []).map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || '',
      })),
    };
  }, [templateText, nodes, edges]);

  const hydrateNamesFromTemplate = useCallback(() => {
    let parsed;
    try {
      parsed = JSON.parse(templateText || '{}');
    } catch {
      parsed = {};
    }

    const templateNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    if (!templateNodes.length) return;

    const nameById = new Map();
    templateNodes.forEach(node => {
      const data = node?.data || {};
      const name = data.name || data.title || node.label || '';
      if (node?.id && name) {
        nameById.set(node.id, String(name));
      }
    });

    if (!nameById.size) return;

    setNodes(existing =>
      (existing || []).map(node => {
        const currentName = node?.data?.name || node?.data?.title || '';
        const nextName = nameById.get(node.id);
        if (!nextName || currentName === nextName) return node;
        return {
          ...node,
          data: {
            ...(node.data || {}),
            name: nextName,
          },
        };
      })
    );
  }, [templateText, setNodes]);

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
    if (!templateText) return;
    hydrateNamesFromTemplate();
  }, [templateText, hydrateNamesFromTemplate]);

  useEffect(() => {
    if (syncingRef.current) return;
    const timeoutId = setTimeout(() => {
      try {
        setTemplateText(JSON.stringify(toTemplateObject(), null, 2));
      } catch {}
    }, 200);
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
            label: node.data?.template?.slice(0, 50) || node.data?.label || node.id,
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
        console.warn('[MakerEditor] sync to workspace /graph failed', error);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, writeFile, files, resolvedBattleDefinition]);

  const {
    selectedNode,
    selectedNodeId,
    selectedEdge,
    setSelectedNodeId,
    setSelectedEdge,
    panelTabs,
    activePanelTab,
    setActivePanelTab,
    markAsStart,
    appendTokenToSelected,
  } = selection;

  const {
    selectedGlobalRules,
    selectedLocalRules,
    commitGlobalRules,
    commitLocalRules,
    availableVariableNames,
    selectedVisibility,
    updateVisibility,
    toggleInvisible,
    slotSuggestions,
    characterSuggestions,
  } = variables;

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

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.__DISABLE_CHAT_OVERLAY__ = true;
      }
    } catch {}

    return () => {
      try {
        if (typeof window !== 'undefined') {
          delete window.__DISABLE_CHAT_OVERLAY__;
        }
      } catch {}
    };
  }, []);

  const [variableDrawerOpen, setVariableDrawerOpen] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(null);

  useEffect(() => {
    if (!saveReceipt) {
      setReceiptVisible(null);
      return;
    }

    setReceiptVisible(saveReceipt);
    const timeoutId = setTimeout(() => {
      ackReceipt(saveReceipt.id);
    }, 7000);

    return () => clearTimeout(timeoutId);
  }, [saveReceipt, ackReceipt]);

  useEffect(() => {
    if (!receiptVisible) return undefined;

    const handleEscape = event => {
      if (event.key === 'Escape') {
        ackReceipt(receiptVisible.id);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [receiptVisible, ackReceipt]);

  useEffect(() => {
    try {
      const hideTexts = ['펼치기', '게임 제작 도구 펼치기'];
      const buttons = typeof document !== 'undefined' ? document.querySelectorAll('button') : [];
      buttons.forEach(button => {
        const text = (button.textContent || '').trim();
        if (hideTexts.some(target => text.includes(target))) {
          button.style.display = 'none';
        }
      });
    } catch {}
  }, []);

  if (!isReady || loading) {
    return (
      <div
        style={{
          minHeight: '100svh',
          background: '#f1f5f9',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            padding: '18px 22px',
            borderRadius: 18,
            background: '#ffffff',
            color: '#0f172a',
            boxShadow: '0 24px 48px -24px rgba(15, 23, 42, 0.28)',
            fontWeight: 600,
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
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        overflowX: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxWidth: isMobile ? '100%' : 860,
          width: '100%',
          margin: isMobile ? 0 : '0 auto',
          padding: isMobile ? '10px 10px calc(env(safe-area-inset-bottom) + 88px)' : '12px 16px 110px',
          boxSizing: 'border-box',
          gap: 12,
        }}
      >
        <MinimalMakerHeader
          busy={busy}
          onBack={goToSetList}
          onOpenVariables={() => setVariableDrawerOpen(true)}
          onSave={unifiedSaveAll}
        />

        <div style={{ display: 'grid', gap: 12 }}>
          <MakerTurnBoard
            definition={resolvedBattleDefinition}
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={node => {
              setSelectedNodeId(node?.id || null);
              setSelectedEdge(null);
            }}
            onDeleteNode={deletePrompt}
            onMarkAsStart={markAsStart}
            setEdges={setEdges}
            panelProps={{
              tabs: panelTabs,
              activeTab: activePanelTab,
              onTabChange: setActivePanelTab,
              onOpenVariables: () => setVariableDrawerOpen(true),
              selectedNode,
              selectedNodeId,
              selectedEdge,
              onMarkAsStart: markAsStart,
              onDeleteSelected: () => selectedNodeId && deletePrompt(selectedNodeId),
              onInsertToken: appendTokenToSelected,
              setNodes,
              setEdges,
            }}
          />
        </div>
      </div>

      <AddPromptFab onAdd={(type, template) => addPromptNode(type, template)} />

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
            padding: '14px 18px',
            boxShadow: '0 22px 48px -20px rgba(15, 23, 42, 0.85)',
            width: 'min(420px, calc(100vw - 40px))',
            zIndex: 120,
            display: 'grid',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 14 }}>저장 완료</strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => ackReceipt(receiptVisible.id)}
                style={{
                  appearance: 'none',
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: 'rgba(15, 23, 42, 0.6)',
                  color: '#e2e8f0',
                  borderRadius: 12,
                  fontSize: 12,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{receiptVisible.message}</p>
          {Array.isArray(receiptVisible.details) && receiptVisible.details.length > 0 && (
            <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.5 }}>
              {receiptVisible.details.map(detail => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {busy && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.55)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 14,
              background: '#020617',
              border: '1px solid rgba(148,163,184,0.6)',
              color: '#e5e7eb',
              fontSize: 13,
              boxShadow: '0 18px 40px rgba(15,23,42,0.9)',
            }}
          >
            저장 중입니다... 잠시만 기다려 주세요.
          </div>
        </div>
      )}
    </div>
  );
}
