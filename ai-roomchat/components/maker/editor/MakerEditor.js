'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudioTemplate } from '../../../contexts/StudioStore';
import useIsMobile from '../../../utils/useIsMobile';

import { useMakerEditor } from '../../../hooks/maker/useMakerEditor';
import { useWorkspace } from '../../workspace/CodeWorkspaceProvider.jsx';
import { saveSet } from '../../../lib/workspace/saveSet.js';
import { publishRankWorkspaceForPromptSet } from '../../../lib/rank/saveGameWorkspaceClient.js';
import { exportSet, importSet } from './importExport';
import MakerEditorCanvas from './MakerEditorCanvas';
import MinimalMakerHeader from './MinimalMakerHeader';
import MakerEditorPanel from './MakerEditorPanel';
import AddPromptFab from './AddPromptFab';
import VariableDrawer from './VariableDrawer';
import AdvancedToolsPanel from './AdvancedToolsPanel';
// Removed legacy editors; using StudioJsonEditor for unified JSON
import CodeEditorOverlayV2 from '../../workspace/CodeEditorOverlayV2.jsx';
import GameSimulator from './GameSimulator';
import dynamic from 'next/dynamic';
import AutoUpdateListener from '../../infra/AutoUpdateListener.jsx';
import { isWorkspaceDebug } from '../../../lib/workspace/debugFlags.js';
import RolesRankEditor from '../settings/RolesRankEditor';
const ImageToUIGenerator = dynamic(() => import('../ui/ImageToUIGenerator'), { ssr: false });
const MainGameMobileUI = dynamic(() => import('../../game/MainGameMobileUI.jsx'), { ssr: false });
import { applyMainUiPresetObject, getMainUiModules } from '../../../utils/uiPresets';
import { promptSetsRepository } from '../../../lib/maker/promptSets';
import GameShellEditor from '../settings/GameShellEditor.js';

