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
import { writeStoredBattleConfig } from '../../../lib/battle/battleConfigStorage.js';
import { supabase } from '../../../lib/supabase';
import { parseTurnTemplate, serializeTurnTemplate } from '../../../lib/battle/turnTemplate';

function hasBattleConfigValue(config) {
  const normalized = normalizeBattleConfig(config);
  return (
    normalized.mode !== 'single' ||
    normalized.minPlayers !== 1 ||
    normalized.maxPlayers !== 2 ||
    (normalized.roles || []).length > 0
  );
}

function buildRoleSlotPreview(roles = []) {
  const normalized = Array.isArray(roles) ? roles : [];
  const lines = [];
  normalized.forEach((role, roleIndex) => {
    const limit = Number.isFinite(Number(role?.limit)) ? Math.max(1, Number(role.limit)) : 1;
    const roleName = String(role?.name || `역할 ${roleIndex + 1}`).trim();
    const team = String(role?.team || '').trim();
    for (let index = 0; index < limit; index += 1) {
      lines.push({
        roleName,
        team,
        slotLabel: `${roleIndex + 1}역할-${index + 1}슬롯`,
      });
    }
  });
  return lines;
}

function formatVariableSourceLabel(sourceType) {
  if (sourceType === 'input') return '입력값이';
  if (sourceType === 'gameResult') return '게임 결과가';
  if (sourceType === 'teamOutcome') return '특정 팀 결과가';
  if (sourceType === 'participantOutcome') return '특정 참가자 결과가';
  return '항상';
}

