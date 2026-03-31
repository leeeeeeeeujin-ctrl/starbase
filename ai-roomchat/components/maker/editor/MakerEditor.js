'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStudioTemplate } from '../../../contexts/StudioStore';
import useIsMobile from '../../../utils/useIsMobile';

import { useMakerEditor } from '../../../hooks/maker/useMakerEditor';
import { useWorkspace } from '../../workspace/CodeWorkspaceProvider.jsx';
import { saveSet } from '../../../lib/workspace/saveSet.js';
import { publishRankWorkspaceForPromptSet } from '../../../lib/rank/saveGameWorkspaceClient.js';
import MakerEditorCanvas from './MakerEditorCanvas';
import MinimalMakerHeader from './MinimalMakerHeader';
import MakerEditorPanel from './MakerEditorPanel';
import AddPromptFab from './AddPromptFab';
import VariableDrawer from './VariableDrawer';
import AdvancedToolsPanel from './AdvancedToolsPanel';
import AutoUpdateListener from '../../infra/AutoUpdateListener.jsx';
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

  const { status, graph, selection, variables, persistence, history, version } = useMakerEditor();

  let templateText = '';
  let setTemplateText = () => {};
  try {
    const ctx = useStudioTemplate();
    templateText = ctx.templateText;
    setTemplateText = ctx.setTemplateText;
  } catch {}

  const { isReady, loading } = status;
  const { writeFile, files } = useWorkspace();

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
  }, [nodes, edges, writeFile, files]);

  const {
    selectedNode,
    selectedNodeId,
    selectedEdge,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    onSelectionChange,
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

  const {
    entries: saveHistory,
    storageKey: historyStorageKey,
    exportEntries: exportHistory,
    clearEntries: clearHistory,
    receipt: saveReceipt,
    ackReceipt,
  } = history;

  const { alert: versionAlert, clearAlert: clearVersionAlert } = version;

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.__makerActions = {
          addPromptNode,
          saveAll: unifiedSaveAll,
          unifiedSaveAll,
        };
      }
    } catch {}

    return () => {
      try {
        if (typeof window !== 'undefined' && window.__makerActions) {
          delete window.__makerActions;
        }
      } catch {}
    };
  }, [addPromptNode, unifiedSaveAll]);

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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(null);

  const openInspector = useCallback(
    tabId => {
      if (tabId) {
        const hasTab = panelTabs?.some(tab => tab.id === tabId);
        if (hasTab) {
          setActivePanelTab(tabId);
          if (tabId === 'history') {
            setAdvancedToolsOpen(true);
          }
        } else if (panelTabs?.length) {
          setActivePanelTab(panelTabs[0].id);
        }
      } else if (panelTabs?.length) {
        setActivePanelTab(panelTabs[0].id);
      }

      setInspectorOpen(true);
    },
    [panelTabs, setActivePanelTab]
  );

  const handleNodeDoubleClick = useCallback(
    (event, node) => {
      if (typeof onNodeClick === 'function') {
        onNodeClick(event, node);
      }
      openInspector('selection');
    },
    [onNodeClick, openInspector]
  );

  const handleEdgeDoubleClick = useCallback(
    (event, edge) => {
      if (typeof onEdgeClick === 'function') {
        onEdgeClick(event, edge);
      }
      openInspector('selection');
    },
    [onEdgeClick, openInspector]
  );

  const handleDismissVersionAlert = useCallback(() => {
    clearVersionAlert();
  }, [clearVersionAlert]);

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
        height: '100svh',
        background: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      <AutoUpdateListener intervalMs={60000} auto={false} />
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: isMobile ? '100%' : 900,
          width: '100%',
          margin: isMobile ? 0 : '0 auto',
          padding: isMobile ? '10px 12px calc(env(safe-area-inset-bottom) + 80px)' : '12px 16px 110px',
          boxSizing: 'border-box',
          gap: 10,
        }}
      >
        <MinimalMakerHeader
          busy={busy}
          onBack={goToSetList}
          onOpenVariables={() => setVariableDrawerOpen(true)}
          onSave={unifiedSaveAll}
        />

        {versionAlert && (
          <div
            style={{
              borderRadius: 14,
              background: '#fff7ed',
              border: '1px solid #fdba74',
              padding: '14px 16px',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <strong style={{ color: '#9a3412', fontSize: 14 }}>저장된 버전 알림</strong>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{versionAlert.summary}</p>
              {Array.isArray(versionAlert.details) && versionAlert.details.length > 0 && (
                <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.5 }}>
                  {versionAlert.details.map(detail => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={unifiedSaveAll}
                style={{
                  padding: '6px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#c2410c',
                  color: '#fff',
                  fontWeight: 600,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? '저장 중…' : '지금 자동 갱신'}
              </button>
              <button
                type="button"
                onClick={handleDismissVersionAlert}
                style={{
                  padding: '6px 12px',
                  borderRadius: 10,
                  border: '1px solid #fdba74',
                  background: '#fffbeb',
                  color: '#9a3412',
                  fontWeight: 500,
                }}
              >
                나중에 다시 보기
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: '1 1 auto', minHeight: 0, borderRadius: 20, overflow: 'hidden' }}>
          <MakerEditorCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onPaneClick={onPaneClick}
            onSelectionChange={onSelectionChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (inspectorOpen) {
            setInspectorOpen(false);
            setAdvancedToolsOpen(false);
            return;
          }
          openInspector();
        }}
        style={{
          position: 'fixed',
          left: 16,
          bottom: 'calc(env(safe-area-inset-bottom) + 28px)',
          padding: '10px 18px',
          borderRadius: 999,
          background: inspectorOpen ? '#1d4ed8' : '#111827',
          color: '#fff',
          fontWeight: 700,
          border: 'none',
          boxShadow: '0 18px 42px -18px rgba(17, 24, 39, 0.7)',
          zIndex: 56,
        }}
        aria-expanded={inspectorOpen}
        aria-controls="maker-editor-inspector"
      >
        {inspectorOpen ? '패널 닫기' : '패널 열기'}
      </button>

      {inspectorOpen && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            top: 'calc(env(safe-area-inset-top) + 72px)',
            bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
            width: 'min(420px, calc(100vw - 32px))',
            zIndex: 55,
            display: 'grid',
            gap: 8,
          }}
          id="maker-editor-inspector"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderRadius: 16,
              background: '#111827',
              color: '#f8fafc',
              boxShadow: '0 18px 45px -26px rgba(15, 23, 42, 0.75)',
            }}
          >
            <strong style={{ fontSize: 14 }}>배틀 편집</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => openInspector('guide')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 10,
                  background: '#1d4ed8',
                  color: '#fff',
                  fontWeight: 600,
                  border: 'none',
                }}
              >
                가이드
              </button>
              <button
                type="button"
                onClick={() => {
                  setInspectorOpen(false);
                  setAdvancedToolsOpen(false);
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 10,
                  background: 'rgba(15, 23, 42, 0.6)',
                  color: '#e2e8f0',
                  fontWeight: 600,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                }}
              >
                닫기
              </button>
            </div>
          </div>
          <div
            style={{
              background: '#ffffff',
              borderRadius: 18,
              padding: '8px 10px',
              boxShadow: '0 22px 50px -36px rgba(15, 23, 42, 0.6)',
              overflow: 'hidden',
            }}
          >
            <MakerEditorPanel
              tabs={panelTabs}
              activeTab={activePanelTab}
              onTabChange={setActivePanelTab}
              onOpenVariables={() => setVariableDrawerOpen(true)}
              selectedNode={selectedNode}
              selectedNodeId={selectedNodeId}
              selectedEdge={selectedEdge}
              onMarkAsStart={markAsStart}
              onDeleteSelected={() => selectedNodeId && deletePrompt(selectedNodeId)}
              onInsertToken={appendTokenToSelected}
              setNodes={setNodes}
              setEdges={setEdges}
              onRequestAdvancedTools={() => setAdvancedToolsOpen(prev => !prev)}
            />
            <AdvancedToolsPanel
              expanded={advancedToolsOpen}
              onToggle={() => setAdvancedToolsOpen(prev => !prev)}
              storageKey={historyStorageKey}
              historyEntries={saveHistory}
              onExport={exportHistory}
              onClear={clearHistory}
            />
          </div>
        </div>
      )}

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
                onClick={() => openInspector('history')}
                style={{
                  appearance: 'none',
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: 'rgba(15, 23, 42, 0.2)',
                  color: '#bfdbfe',
                  borderRadius: 12,
                  fontSize: 12,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                히스토리 보기
              </button>
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