export default function MakerEditor() {
  const isMobile = useIsMobile(820);

  const editorInstanceRef = useRef(null);
  if (editorInstanceRef.current == null) {
    editorInstanceRef.current = Math.random().toString(36).slice(2, 8);
  }

  // Debug mount/unmount to trace remount causes
  useEffect(() => {
    try {
      console.log('[MakerEditor] mount', { instance: editorInstanceRef.current });
    } catch {}
    return () => {
      try {
        console.log('[MakerEditor] unmount', { instance: editorInstanceRef.current });
      } catch {}
    };
  }, []);
  const snapBtn = {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #475569',
    background: '#0f172a',
    color: '#e2e8f0',
    fontSize: 12,
  };
  const { status, graph, selection, variables, persistence, history, version } = useMakerEditor();
  // Unified studio workspace (single-file source of truth)
  let templateText = '';
  let setTemplateText = () => {};
  try {
    const ctx = useStudioTemplate();
    templateText = ctx.templateText;
    setTemplateText = ctx.setTemplateText;
  } catch {
    // not inside StudioProvider; operate without cross-sync
  }

  const { isReady, loading, setInfo } = status;

  if (isWorkspaceDebug()) {
    try {
      console.log('[MakerEditor] render', {
        instance: editorInstanceRef.current,
        isMobile,
      });
    } catch {
      // ignore debug log errors
    }
  }

  useEffect(() => {
    // Hide the header toggle button ("펼치기") and any stray duplicate AI openers in header
    try {
      const hideTexts = ['펼치기', '게임 제작 도구 펼치기'];
      const btns = typeof document !== 'undefined' ? document.querySelectorAll('button') : [];
      btns.forEach(btn => {
        const txt = (btn.textContent || '').trim();
        if (hideTexts.some(t => txt.includes(t))) {
          btn.style.display = 'none';
        }
      });
    } catch {}
  }, []);


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

  // Bridge with StudioStore: keep Maker graph <-> templateText in sync
  const syncingRef = useRef(false);
  const hydratedRef = useRef(false);
  const [splitPct, setSplitPct] = useState(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const PREF_SPLIT = 'maker:ui:splitPct';
  const PREF_VIS = 'maker:ui:panels';
  // panels visibility states must be declared before effects that use them
  const [showMultiLanguageEditor, setShowMultiLanguageEditor] = useState(false);
  const [gameSimulatorOpen, setGameSimulatorOpen] = useState(false);
  const [showGameShellConfig, setShowGameShellConfig] = useState(false);
  const [showRolesConfig, setShowRolesConfig] = useState(false);

  if (isWorkspaceDebug()) {
    try {
      console.log('[MakerEditor] ui-state', {
        instance: editorInstanceRef.current,
        showMultiLanguageEditor,
        gameSimulatorOpen,
      });
    } catch {
      // ignore debug log errors
    }
  }

  const toTemplateObject = useCallback(() => {
    const tpl = (() => { try { return JSON.parse(templateText || '{}'); } catch { return {}; } })();
    const next = {
      ...tpl,
      nodes: (nodes || []).map(n => ({
        id: n.id,
        type: n.type || 'prompt',
        position: n.position || { x: 0, y: 0 },
        label: n.data?.name || n.data?.title || '',
        data: n.data || {},
      })),
      edges: (edges || []).map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label || '' })),
    };
    return next;
  }, [templateText, nodes, edges]);

  // Hydrate only the node 이름(name/title/label) from template JSON back into graph nodes.
  // 텍스트 프롬프트 내용(template)은 Supabase가 진리의 원천이므로, 여기서는 덮어쓰지 않는다.
  const hydrateNamesFromTemplate = useCallback(() => {
    let obj;
    try {
      obj = JSON.parse(templateText || '{}');
    } catch {
      obj = {};
    }
    const tn = Array.isArray(obj.nodes) ? obj.nodes : [];
    if (!tn.length) return;

    const nameById = new Map();
    tn.forEach(n => {
      const data = n && n.data ? n.data : {};
      const name = data.name || data.title || n.label || '';
      if (n.id && name) {
        nameById.set(n.id, String(name));
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
    let obj; try { obj = JSON.parse(templateText || '{}'); } catch { obj = {}; }
    const tn = Array.isArray(obj.nodes) ? obj.nodes : [];
    const te = Array.isArray(obj.edges) ? obj.edges : [];
    if (tn.length === 0 && te.length === 0) return;
    syncingRef.current = true;
    try {
      setNodes(tn.map(n => ({
        id: n.id || `n_${Math.random().toString(36).slice(2,8)}`,
        type: n.type || 'prompt',
        position: n.position || { x: 0, y: 0 },
        data: n.data || { template: '', slot_type: 'ai' },
      })));
      setEdges(te.map(e => ({ id: e.id || `e_${Math.random().toString(36).slice(2,8)}`, source: e.source, target: e.target, label: e.label || '' })));
      hydratedRef.current = true;
    } finally {
      syncingRef.current = false;
    }
  }, [templateText, setNodes, setEdges]);

  // (removed) overlayGameData: handled inside V2 overlay when needed

  // Initial hydrate when opening existing template
  useEffect(() => {
    // Only hydrate once on initial load, never re-hydrate from templateText changes
    // (nodes are the source of truth after initial load)
    if (!hydratedRef.current && typeof setNodes === 'function' && typeof setEdges === 'function') {
      hydrateFromTemplate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Remove templateText from dependencies!

  // 이름만 템플릿 JSON에서 다시 가져와 그래프에 반영
  useEffect(() => {
    if (!templateText) return;
    hydrateNamesFromTemplate();
  }, [templateText, hydrateNamesFromTemplate]);

  // Restore UI prefs (split and panel visibility)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const s = parseInt(localStorage.getItem(PREF_SPLIT) || '50', 10);
      if (!Number.isNaN(s) && s >= 20 && s <= 80) setSplitPct(s);
      const visRaw = localStorage.getItem(PREF_VIS);
      if (visRaw) {
        const vis = JSON.parse(visRaw);
        if (typeof vis?.code === 'boolean' && vis.code) {
          setShowMultiLanguageEditor(true);
        }
        if (typeof vis?.test === 'boolean') setGameSimulatorOpen(!!vis.test);
      }
    } catch {}
  }, []);

  // Close code overlay on Escape
  useEffect(() => {
    if (!showMultiLanguageEditor) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowMultiLanguageEditor(false); };
    try { window.addEventListener('keydown', onKey); } catch {}
    return () => { try { window.removeEventListener('keydown', onKey); } catch {} };
  }, [showMultiLanguageEditor]);

  useEffect(() => {
    if (!isDraggingSplit) return;
    const onMove = e => {
      const x = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
      const pct = Math.min(80, Math.max(20, Math.round((x / vw) * 100)));
      setSplitPct(pct);
    };
    const onUp = () => setIsDraggingSplit(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDraggingSplit]);

  // Persist UI prefs
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(PREF_SPLIT, String(splitPct));
      localStorage.setItem(
        PREF_VIS,
        JSON.stringify({ code: !!showMultiLanguageEditor, test: !!gameSimulatorOpen })
      );
    } catch {}
  }, [splitPct, showMultiLanguageEditor, gameSimulatorOpen]);

  // Debounced sync to templateText on graph changes
  useEffect(() => {
    if (syncingRef.current) {
      console.log('[MakerEditor] skip sync - syncingRef is true');
      return;
    }
    const t = setTimeout(() => {
      try {
        const obj = toTemplateObject();
        console.log('[MakerEditor] syncing nodes→templateText', {
          nodeCount: nodes.length,
          templates: nodes.map(n => n.data?.template?.substring(0, 30))
        });
        setTemplateText && setTemplateText(JSON.stringify(obj, null, 2));
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [nodes, edges, toTemplateObject, setTemplateText]);

  // Real-time sync to workspace /graph/prompt-graph.json
  const { writeFile, files } = useWorkspace();
  useEffect(() => {
    if (syncingRef.current || !nodes || !edges || !writeFile) return;
    const t = setTimeout(() => {
      try {
        // 워크스페이스 /graph 파일에 실시간 반영
        const graphData = {
          nodes: nodes.map(n => ({
            id: n.id,
            type: n.type || 'prompt',
            label: n.data?.template?.slice(0, 50) || n.data?.label || n.id,
            data: n.data || {}
          })),
          edges: edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label || '',
            data: e.data || {}
          }))
        };
        writeFile('/graph/prompt-graph.json', JSON.stringify(graphData, null, 2) + '\n');
        
        // entryNode도 자동 업데이트 (시작 노드가 있으면)
        const startNode = nodes.find(n => n.data?.isStart);
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
      } catch (err) {
        console.warn('[MakerEditor] sync to workspace /graph failed', err);
      }
    }, 300);
    return () => clearTimeout(t);
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

  const { busy, saveAll, deletePrompt, addPromptNode, goToSetList, goToLobby } = persistence;
  // Unify saves: after Maker DB save, also persist workspace VFS files (including drafts) for this set
  // 그리고 rank_game_workspaces 에 텍스트 런타임 메타를 best‑effort 로 퍼블리시한다.
  const wsFiles = files || {};
  const unifiedSaveAll = useCallback(async () => {
    if (busy) return;
    const setKey = String(status?.setInfo?.id || status?.router?.query?.id || '').trim();
    try {
      await saveAll();
      try {
        if (setKey) {
          await saveSet(setKey, wsFiles);
        }
      } catch (e) {
        try {
          console.warn('[MakerEditor] workspace save failed', e);
        } catch {}
      }
      try {
        if (setKey) {
          await publishRankWorkspaceForPromptSet(setKey, wsFiles);
        }
      } catch (e) {
        try {
          console.warn('[MakerEditor] rank workspace publish failed', e);
        } catch {}
      }
    } catch (e) {
      throw e;
    }
  }, [busy, saveAll, wsFiles, status?.setInfo, status?.router]);

  const {
    entries: saveHistory,
    storageKey: historyStorageKey,
    exportEntries: exportHistory,
    clearEntries: clearHistory,
    receipt: saveReceipt,
    ackReceipt,
  } = history;

  const { alert: versionAlert, clearAlert: clearVersionAlert } = version;
  // Expose minimal actions for panel-level toolbar without prop plumbing
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
        if (typeof window !== 'undefined' && window.__makerActions) delete window.__makerActions;
      } catch {}
    };
  }, [addPromptNode, unifiedSaveAll]);
  const [variableDrawerOpen, setVariableDrawerOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(true);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showImageToUI, setShowImageToUI] = useState(false);
  const [showResourceEditor, setShowResourceEditor] = useState(false);
  const [showUiSettings, setShowUiSettings] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(false);
  // Lock background scroll when code editor overlay is open
  useEffect(() => {
    try {
      const b = document?.body; if (!b) return;
      if (showMultiLanguageEditor) {
        const prev = b.style.overflow;
        b.dataset.prevOverflow = prev;
        b.style.overflow = 'hidden';
      } else {
        if (b.dataset.prevOverflow !== undefined) b.style.overflow = b.dataset.prevOverflow;
        else b.style.overflow = '';
        delete b.dataset.prevOverflow;
      }
    } catch {}
  }, [showMultiLanguageEditor]);
  useEffect(() => {
    // Lock header as collapsed; never expand
    if (!headerCollapsed) setHeaderCollapsed(true);
  }, [headerCollapsed]);
  // Explicitly disable any chat overlays in this editor
  useEffect(() => {
    try { if (typeof window !== 'undefined') window.__DISABLE_CHAT_OVERLAY__ = true; } catch {}
    return () => { try { if (typeof window !== 'undefined') delete window.__DISABLE_CHAT_OVERLAY__; } catch {} };
  }, []);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(null);

  // 🤖 AI로 게임 만들기 핸들러
  const [isAICreating, setIsAICreating] = useState(false);

  // ⚡ JavaScript 코드 에디터
  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [gameCode, setGameCode] = useState('');
  // deprecated: replaced by gameSimulatorOpen
  const [simulationResults, setSimulationResults] = useState(null);

  // ESC로 코드 오버레이 닫기 (fullscreen overlay)
  useEffect(() => {
    if (!showMultiLanguageEditor) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowMultiLanguageEditor(false); };
    try { document.addEventListener('keydown', onKey); } catch {}
    return () => { try { document.removeEventListener('keydown', onKey); } catch {} };
  }, [showMultiLanguageEditor]);

  const handleCreateWithAI = useCallback(async () => {
    const userPrompt = prompt(
      '🎮 어떤 게임을 만들고 싶으세요?\n\n예시:\n• "중세 기사들이 용과 싸우는 게임"\n• "우주에서 외계인과 전투하는 게임"\n• "좀비 아포칼립스 생존 게임"'
    );

    if (!userPrompt) return;

    setIsAICreating(true);

    try {
      // 🚀 실제 AI Worker Pool 호출!
      const { generateGameWithAI } = await import('../../../lib/aiWorkerClient');

      console.log('🤖 AI Worker Pool에 게임 생성 요청:', userPrompt);

      const aiResult = await generateGameWithAI(userPrompt);

      if (aiResult && aiResult.gameNodes) {
        // AI가 생성한 게임 노드들 추가
        aiResult.gameNodes.forEach((node, index) => {
          setTimeout(() => {
            addPromptNode(node.type, node.template);
          }, index * 300); // 0.3초 간격으로 순차 생성
        });

        alert(
          `🎮 AI가 "${aiResult.gameName || '새로운 게임'}"을 생성했습니다!\n\n${aiResult.gameNodes.length}개의 프롬프트 노드가 생성되었습니다.`
        );
      } else {
        throw new Error('AI 응답 형식이 올바르지 않습니다.');
      }
    } catch (error) {
      console.warn('AI Worker Pool 연결 실패, 로컬 생성으로 대체:', error.message);

      // AI Worker Pool 연결 실패시 로컬 생성으로 대체
      if (userPrompt.includes('중세') || userPrompt.includes('기사')) {
        addPromptNode('ai', '당신은 중세 시대의 용맹한 기사입니다. 용감하게 모험을 시작하세요!');
        setTimeout(
          () => addPromptNode('user_action', '어떤 행동을 하시겠습니까? (공격, 방어, 마법 등)'),
          300
        );
        setTimeout(
          () => addPromptNode('system', '🐉 거대한 용이 나타났습니다! HP: 100 | 공격력: 25'),
          600
        );
      } else if (userPrompt.includes('우주') || userPrompt.includes('외계인')) {
        addPromptNode('ai', '🚀 우주선 조종사가 되어 외계인과 맞서 싸우세요!');
        setTimeout(
          () =>
            addPromptNode('user_action', '어떤 전술을 사용하시겠습니까? (레이저, 미사일, 회피 등)'),
          300
        );
        setTimeout(
          () => addPromptNode('system', '👽 외계인 함대 접근 중... 경고! 적 함선 3대 감지'),
          600
        );
      } else if (userPrompt.includes('좀비')) {
        addPromptNode('ai', '🧟 좀비 아포칼립스에서 살아남으세요! 자원을 관리하고 생존하세요.');
        setTimeout(
          () => addPromptNode('user_action', '어떻게 행동하시겠습니까? (수색, 건설, 전투 등)'),
          300
        );
        setTimeout(
          () => addPromptNode('system', '⚠️ 좀비 무리가 다가옵니다! 생존자 HP: 100 | 탄약: 30'),
          600
        );
      } else {
        // 범용 게임 생성
        addPromptNode('ai', `${userPrompt}을 주제로 한 흥미진진한 게임을 시작합니다!`);
        setTimeout(() => addPromptNode('user_action', '어떤 행동을 선택하시겠습니까?'), 300);
        setTimeout(() => addPromptNode('system', '게임이 시작되었습니다! 상황을 파악하세요.'), 600);
      }

      alert(
        '🎮 로컬 AI로 게임을 생성했습니다!\n\n생성된 프롬프트들을 확인하고 편집해보세요.\n\n💡 팁: AI Worker Pool VS Code Extension을 실행하면 더 고급 AI 기능을 사용할 수 있습니다!'
      );
    } finally {
      setTimeout(() => setIsAICreating(false), 1000); // 1초 후 로딩 종료
    }
  }, [addPromptNode]);

  // ⚡ 코드 실행 핸들러
  const handleCodeRun = useCallback(
    result => {
      console.log('🎮 게임 코드 실행 결과:', result);

      if (result.success) {
        // 코드 실행 성공시 게임 로직을 저장
        setGameCode(result.code);

        // 실행 결과를 시스템 노드로 추가 (옵션)
        if (result.result && typeof result.result === 'object') {
          const resultText = `🎮 게임 코드 실행 결과:\n${JSON.stringify(result.result, null, 2)}`;
          addPromptNode('system', resultText);
        }
      }
    },
    [addPromptNode]
  );

  // 코드 에디터 열기
  const openCodeEditor = useCallback(() => {
    setCodeEditorOpen(true);
  }, []);

  // 메인 게임 UI 기본 프리셋 주입
  const insertMainUiPreset = useCallback(() => {
    try {
      const obj = (() => { try { return JSON.parse(templateText || '{}'); } catch { return {}; } })();
      const next = applyMainUiPresetObject(obj);
      setTemplateText && setTemplateText(JSON.stringify(next, null, 2));
    } catch {}
  }, [templateText, setTemplateText]);

  // 🎮 Rank 메인게임과 연동하기 위한 워크스페이스 스냅샷 저장
  //
  // - 현재 워크스페이스의 핵심 파일(/template.json, /graph/prompt-graph.json,
  //   /game/runtime.config.json, /game/hooks/automation.js)을 모아서
  //   `/api/rank/save-game-workspace` 로 전송한다.
  // - 이 API는 rank_games.owner_id 권한을 체크하므로, Maker에서 해당 게임의
  //   owner 인 상태에서만 성공한다.
  const [saveToRankBusy, setSaveToRankBusy] = useState(false);
  const [saveToRankMessage, setSaveToRankMessage] = useState(null);

  const handleSaveWorkspaceToRankGame = useCallback(async () => {
    const rawGameId = setInfo?.rankGameId || setInfo?.gameId || null;
    const gameId =
      typeof rawGameId === 'string' && rawGameId.trim() ? rawGameId.trim() : null;
    if (!gameId) {
      alert('이 워크스페이스와 연결된 랭크 게임 ID를 찾지 못했습니다.\n\n게임 등록 후 다시 시도해 주세요.');
      return;
    }

    try {
      setSaveToRankBusy(true);
      setSaveToRankMessage(null);

      const currentFiles = files || {};
      const readContentOrNull = path => {
        try {
          const file = currentFiles[path];
          if (!file || typeof file.content !== 'string') return null;
          const trimmed = file.content.trim();
          return trimmed ? file.content : null;
        } catch {
          return null;
        }
      };

      let templateJson = null;
      let graphJson = null;
      let runtimeConfigJson = null;

      const templateTextContent = readContentOrNull('/template.json');
      const graphTextContent = readContentOrNull('/graph/prompt-graph.json');
      const runtimeConfigTextContent = readContentOrNull('/game/runtime.config.json');
      const hooksSource = readContentOrNull('/game/hooks/automation.js');

      try {
        if (templateTextContent) {
          templateJson = JSON.parse(templateTextContent);
        }
      } catch {
        // template 파싱 실패는 계속 진행하되, 서버에서 추가 검증을 하도록 둔다.
      }
      try {
        if (graphTextContent) {
          graphJson = JSON.parse(graphTextContent);
        }
      } catch {
        // graph 파싱 실패 역시 서버에서 거르도록 두고, 최소한의 형태만 보낸다.
      }
      try {
        if (runtimeConfigTextContent) {
          runtimeConfigJson = JSON.parse(runtimeConfigTextContent);
        }
      } catch {
        // runtime.config 는 선택 필드이므로 파싱 실패 시 null 로 둔다.
      }

      const payload = {
        gameId,
        workspace: {
          template: templateJson,
          graph: graphJson,
          runtime_config: runtimeConfigJson,
          hooks_source: hooksSource,
          ui_shell: null,
        },
      };

      const res = await fetch('/api/rank/save-game-workspace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (!res.ok || !body?.ok) {
        const msg =
          body?.detail ||
          body?.error ||
          `워크스페이스를 랭크 게임에 저장하지 못했습니다. (HTTP ${res.status})`;
        setSaveToRankMessage(msg);
        alert(
          '랭크 메인게임 워크스페이스 저장에 실패했습니다.\n\n' +
            (typeof msg === 'string' ? msg : '잠시 후 다시 시도해 주세요.')
        );
        return;
      }

      const successMsg = '현재 워크스페이스 구성이 랭크 메인게임 워크스페이스에 저장되었습니다.';
      setSaveToRankMessage(successMsg);
      alert(successMsg);
    } catch (err) {
      const msg = err?.message || String(err);
      setSaveToRankMessage(msg);
      alert(
        '랭크 메인게임 워크스페이스 저장 중 오류가 발생했습니다.\n\n' +
          (typeof msg === 'string' ? msg : '')
      );
    } finally {
      setSaveToRankBusy(false);
    }
  }, [setInfo]);

  // 🎮 게임 시뮬레이션 상태

  // 게임 시뮬레이션 시작
  const startGameSimulation = useCallback(() => {
    if (!nodes || nodes.length === 0) {
      alert('시뮬레이션할 게임 노드가 없습니다. 먼저 프롬프트를 추가하세요.');
      return;
    }

    // 현재 게임 데이터를 JSON 형태로 변환
    const gameData = {
      meta: {
        version: 2,
        createdAt: new Date().toISOString(),
        createdBy: 'Game Simulator',
      },
      set: {
        name: setInfo?.name || '시뮬레이션 게임',
        description: '게임 시뮬레이션 테스트',
      },
      slots: nodes.map((node, index) => ({
        slot_no: parseInt(node.id) || index,
        slot_type: node.type || 'ai',
        template: node.data?.label || '',
        is_start: node.data?.isStart || false,
        canvas_x: node.position?.x || 0,
        canvas_y: node.position?.y || 0,
        var_rules_global: {},
        var_rules_local: {},
      })),
      bridges: edges.map(edge => ({
        from_slot_id: edge.source,
        to_slot_id: edge.target,
        trigger_words: [],
        conditions: [],
        priority: 1,
        probability: 1,
      })),
    };

    console.log('🎮 게임 시뮬레이션 데이터:', gameData);
    setGameSimulatorOpen(true);
  }, [nodes, edges, setInfo]);

  // 시뮬레이션 결과 처리
  const handleSimulationResult = useCallback(result => {
    console.log('🎯 시뮬레이션 결과:', result);
    if (result.success) {
      alert(`시뮬레이션 완료!\n총 ${result.logs.length}개의 로그가 생성되었습니다.`);
    }
  }, []);

  // 다중 언어 코드 실행 핸들러
  const handleMultiLanguageCodeExecution = useCallback(result => {
    if (result.action === 'close') {
      setShowMultiLanguageEditor(false);
    } else {
      console.log('🚀 다중 언어 코드 실행 결과:', result);

      // 실행 결과를 게임에 적용하는 로직
      if (result.success && result.result) {
        // JavaScript 실행 결과를 노드로 변환하거나 게임 상태 업데이트
        console.log('🎮 게임 상태 업데이트:', result.result);
      }
    }
  }, []);

  const collapsedQuickActions = useMemo(
    () => [
      { label: '+AI', onClick: () => addPromptNode('ai') },
      { label: '+유저', onClick: () => addPromptNode('user_action') },
      { label: '+시스템', onClick: () => addPromptNode('system') },
      { label: busy ? '저장 중…' : '저장', onClick: unifiedSaveAll, disabled: busy },
    ],
    [addPromptNode, busy, saveAll]
  );

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
    [panelTabs, setActivePanelTab, setAdvancedToolsOpen]
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

  const handleAutoUpgrade = useCallback(async () => {
    if (busy) return;
    try {
      await saveAll();
    } catch (error) {
      console.error(error);
    }
  }, [busy, unifiedSaveAll]);

  const handleDismissVersionAlert = useCallback(() => {
    clearVersionAlert();
  }, [clearVersionAlert]);

  useEffect(() => {
    if (!saveReceipt) {
      setReceiptVisible(null);
      return;
    }

    setReceiptVisible(saveReceipt);

    const timeout = window.setTimeout(() => {
      ackReceipt(saveReceipt.id);
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [saveReceipt, ackReceipt]);

  useEffect(() => {
    if (!receiptVisible) return;

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        ackReceipt(receiptVisible.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [receiptVisible, ackReceipt]);

  if (!isReady || loading) {
    return <div style={{ padding: 20 }}>불러오는 중…</div>;
  }

  // AI 게임 생성 중일 때 로딩 화면
  if (isAICreating) {
    return (
      <div
        style={{
          height: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🤖</div>
          <h2 style={{ fontSize: 24, marginBottom: 16 }}>AI가 게임을 생성하고 있습니다</h2>
          <div style={{ fontSize: 16, opacity: 0.9, lineHeight: 1.6 }}>
            <div>🌍 게임 세계 설계 중...</div>
            <div>👥 캐릭터 능력 밸런싱 중...</div>
            <div>⚔️ 게임플레이 시나리오 생성 중...</div>
            <div>🎲 게임 규칙 최적화 중...</div>
          </div>
          <div
            style={{
              marginTop: 30,
              padding: '12px 24px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: 20,
              fontSize: 14,
            }}
          >
            잠시만 기다려주세요... ✨
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ height: '100svh', background: '#f1f5f9', display: 'flex', flexDirection: 'column', width: '100vw', overflow: 'hidden' }}
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
          onStartSimulation={startGameSimulation}
          onSave={unifiedSaveAll}
          onCreateWithAI={handleCreateWithAI}
          onSaveToRank={handleSaveWorkspaceToRankGame}
          saveToRankBusy={saveToRankBusy}
          saveToRankMessage={saveToRankMessage}
          onOpenCode={async () => {
            if (busy) return;
            try {
              await unifiedSaveAll();
            } catch (e) {
              try {
                alert('저장 중 오류가 발생했습니다. 코드 에디터로 이동하기 전에 다시 시도해 주세요.\n\n' + String(e?.message || e));
              } catch {}
              return;
            }
            try {
              if (typeof window !== 'undefined') window.__INLINE_CODE_IN_PANEL__ = true;
            } catch {}
            setShowMultiLanguageEditor(true);
          }}
          onOpenUiSettings={() => setShowUiSettings(true)}
          onOpenRolesConfig={() => setShowRolesConfig(true)}
          onOpenGameShell={() => setShowGameShellConfig(true)}
        />

        {versionAlert && (
          <div
            style={{
              borderRadius: 14,
              background: '#fff7ed',
              border: '1px solid #fdba74',
              color: '#9a3412',
              padding: '14px 16px',
              display: 'grid',
              gap: 10,
            }}
            role="status"
            aria-live="polite"
          >
            <div style={{ display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: 15 }}>변수 규칙 버전 자동 갱신 필요</strong>
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
                onClick={handleAutoUpgrade}
                disabled={busy}
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

      <button
        type="button"
        onClick={() =>
          inspectorOpen ? (setInspectorOpen(false), setAdvancedToolsOpen(false)) : openInspector()
        }
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
            bottom: 'calc(env(safe-area-inset-bottom) + 110px)',
            width: 'min(420px, calc(100vw - 32px))',
            maxHeight: 'min(70vh, 600px)',
            zIndex: 90,
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
            <strong style={{ fontSize: 14 }}>프롬프트 편집</strong>
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
              onRequestAdvancedTools={() => setAdvancedToolsOpen(true)}
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

      {/* Floating prompt add button (bottom-left) */}
  <AddPromptFab onAdd={(t,templ) => addPromptNode(t, templ)} />

      {/* Fullscreen overlay Code Editor (kept mounted; visibility toggled to avoid remount jitter) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-hidden={showMultiLanguageEditor ? 'false' : 'true'}
        onClick={showMultiLanguageEditor ? () => setShowMultiLanguageEditor(false) : undefined}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(2,6,23,0.65)',
          zIndex: 1600,
          display: showMultiLanguageEditor ? 'flex' : 'none',
          alignItems: 'stretch',
          justifyContent: 'stretch',
          padding: 0,
        }}
      >
        {/* 메인게임 UI 플레이 오버레이 */}
        {showPlayOverlay && (
          <div style={{ position: 'fixed', inset: 0, background: '#0b1220', zIndex: 1700 }}>
            <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 10px)', right: 'calc(env(safe-area-inset-right) + 10px)', zIndex: 1200, display: 'flex', gap: 8 }}>
              <button onClick={() => setShowPlayOverlay(false)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: 'rgba(239, 68, 68, 0.95)', color: '#fff', fontWeight: 700 }}>닫기</button>
            </div>
            <div style={{ position: 'absolute', left:0, top:0, right:0, bottom:0, paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }}>
              {(() => {
                try {
                  const obj = JSON.parse(templateText || '{}');
                  return <MainGameMobileUI template={obj} />;
                } catch {
                  return <MainGameMobileUI template={{}} />;
                }
              })()}
            </div>
          </div>
        )}
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', inset: 0 }}>
          <CodeEditorOverlayV2
            templateBinding={{ text: templateText, setText: setTemplateText }}
            onRequestClose={() => setShowMultiLanguageEditor(false)}
          />
        </div>
      </div>

      {/* 하단 우측 변수 오버레이 버튼은 중복이므로 제거 (패널/헤더에서 접근) */}
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
            저장 중입니다… 잠시만 기다려 주세요.
          </div>
        </div>
      )}

      {/* 🚀 (disabled) 과거 인라인 코드 에디터 섹션 - 오버레이로 대체됨 */}
      {false && showMultiLanguageEditor && (
        <section
          style={{
            marginTop: 8,
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#0b1220',
            minHeight: 400,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(2,6,23,0.6)', color: '#e2e8f0' }}>
            <strong style={{ fontSize: 13 }}>코드 에디터</strong>
            <button
              onClick={() => setShowMultiLanguageEditor(false)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(239, 68, 68, 0.9)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
              }}
            >닫기</button>
          </div>
          <div style={{ height: 520, display: 'flex', position: 'relative' }}>
            <div style={{ width: gameSimulatorOpen ? `${splitPct}%` : '100%', minWidth: 0 }}>
              <StudioJsonEditor value={templateText} onChange={setTemplateText} />
              <div style={{ display: 'flex', gap: 6, padding: '6px 10px', background: 'rgba(2,6,23,0.5)', alignItems: 'center' }}>
                <button onClick={() => setSplitPct(50)} style={snapBtn}>50/50</button>
                <button onClick={() => setSplitPct(70)} style={snapBtn}>70/30</button>
                <button onClick={() => setSplitPct(30)} style={snapBtn}>30/70</button>
                <span style={{ marginLeft: 8, fontSize: 12, color: '#cbd5e1' }}>비율</span>
                <input
                  type="number"
                  min={20}
                  max={80}
                  value={splitPct}
                  onChange={e => {
                    const v = parseInt(e.target.value || '50', 10);
                    if (!Number.isNaN(v)) setSplitPct(Math.min(80, Math.max(20, v)));
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  style={{ width: 64, padding: '4px 6px', borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0', fontSize: 12 }}
                />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>% / 나머지</span>
                <button onClick={handleCreateWithAI} style={{ ...snapBtn, marginLeft: 'auto' }}>AI</button>
              </div>
            </div>
            {gameSimulatorOpen && (
              <>
                <div
                  onMouseDown={() => setIsDraggingSplit(true)}
                  onTouchStart={() => setIsDraggingSplit(true)}
                  onDoubleClick={() => setSplitPct(50)}
                  style={{ width: 6, cursor: 'col-resize', background: 'rgba(148,163,184,0.45)' }}
                  title="더블클릭: 50/50"
                />
                <div style={{ flex: 1, minWidth: 0, background: '#0a0f1a' }}>
                  <GameSimulator
                    visible={true}
                    gameData={{
                      meta: { version: 2, createdAt: new Date().toISOString() },
                      set: { name: setInfo?.name || '시뮬레이션' },
                      slots: nodes.map((node, index) => ({
                        slot_no: parseInt(node.id) || index,
                        slot_type: node.type || 'ai',
                        template: node.data?.label || '',
                        is_start: node.data?.isStart || index === 0,
                        canvas_x: node.position?.x || 0,
                        canvas_y: node.position?.y || 0,
                      })),
                      bridges: edges.map(edge => ({ from_slot_id: edge.source, to_slot_id: edge.target })),
                    }}
                    onClose={() => setGameSimulatorOpen(false)}
                    onSimulationResult={handleSimulationResult}
                  />
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* 🎮 게임 시뮬레이터 */}
      <GameSimulator
        visible={gameSimulatorOpen}
        gameData={{
          meta: {
            version: 2,
            createdAt: new Date().toISOString(),
          },
          set: {
            name: setInfo?.name || '시뮬레이션 게임',
          },
          slots: nodes.map((node, index) => ({
            slot_no: parseInt(node.id) || index,
            slot_type: node.type || 'ai',
            template: node.data?.label || '',
            is_start: node.data?.isStart || index === 0,
            canvas_x: node.position?.x || 0,
            canvas_y: node.position?.y || 0,
          })),
          bridges: edges.map(edge => ({
            from_slot_id: edge.source,
            to_slot_id: edge.target,
          })),
        }}
        onClose={() => setGameSimulatorOpen(false)}
        onSimulationResult={handleSimulationResult}
      />

      

      {/* Tools modals (compact) */}
      {showTemplateLibrary && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 260 }} onClick={() => setShowTemplateLibrary(false)}>
          <div style={{ position: 'absolute', inset: '5% 8% auto 8%', background: '#0b1220', border: '1px solid rgba(148,163,184,.35)', borderRadius: 12, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <GameTemplateLibrary onSelectTemplate={(tpl) => { try { setTemplateText(JSON.stringify(tpl, null, 2)); } catch {}; setShowTemplateLibrary(false); }} onClose={() => setShowTemplateLibrary(false)} />
          </div>
        </div>
      )}
      {showImageToUI && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 260 }} onClick={() => setShowImageToUI(false)}>
          <div style={{ position: 'absolute', inset: '8% 10% auto 10%', background: '#0b1220', border: '1px solid rgba(148,163,184,.35)', borderRadius: 12, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <ImageToUIGenerator onClose={() => setShowImageToUI(false)} onGenerateUI={() => setShowImageToUI(false)} />
          </div>
        </div>
      )}
      {showUiSettings && (
        <UiSettingsPanelMaker
          onClose={() => setShowUiSettings(false)}
          templateText={templateText}
          setTemplateText={setTemplateText}
        />
      )}
      {showGameShellConfig && (
        <GameShellEditor
          visible={showGameShellConfig}
          onClose={() => setShowGameShellConfig(false)}
          templateText={templateText}
          setTemplateText={setTemplateText}
        />
      )}
      {showResourceEditor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 260 }} onClick={() => setShowResourceEditor(false)}>
          <div style={{ position: 'absolute', inset: '8% 10% auto 10%', background: '#0b1220', border: '1px solid rgba(148,163,184,.35)', borderRadius: 12, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <GameResourceEditor onClose={() => setShowResourceEditor(false)} gameData={{}} onGameUpdate={() => {}} />
          </div>
        </div>
      )}
      {showRolesConfig && (
        <RolesRankEditor visible={showRolesConfig} onClose={() => setShowRolesConfig(false)} />
      )}
      
    </div>
  );
}

function UiSettingsPanelMaker({ onClose, templateText, setTemplateText }) {
  const [aiImageAssist, setAiImageAssist] = useState(false);
  const justOpenedRef = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => { justOpenedRef.current = false; }, 80);
    return () => clearTimeout(t);
  }, []);
  const getTpl = () => { try { return JSON.parse(templateText || '{}'); } catch { return {}; } };
  const saveTpl = (obj) => { try { setTemplateText && setTemplateText(JSON.stringify(obj, null, 2)); } catch {} };
  useEffect(() => {
    try {
      const obj = getTpl();
      const flag = !!(obj?.ai?.imageToUi?.enabled);
      setAiImageAssist(flag);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateText]);
  const onApplyPreset = () => {
    try {
      const next = applyMainUiPresetObject(getTpl());
      saveTpl(next);
      alert('메인 UI 프리셋을 적용했습니다.');
    } catch (e) { alert('적용 실패: ' + String(e?.message||e)); }
  };
  const onToggleAiAssist = (checked) => {
    try {
      setAiImageAssist(!!checked);
      const obj = getTpl();
      const base = { ...obj, ai: { ...(obj.ai||{}), imageToUi: { ...(obj.ai?.imageToUi||{}), enabled: !!checked } } };
      const ensured = Array.isArray(base?.ui?.main?.modules) && base.ui.main.modules.length > 0
        ? base
        : { ...base, ui: { ...(base.ui||{}), main: { ...(base.ui?.main||{}), modules: getMainUiModules() } } };
      saveTpl(ensured);
    } catch {}
  };
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1600, background:'rgba(2,6,23,0.65)' }}>
      <div onClick={() => { if (justOpenedRef.current) return; onClose(); }} style={{ position:'absolute', inset:0 }} />
      <div role="dialog" aria-modal="true" onClick={(e)=>e.stopPropagation()} style={{ position:'absolute', left:'env(safe-area-inset-left)', right:'env(safe-area-inset-right)', bottom:'env(safe-area-inset-bottom)', top:'min(8%, 64px)', margin:'auto', maxWidth:600, background:'#0b1220', border:'1px solid rgba(148,163,184,0.35)', borderRadius:12, boxShadow:'0 24px 64px rgba(0,0,0,0.6)', display:'grid', gridTemplateRows:'auto 1fr auto' }}>
        <div style={{ padding:'10px 12px', borderBottom:'1px solid #25314a', color:'#e2e8f0', fontWeight:700 }}>UI 설정</div>
        <div style={{ padding:12, display:'grid', gap:12, overflow:'auto' }}>
          <div style={{ display:'grid', gap:8 }}>
            <div style={{ fontSize:13, color:'#cbd5e1' }}>빠른 작업</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              <button onClick={onApplyPreset} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff', fontWeight:600 }}>메인 프리셋 적용</button>
            </div>
          </div>
          <div style={{ height:1, background:'rgba(148,163,184,0.2)' }} />
          <div style={{ display:'grid', gap:8 }}>
            <div style={{ fontSize:13, color:'#cbd5e1' }}>AI 이미지 기반 UI 만들기</div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#e2e8f0' }}>
              <input type="checkbox" checked={aiImageAssist} onChange={e=>onToggleAiAssist(e.target.checked)} />
              AI 코드 채팅에서 첨부한 이미지를 참고해 UI를 구성하도록 허용
            </label>
            <div style={{ fontSize:11, color:'#94a3b8' }}>
              이미지를 URL로 직접 입력할 필요가 없습니다. 코드 에디터의 AI 채팅 패널에서 이미지를 첨부하세요.
            </div>
          </div>
        </div>
        <div style={{ padding:12, borderTop:'1px solid #25314a', display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>닫기</button>
        </div>
      </div>
    </div>
  );
}
