'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useMakerEditor } from '../../../hooks/maker/useMakerEditor';
import { exportSet, importSet } from './importExport';
import MakerEditorCanvas from './MakerEditorCanvas';
import MakerEditorHeader from './MakerEditorHeader';
import MakerEditorPanel from './MakerEditorPanel';
import VariableDrawer from './VariableDrawer';
import AdvancedToolsPanel from './AdvancedToolsPanel';
import CodeEditor from './CodeEditor';
import MultiLanguageCodeEditor from './MultiLanguageCodeEditor';
import GameSimulator from './GameSimulator';

export default function MakerEditor() {
  const { status, graph, selection, variables, persistence, history, version } = useMakerEditor();

  const { isReady, loading, setInfo } = status;

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

  const {
    entries: saveHistory,
    storageKey: historyStorageKey,
    exportEntries: exportHistory,
    clearEntries: clearHistory,
    receipt: saveReceipt,
    ackReceipt,
  } = history;

  const { alert: versionAlert, clearAlert: clearVersionAlert } = version;
  const [variableDrawerOpen, setVariableDrawerOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(null);

  // 🤖 AI로 게임 만들기 핸들러
  const [isAICreating, setIsAICreating] = useState(false);

  // ⚡ JavaScript 코드 에디터
  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showMultiLanguageEditor, setShowMultiLanguageEditor] = useState(false);
  const [gameCode, setGameCode] = useState('');
  const [showGameSimulator, setShowGameSimulator] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);

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

  // 🎮 게임 시뮬레이션 상태
  const [gameSimulatorOpen, setGameSimulatorOpen] = useState(false);

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
      { label: busy ? '저장 중…' : '저장', onClick: saveAll, disabled: busy },
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
  }, [busy, saveAll]);

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
      style={{ height: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 900,
          width: '100%',
          margin: '0 auto',
          padding: '12px 16px 110px',
          boxSizing: 'border-box',
          gap: 10,
        }}
      >
        <MakerEditorHeader
          setName={setInfo?.name}
          busy={busy}
          onBack={goToSetList}
          onAddPrompt={() => addPromptNode('ai')}
          onAddUserAction={() => addPromptNode('user_action')}
          onAddSystem={() => addPromptNode('system')}
          onSave={saveAll}
          onExport={exportSet}
          onImport={importSet}
          onGoLobby={goToLobby}
          collapsed={headerCollapsed}
          onToggleCollapse={() => setHeaderCollapsed(prev => !prev)}
          onOpenVariables={() => setVariableDrawerOpen(true)}
          onCreateWithAI={handleCreateWithAI}
          onOpenCodeEditor={openCodeEditor}
          onOpenMultiLanguageEditor={() => setShowMultiLanguageEditor(true)}
          onStartSimulation={startGameSimulation}
          quickActions={collapsedQuickActions}
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
          bottom: 28,
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
            bottom: 110,
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

      <button
        type="button"
        onClick={() => setVariableDrawerOpen(true)}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 28,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#2563eb',
          color: '#fff',
          fontWeight: 700,
          border: 'none',
          boxShadow: '0 18px 45px -20px rgba(37, 99, 235, 0.65)',
          zIndex: 55,
        }}
        aria-label="변수 설정 열기"
      >
        변수
      </button>
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
            bottom: 24,
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

      <CodeEditor
        visible={codeEditorOpen}
        onCodeRun={handleCodeRun}
        initialCode={gameCode}
        gameContext={{
          nodes: nodes,
          edges: edges,
          selectedNode: selectedNode,
        }}
      />

      {/* 🚀 다중 언어 개발 환경 */}
      <MultiLanguageCodeEditor
        visible={showMultiLanguageEditor}
        initialCode={''}
        gameContext={{
          nodes: nodes,
          edges: edges,
          gameInfo: setInfo,
        }}
        onCodeRun={handleMultiLanguageCodeExecution}
      />

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

      {/* 코드 에디터 닫기 버튼 */}
      {codeEditorOpen && (
        <button
          onClick={() => setCodeEditorOpen(false)}
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            background: '#ef4444',
            color: '#fff',
            fontSize: 18,
            fontWeight: 600,
            cursor: 'pointer',
            zIndex: 250,
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
