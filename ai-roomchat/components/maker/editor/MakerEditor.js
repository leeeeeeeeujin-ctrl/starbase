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
  const roleText = useMemo(
    () =>
      (battleConfig.roles || [])
        .map(role => [role.name, role.team || '', role.limit || 1].join('|'))
        .join('\n'),
    [battleConfig.roles]
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

  const updateRoleText = useCallback(
    value => {
      const roles = String(value || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const [namePart, teamPart = '', limitPart = '1'] = line.split('|').map(entry => entry.trim());
          if (!namePart) return null;
          return {
            id: `role-${index + 1}`,
            name: namePart,
            team: teamPart,
            limit: Number.isFinite(Number(limitPart)) ? Math.max(1, Number(limitPart)) : 1,
          };
        })
        .filter(Boolean);
      updateBattleConfig({ roles });
    },
    [updateBattleConfig]
  );

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

        <section
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
              <input
                name="battle-min-players"
                type="number"
                min="1"
                max="12"
                value={battleConfig.minPlayers}
                onChange={event => updateBattleConfig({ minPlayers: Number(event.target.value) || 1 })}
                style={configInputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>최대 인원</span>
              <input
                name="battle-max-players"
                type="number"
                min="1"
                max="12"
                value={battleConfig.maxPlayers}
                onChange={event => updateBattleConfig({ maxPlayers: Number(event.target.value) || 1 })}
                style={configInputStyle}
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>역할 목록</span>
            <textarea
              name="battle-roles"
              rows={5}
              value={roleText}
              onChange={event => updateRoleText(event.target.value)}
              style={{ ...configInputStyle, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              placeholder={'공격|red|2\n수비|blue|2'}
            />
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              한 줄에 `역할명|팀|인원수` 형식으로 적습니다. 예: `healer|blue|2`
            </span>
          </label>
        </section>

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

const configInputStyle = {
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  padding: '10px 12px',
  fontSize: 13,
  color: '#0f172a',
};