export default function MakerEditor() {
  const { status, graph, selection, persistence, history, definition: battleDefinition } = useMakerEditor();
  const { writeFile, files } = useWorkspace();
  const [showGameConfig, setShowGameConfig] = useState(false);
  const [roleDraft, setRoleDraft] = useState({ name: '', team: '', limit: '1' });
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [variableModeOpen, setVariableModeOpen] = useState(false);
  const [variableViewport, setVariableViewport] = useState({ x: 0, y: 0, zoom: 0.82 });
  const [variableDraft, setVariableDraft] = useState({
    sourceType: 'always',
    sourceKey: '',
    equals: '',
    key: '',
    value: '',
  });
  const [variableSelection, setVariableSelection] = useState({ active: false, rect: null, start: null });
  const [variableNodeIds, setVariableNodeIds] = useState([]);
  const [selectedVariableName, setSelectedVariableName] = useState('');
  const lastTapRef = useRef({ kind: '', id: '', at: 0 });

  let templateText = '';
  let setTemplateText = () => {};
  try {
    const ctx = useStudioTemplate();
    templateText = ctx.templateText;
    setTemplateText = ctx.setTemplateText;
  } catch {}

  const { isReady, loading } = status;
  const dbBattleConfig = useMemo(
    () => normalizeBattleConfig(status?.setInfo?.battle_config),
    [status?.setInfo?.battle_config]
  );
  const battleConfig = useMemo(() => {
    try {
      const parsed = JSON.parse(templateText || '{}');
      const templateConfig = normalizeBattleConfig(parsed?.battleConfig);
      if (!hasBattleConfigValue(templateConfig) && hasBattleConfigValue(dbBattleConfig)) {
        return dbBattleConfig;
      }
      return templateConfig;
    } catch {
      return hasBattleConfigValue(dbBattleConfig) ? dbBattleConfig : normalizeBattleConfig();
    }
  }, [dbBattleConfig, templateText]);
  const resolvedBattleDefinition = useMemo(
    () => ({
      ...battleDefinition,
      ...battleConfig,
    }),
    [battleConfig, battleDefinition]
  );
  const playerCountOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => index + 1),
    []
  );
  const roleSlotPreview = useMemo(() => buildRoleSlotPreview(battleConfig.roles), [battleConfig.roles]);
  const canvasHostRef = useRef(null);

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

  const variableCatalog = useMemo(() => {
    const names = new Set();
    (nodes || []).forEach(node => {
      const parsed = parseTurnTemplate(node?.data?.template || '', node?.data?.slot_type || 'ai');
      const rules = Array.isArray(parsed?.meta?.stateWrites) ? parsed.meta.stateWrites : [];
      rules.forEach(rule => {
        const key = String(rule?.key || '').trim();
        if (key) names.add(key);
      });
    });
    (edges || []).forEach(edge => {
      const conditions = Array.isArray(edge?.data?.conditions) ? edge.data.conditions : [];
      conditions.forEach(condition => {
        const key = String(condition?.key || '').trim();
        if (key) names.add(key);
      });
    });
    return Array.from(names);
  }, [edges, nodes]);

  const colorForVariable = useCallback(name => {
    const palette = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#fb7185'];
    const value = String(name || '');
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return palette[hash % palette.length];
  }, []);

  const displayNodes = useMemo(() => {
    return (nodes || []).map(node => {
      const isVariableSelected = selectedVariableName
        ? (() => {
            const parsed = parseTurnTemplate(node?.data?.template || '', node?.data?.slot_type || 'ai');
            const rules = Array.isArray(parsed?.meta?.stateWrites) ? parsed.meta.stateWrites : [];
            return rules.some(rule => String(rule?.key || '').trim() === selectedVariableName);
          })()
        : false;
      const isAreaSelected = variableModeOpen && variableNodeIds.includes(node.id);
      const highlightColor = selectedVariableName ? colorForVariable(selectedVariableName) : null;
      const parsed = parseTurnTemplate(node?.data?.template || '', node?.data?.slot_type || 'ai');
      return {
        ...node,
        data: {
          ...node.data,
          variableHighlightColor: isVariableSelected ? highlightColor : null,
          variableSelectionColor: isAreaSelected ? '#38bdf8' : null,
        },
      };
    });
  }, [colorForVariable, nodes, selectedVariableName, variableModeOpen, variableNodeIds]);

  const displayEdges = useMemo(() => {
    if (!selectedVariableName) return edges;
    const highlightColor = colorForVariable(selectedVariableName);
    return (edges || []).map(edge => {
      const conditions = Array.isArray(edge?.data?.conditions) ? edge.data.conditions : [];
      const matches = conditions.some(condition => String(condition?.key || '').trim() === selectedVariableName);
      return matches
        ? {
            ...edge,
            style: {
              ...(edge.style || {}),
              stroke: highlightColor,
              strokeWidth: 2.5,
            },
          }
        : { ...edge, style: edge.style || {} };
    });
  }, [colorForVariable, edges, selectedVariableName]);
  const syncingRef = useRef(false);
  const hydratedRef = useRef(false);
  const lastWorkspaceTemplateRef = useRef(null);

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
    const workspaceTemplate = files?.['/template.json']?.content;
    if (typeof workspaceTemplate !== 'string') return;
    if (lastWorkspaceTemplateRef.current === workspaceTemplate) return;
    lastWorkspaceTemplateRef.current = workspaceTemplate;
    setTemplateText(workspaceTemplate);
  }, [files, setTemplateText]);

  useEffect(() => {
    if (!status?.setInfo?.id) return;
    if (!hasBattleConfigValue(dbBattleConfig)) return;

    try {
      const parsed = JSON.parse(templateText || '{}');
      const templateConfig = normalizeBattleConfig(parsed?.battleConfig);
      if (hasBattleConfigValue(templateConfig)) return;

      const next = {
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
        battleConfig: dbBattleConfig,
      };
      setTemplateText(JSON.stringify(next, null, 2));
    } catch {
      setTemplateText(JSON.stringify({ battleConfig: dbBattleConfig }, null, 2));
    }
  }, [dbBattleConfig, setTemplateText, status?.setInfo?.id, templateText]);

  useEffect(() => {
    const setId = String(status?.setInfo?.id || status?.router?.query?.id || '').trim();
    if (!setId) return;
    writeStoredBattleConfig(setId, battleConfig);
  }, [battleConfig, status?.router?.query?.id, status?.setInfo?.id]);

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
        const templateObject = toTemplateObject();
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

        writeFile('/template.json', JSON.stringify(templateObject, null, 2) + '\n');
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
    setActivePanelTab,
  } = selection;
  const resolvedSelectedEdge = useMemo(() => {
    if (!selectedEdge?.id) return selectedEdge;
    return (edges || []).find(edge => edge.id === selectedEdge.id) || selectedEdge;
  }, [edges, selectedEdge]);

  const { busy, saveAll, deletePrompt, addPromptNode, goToSetList } = persistence;

  const unifiedSaveAll = useCallback(async () => {
    if (busy) return;
    const setKey = String(status?.setInfo?.id || status?.router?.query?.id || '').trim();
    const hasStartNode = Array.isArray(nodes) && nodes.some(node => node?.data?.isStart);

    if (!hasStartNode) {
      window.alert('시작 노드를 하나 지정한 뒤 저장해주세요.');
      return;
    }

    await saveAll();

    try {
      if (setKey) {
        await supabase
          .from('prompt_sets')
          .update({
            battle_config: battleConfig,
            updated_at: new Date().toISOString(),
          })
          .eq('id', setKey);
      }
    } catch (error) {
      console.warn('[MakerEditor] battle_config save failed', error);
    }

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
  }, [battleConfig, busy, saveAll, files, nodes, status?.setInfo, status?.router]);

  const updateBattleConfig = useCallback(
    partial => {
      try {
        const parsed = JSON.parse(templateText || '{}');
        const next = {
          ...(parsed || {}),
          battleConfig: normalizeBattleConfig({
            ...(parsed?.battleConfig || {}),
            ...partial,
          }),
        };
        setTemplateText(JSON.stringify(next, null, 2));
      } catch {
        setTemplateText(
          JSON.stringify(
            {
              battleConfig: normalizeBattleConfig(partial),
            },
            null,
            2
          )
        );
      }
    },
    [templateText, setTemplateText]
  );

  const addRoleEntry = useCallback(() => {
    const name = String(roleDraft.name || '').trim();
    if (!name) return;
    const team = String(roleDraft.team || '').trim();
    const limit = Number.isFinite(Number(roleDraft.limit)) ? Math.max(1, Number(roleDraft.limit)) : 1;
    const nextRoles = [...(battleConfig.roles || []), { id: `role-${Date.now()}`, name, team, limit }];
    updateBattleConfig({ roles: nextRoles });
    setRoleDraft({ name: '', team: '', limit: '1' });
  }, [battleConfig.roles, roleDraft, updateBattleConfig]);

  const removeRoleEntry = useCallback(
    roleId => {
      updateBattleConfig({ roles: (battleConfig.roles || []).filter(role => role.id !== roleId) });
    },
    [battleConfig.roles, updateBattleConfig]
  );

  const openQuickEdit = useCallback(() => {
    setActivePanelTab('selection');
    setQuickEditOpen(true);
  }, [setActivePanelTab]);

  const closeVariableMode = useCallback(() => {
    setVariableModeOpen(false);
    setVariableSelection({ active: false, rect: null, start: null });
    setVariableNodeIds([]);
  }, []);

  const registerQuickTap = useCallback(
    (kind, id, selectFn, event, payload) => {
      selectFn?.(event, payload);
      const now = Date.now();
      if (lastTapRef.current.kind === kind && lastTapRef.current.id === id && now - lastTapRef.current.at < 360) {
        openQuickEdit();
      }
      lastTapRef.current = { kind, id, at: now };
    },
    [openQuickEdit]
  );

  const handleNodeClick = useCallback(
    (event, node) => {
      registerQuickTap('node', node?.id, onNodeClick, event, node);
    },
    [onNodeClick, registerQuickTap]
  );

  const handleNodeDoubleClick = useCallback(
    (event, node) => {
      onNodeClick?.(event, node);
      openQuickEdit();
    },
    [onNodeClick, openQuickEdit]
  );

  const handleEdgeClick = useCallback(
    (event, edge) => {
      registerQuickTap('edge', edge?.id, onEdgeClick, event, edge);
    },
    [onEdgeClick, registerQuickTap]
  );

  const handlePaneClick = useCallback(
    event => {
      onPaneClick?.(event);
      setQuickEditOpen(false);
    },
    [onPaneClick]
  );

  const applyVariableDraftToSelection = useCallback(() => {
    const key = String(variableDraft.key || '').trim();
    if (!key || !variableNodeIds.length) return;
    setNodes(current =>
      current.map(node => {
        if (!variableNodeIds.includes(node.id)) return node;
        const parsed = parseTurnTemplate(node?.data?.template || '', node?.data?.slot_type || 'ai');
        const meta = parsed.meta || {};
        const currentRules = Array.isArray(meta.stateWrites) ? meta.stateWrites : [];
        return {
          ...node,
          data: {
            ...node.data,
            template: serializeTurnTemplate(
              {
                ...meta,
                stateWrites: [
                  ...currentRules,
                  {
                    id: `state-write-${Date.now()}-${node.id}`,
                    sourceType: variableDraft.sourceType || 'always',
                    sourceKey: variableDraft.sourceKey || '',
                    equals: variableDraft.equals || '',
                    key,
                    value: variableDraft.value || '',
                  },
                ],
              },
              parsed.body || '',
              node?.data?.slot_type || 'ai'
            ),
          },
        };
      })
    );
    setSelectedVariableName(key);
  }, [setNodes, variableDraft, variableNodeIds]);

  const deleteSelectedVariable = useCallback(() => {
    const variableName = String(selectedVariableName || '').trim();
    if (!variableName) return;

    setNodes(current =>
      current.map(node => {
        const parsed = parseTurnTemplate(node?.data?.template || '', node?.data?.slot_type || 'ai');
        const meta = parsed.meta || {};
        const stateWrites = Array.isArray(meta.stateWrites) ? meta.stateWrites : [];
        const nextStateWrites = stateWrites.filter(rule => String(rule?.key || '').trim() !== variableName);
        if (nextStateWrites.length === stateWrites.length) return node;
        return {
          ...node,
          data: {
            ...node.data,
            template: serializeTurnTemplate(
              {
                ...meta,
                stateWrites: nextStateWrites,
              },
              parsed.body || '',
              node?.data?.slot_type || 'ai'
            ),
          },
        };
      })
    );

    setEdges(current =>
      current.map(edge => {
        const conditions = Array.isArray(edge?.data?.conditions) ? edge.data.conditions : [];
        const nextConditions = conditions.filter(condition => String(condition?.key || '').trim() !== variableName);
        if (nextConditions.length === conditions.length) return edge;
        return {
          ...edge,
          data: {
            ...(edge.data || {}),
            conditions: nextConditions,
          },
        };
      })
    );

    setSelectedVariableName('');
  }, [selectedVariableName, setEdges, setNodes]);

  const handleVariablePointerDown = useCallback(event => {
    if (!variableModeOpen || !canvasHostRef.current) return;
    if (event.target?.dataset?.variablePanel === 'true') return;
    const bounds = canvasHostRef.current.getBoundingClientRect();
    const start = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    setVariableSelection({
      active: true,
      start,
      rect: { x: start.x, y: start.y, width: 0, height: 0 },
    });
  }, [variableModeOpen]);

  const handleVariablePointerMove = useCallback(event => {
    if (!variableSelection.active || !variableSelection.start || !canvasHostRef.current) return;
    const bounds = canvasHostRef.current.getBoundingClientRect();
    const currentPoint = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    const rect = {
      x: Math.min(variableSelection.start.x, currentPoint.x),
      y: Math.min(variableSelection.start.y, currentPoint.y),
      width: Math.abs(currentPoint.x - variableSelection.start.x),
      height: Math.abs(currentPoint.y - variableSelection.start.y),
    };
    const selectedIds = (nodes || [])
      .filter(node => {
        const centerX = variableViewport.x + (node.position?.x || 0) * variableViewport.zoom + 150 * variableViewport.zoom;
        const centerY = variableViewport.y + (node.position?.y || 0) * variableViewport.zoom + 70 * variableViewport.zoom;
        return (
          centerX >= rect.x &&
          centerX <= rect.x + rect.width &&
          centerY >= rect.y &&
          centerY <= rect.y + rect.height
        );
      })
      .map(node => node.id);
    setVariableNodeIds(selectedIds);
    setVariableSelection(current => ({ ...current, rect }));
  }, [nodes, variableSelection.active, variableSelection.start, variableViewport]);

  const handleVariablePointerUp = useCallback(() => {
    if (!variableSelection.active || !variableSelection.rect) {
      setVariableSelection({ active: false, rect: null, start: null });
      return;
    }
    const { rect } = variableSelection;
    setVariableSelection({ active: false, rect: null, start: null });
  }, [variableSelection]);

  useEffect(() => {
    if (!selectedNode && !selectedEdge) {
      setQuickEditOpen(false);
    }
  }, [selectedEdge, selectedNode]);

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
        <MinimalMakerHeader
          busy={busy}
          onBack={goToSetList}
          onSave={unifiedSaveAll}
          onToggleVariables={() => {
            if (variableModeOpen) {
              closeVariableMode();
            } else {
              setVariableModeOpen(true);
            }
          }}
          variablesActive={variableModeOpen}
        />

        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <button
              type="button"
              onClick={() => setShowGameConfig(prev => !prev)}
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                borderRadius: 999,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {showGameConfig ? '게임 설정 접기' : '게임 설정 열기'}
            </button>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {battleConfig.mode === 'multi' ? '멀티' : '싱글'} · {battleConfig.minPlayers}~{battleConfig.maxPlayers}명 · 역할 {(battleConfig.roles || []).length}개
            </span>
          </div>

          {showGameConfig ? (
            <div
              style={{
                background: '#ffffff',
                borderRadius: 20,
                padding: 16,
                display: 'grid',
                gap: 14,
                border: '1px solid #cbd5e1',
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 15, color: '#0f172a' }}>게임 설정</strong>
                <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                  이 게임에 몇 명까지 참가할지와 역할 구성을 메이커에서 직접 정합니다. 등록 페이지에서는 이 값을 읽기만 하게 맞춥니다.
                </span>
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>모드</span>
                  <select
                    name="battle-mode"
                    value={battleConfig.mode}
                    onChange={event => updateBattleConfig({ mode: event.target.value })}
                    style={configInputStyle}
                  >
                    <option value="single">싱글</option>
                    <option value="multi">멀티</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>최소 인원</span>
                  <select
                    name="battle-min-players"
                    value={battleConfig.minPlayers}
                    onChange={event => updateBattleConfig({ minPlayers: Number(event.target.value) })}
                    style={configInputStyle}
                  >
                    {playerCountOptions.map(count => (
                      <option key={`battle-min-${count}`} value={count}>
                        {count}명
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>최대 인원</span>
                  <select
                    name="battle-max-players"
                    value={battleConfig.maxPlayers}
                    onChange={event => updateBattleConfig({ maxPlayers: Number(event.target.value) })}
                    style={configInputStyle}
                  >
                    {playerCountOptions.map(count => (
                      <option key={`battle-max-${count}`} value={count}>
                        {count}명
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>허용 점수 편차</span>
                  <select
                    name="battle-score-range"
                    value={battleConfig.scoreRange || 0}
                    onChange={event => updateBattleConfig({ scoreRange: Number(event.target.value) })}
                    style={configInputStyle}
                  >
                    <option value={0}>제한 없음</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={300}>300</option>
                    <option value={500}>500</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>역할 목록</span>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) 110px auto' }}>
                  <input
                    name="battle-role-name"
                    value={roleDraft.name}
                    onChange={event => setRoleDraft(current => ({ ...current, name: event.target.value }))}
                    placeholder="역할명"
                    style={configInputStyle}
                  />
                  <input
                    name="battle-role-team"
                    value={roleDraft.team}
                    onChange={event => setRoleDraft(current => ({ ...current, team: event.target.value }))}
                    placeholder="팀"
                    style={configInputStyle}
                  />
                  <select
                    name="battle-role-limit"
                    value={roleDraft.limit}
                    onChange={event => setRoleDraft(current => ({ ...current, limit: event.target.value }))}
                    style={configInputStyle}
                  >
                    {playerCountOptions.map(count => (
                      <option key={`battle-role-${count}`} value={count}>
                        {count}명
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addRoleEntry}
                    style={{
                      border: '1px solid #0f172a',
                      background: '#0f172a',
                      color: '#f8fafc',
                      borderRadius: 14,
                      padding: '0 14px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    추가
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(battleConfig.roles || []).length ? (
                    battleConfig.roles.map(role => (
                      <div
                        key={role.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 999,
                          background: '#e2e8f0',
                          color: '#0f172a',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <span>{role.name}</span>
                        <span style={{ color: '#475569' }}>{role.team || '팀 없음'}</span>
                        <span style={{ color: '#475569' }}>{role.limit}명</span>
                        <button
                          type="button"
                          onClick={() => removeRoleEntry(role.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#b91c1c',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: 11, color: '#6b7280' }}>아직 추가된 역할이 없습니다.</span>
                  )}
                </div>
                {roleSlotPreview.length ? (
                  <div
                    style={{
                      display: 'grid',
                      gap: 6,
                      borderRadius: 14,
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      padding: 12,
                    }}
                  >
                    <strong style={{ fontSize: 12, color: '#0f172a' }}>슬롯 배치 미리보기</strong>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {roleSlotPreview.map(entry => (
                        <span
                          key={`${entry.slotLabel}:${entry.roleName}:${entry.team}`}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: '#e2e8f0',
                            color: '#0f172a',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {entry.slotLabel} · {entry.roleName}
                          {entry.team ? ` · 팀 ${entry.team}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <MakerEditorCanvas
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          onSelectionChange={onSelectionChange}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onViewportChange={setVariableViewport}
          overlay={
            variableModeOpen ? (
              <div
                ref={canvasHostRef}
                onPointerDown={handleVariablePointerDown}
                onPointerMove={handleVariablePointerMove}
                onPointerUp={handleVariablePointerUp}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(2, 6, 23, 0.28)',
                  zIndex: 12,
                  cursor: 'crosshair',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: 12,
                    padding: '10px 12px',
                    borderRadius: 14,
                    background: 'rgba(2, 6, 23, 0.82)',
                    color: '#e2e8f0',
                    display: 'grid',
                    gap: 4,
                    maxWidth: 320,
                  }}
                >
                  <strong style={{ fontSize: 13 }}>변수 모드</strong>
                  <span style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55 }}>
                    캔버스 위를 드래그해 노드들을 고른 뒤, 오른쪽 패널에서 기록 변수를 한 번에 적용합니다.
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    현재 선택 노드 {variableNodeIds.length}개
                  </span>
                </div>

                <div
                  data-variable-panel="true"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 12,
                    bottom: 12,
                    width: 'min(340px, calc(100% - 24px))',
                    borderRadius: 18,
                    background: 'rgba(15, 23, 42, 0.92)',
                    border: '1px solid rgba(148, 163, 184, 0.24)',
                    boxShadow: '0 24px 50px -28px rgba(2, 6, 23, 0.88)',
                    padding: 14,
                    display: 'grid',
                    gap: 12,
                    overflowY: 'auto',
                    cursor: 'default',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <strong style={{ color: '#f8fafc', fontSize: 14 }}>변수 목록</strong>
                    <button
                      type="button"
                      onClick={closeVariableMode}
                      style={{
                        border: '1px solid rgba(148,163,184,.35)',
                        background: 'rgba(255,255,255,.06)',
                        color: '#e2e8f0',
                        borderRadius: 999,
                        padding: '7px 12px',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      닫기
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {variableCatalog.length ? variableCatalog.map(name => {
                      const color = colorForVariable(name);
                      const active = selectedVariableName === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setSelectedVariableName(current => current === name ? '' : name)}
                          style={{
                            border: `1px solid ${active ? color : 'rgba(148,163,184,.25)'}`,
                            background: active ? `${color}22` : 'rgba(255,255,255,.04)',
                            color: '#f8fafc',
                            borderRadius: 999,
                            padding: '6px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: color, marginRight: 6 }} />
                          {name}
                        </button>
                      );
                    }) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>아직 기록된 변수가 없습니다.</span>
                    )}
                  </div>

                  {selectedVariableName ? (
                    <button
                      type="button"
                      onClick={deleteSelectedVariable}
                      style={{
                        justifySelf: 'start',
                        border: '1px solid rgba(248,113,113,.45)',
                        background: 'rgba(127,29,29,.35)',
                        color: '#fecaca',
                        borderRadius: 999,
                        padding: '8px 12px',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      선택 변수 삭제
                    </button>
                  ) : null}

                  <div
                    style={{
                      borderRadius: 14,
                      border: '1px solid rgba(148,163,184,.2)',
                      background: 'rgba(2,6,23,.42)',
                      padding: 12,
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <strong style={{ color: '#f8fafc', fontSize: 13 }}>선택 노드에 기록 슬롯 추가</strong>
                    <span style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                      아래 문장을 채우면 선택한 노드들에
                      <code style={{ margin: '0 4px', color: '#f8fafc' }}>~이면 ~라는 변수를 기록</code>
                      하는 규칙이 같이 들어갑니다.
                    </span>

                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>언제 기록할까</span>
                      <select
                        value={variableDraft.sourceType}
                        onChange={event => setVariableDraft(current => ({ ...current, sourceType: event.target.value }))}
                        style={overlayInputStyle}
                      >
                        <option value="always">항상</option>
                        <option value="input">입력값</option>
                        <option value="gameResult">게임 결과</option>
                        <option value="teamOutcome">팀 결과</option>
                        <option value="participantOutcome">참가자 결과</option>
                      </select>
                    </label>

                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>누구 / 무엇을 기준으로</span>
                      <input
                        value={variableDraft.sourceKey}
                        onChange={event => setVariableDraft(current => ({ ...current, sourceKey: event.target.value }))}
                        placeholder="예: 팀 1 / participant-1 / 선택지 id"
                        style={overlayInputStyle}
                      />
                    </label>

                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>어떤 상태면</span>
                      <input
                        value={variableDraft.equals}
                        onChange={event => setVariableDraft(current => ({ ...current, equals: event.target.value }))}
                        placeholder="예: win / eliminated / yes"
                        style={overlayInputStyle}
                      />
                    </label>

                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>그때 적을 변수 이름</span>
                      <input
                        value={variableDraft.key}
                        onChange={event => setVariableDraft(current => ({ ...current, key: event.target.value }))}
                        placeholder="예: state.enemyDown"
                        style={overlayInputStyle}
                      />
                    </label>

                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>그 변수에 적을 값</span>
                      <input
                        value={variableDraft.value}
                        onChange={event => setVariableDraft(current => ({ ...current, value: event.target.value }))}
                        placeholder="예: true / 1 / red"
                        style={overlayInputStyle}
                      />
                    </label>

                    <div
                      style={{
                        borderRadius: 12,
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(148,163,184,.22)',
                        padding: '10px 12px',
                        fontSize: 12,
                        color: '#e2e8f0',
                        lineHeight: 1.65,
                      }}
                    >
                      {String(variableDraft.sourceType || '') === 'always'
                        ? `항상 ${variableDraft.key || '(변수 이름)'} 에 ${variableDraft.value || '(값)'} 을 기록`
                        : `${formatVariableSourceLabel(variableDraft.sourceType)} ${variableDraft.sourceKey || '(대상)'} 가 ${variableDraft.equals || '(조건값)'} 이면 ${variableDraft.key || '(변수 이름)'} 에 ${variableDraft.value || '(값)'} 을 기록`}
                    </div>

                    <button
                      type="button"
                      onClick={applyVariableDraftToSelection}
                      disabled={!variableNodeIds.length || !String(variableDraft.key || '').trim()}
                      style={{
                        border: '1px solid #1d4ed8',
                        background: !variableNodeIds.length || !String(variableDraft.key || '').trim() ? 'rgba(29,78,216,.35)' : '#1d4ed8',
                        color: '#fff',
                        borderRadius: 12,
                        padding: '10px 12px',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: !variableNodeIds.length || !String(variableDraft.key || '').trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      선택 노드에 적용
                    </button>
                  </div>
                </div>

                {variableSelection.rect ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: variableSelection.rect.x,
                      top: variableSelection.rect.y,
                      width: variableSelection.rect.width,
                      height: variableSelection.rect.height,
                      border: '1px solid #38bdf8',
                      background: 'rgba(56, 189, 248, 0.14)',
                      borderRadius: 10,
                      pointerEvents: 'none',
                    }}
                  />
                ) : null}
              </div>
            ) : null
          }
        />
      </div>

      <AddPromptFab
        onAdd={type => {
          addPromptNode(type, '');
          setSelectedEdge(null);
          setQuickEditOpen(true);
          setActivePanelTab('selection');
        }}
      />

      {quickEditOpen && (selectedNode || selectedEdge) ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 140,
            background: 'rgba(2, 6, 23, 0.54)',
            display: 'grid',
            alignItems: 'start',
            justifyItems: 'center',
            padding: 'max(env(safe-area-inset-top), 16px) 12px calc(env(safe-area-inset-bottom) + 24px)',
            overflowY: 'auto',
          }}
          onClick={() => setQuickEditOpen(false)}
        >
          <div
            style={{
              width: 'min(760px, 100%)',
              display: 'grid',
              gap: 10,
            }}
            onClick={event => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 18,
                background: '#0f172a',
                color: '#f8fafc',
                boxShadow: '0 20px 50px -26px rgba(15, 23, 42, 0.82)',
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 15 }}>
                  {selectedEdge ? '분기 빠른 편집' : '노드 빠른 편집'}
                </strong>
                <span style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                  {selectedEdge
                    ? '조건 슬롯만 빠르게 손보고 바로 캔버스로 돌아갈 수 있습니다.'
                    : '실행 본문, 입력 방식, 조건 기록만 빠르게 수정합니다.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQuickEditOpen(false)}
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#f8fafc',
                  borderRadius: 999,
                  padding: '10px 14px',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>

            <MakerEditorPanel
              compact
              focusMode="quick"
              rolePresets={battleConfig.roles || []}
              slotPresets={roleSlotPreview}
              selectedNode={selectedNode}
              selectedNodeId={selectedNodeId}
              selectedEdge={resolvedSelectedEdge}
              onMarkAsStart={markAsStart}
              onDeleteSelected={() => {
                if (selectedNodeId) {
                  deletePrompt(selectedNodeId);
                }
                setQuickEditOpen(false);
              }}
              setNodes={setNodes}
              setEdges={setEdges}
            />
          </div>
        </div>
      ) : null}

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

const configInputStyle = {
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  padding: '10px 12px',
  fontSize: 13,
  color: '#0f172a',
};

const overlayInputStyle = {
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,.28)',
  background: '#f8fafc',
  padding: '10px 12px',
  fontSize: 13,
  color: '#0f172a',
};
