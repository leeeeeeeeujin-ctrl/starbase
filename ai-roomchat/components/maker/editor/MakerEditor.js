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

export default function MakerEditor() {
  const { status, graph, selection, persistence, history, definition: battleDefinition } = useMakerEditor();
  const { writeFile, files } = useWorkspace();
  const [showGameConfig, setShowGameConfig] = useState(false);
  const [roleDraft, setRoleDraft] = useState({ name: '', team: '', limit: '1' });
  const [quickEditOpen, setQuickEditOpen] = useState(false);
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
        <MinimalMakerHeader busy={busy} onBack={goToSetList} onSave={unifiedSaveAll} />

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
          nodes={nodes}
          edges={edges}
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
              selectedNode={selectedNode}
              selectedNodeId={selectedNodeId}
              selectedEdge={selectedEdge}
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
