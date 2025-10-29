import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { MobileOptimizationManager } from '../../services/MobileOptimizationManager';
import { GameResourceManager } from '../../services/GameResourceManager';
import { compatibilityManager } from '../../utils/compatibilityManager';

// 모듈 Import
import GameRenderer from './renderers/GameRenderer';
import UIRenderer from './renderers/UIRenderer';
import EffectsRenderer from './renderers/EffectsRenderer';
import InputManager from './input/InputManager';
import GameEngine from './logic/GameEngine';
import PhysicsEngine from './logic/PhysicsEngine';
import EntityManager from './logic/EntityManager';
import ScoreManager from './logic/ScoreManager';

/**
 * 🎮 통합 게임 제작 및 실행 시스템 (모듈화된 오케스트레이션 버전)
 *
 * 역할: 각 모듈들을 조율하는 가볍고 명확한 오케스트레이터
 *
 * 기능:
 * 1. 프롬프트 제작기 (노드/템플릿/변수 시스템)
 * 2. 실시간 게임 실행 엔진
 * 3. 캐릭터 변수 시스템 통합
 * 4. 모바일 최적화된 UI/UX
 * 5. IE 11+ 브라우저 호환성
 * 6. 저사양 디바이스 성능 최적화
 *
 * 모듈 구조:
 * - 렌더링: GameRenderer, UIRenderer, EffectsRenderer
 * - 입력: InputManager
 * - 로직: GameEngine, PhysicsEngine, EntityManager, ScoreManager
 *
 * 호환성:
 * - IE 11+, Safari 12+, Chrome 70+, Firefox 65+
 * - iOS 12+, Android 7.0+
 * - 터치 디바이스 및 키보드 네비게이션 지원
 *
 * @param {Object} initialCharacter - 초기 캐릭터 데이터
 * @param {string} gameTemplateId - 게임 템플릿 ID
 * @param {Function} onGameEnd - 게임 종료 콜백
 */
export default function UnifiedGameSystem({
  initialCharacter = null,
  gameTemplateId = null,
  onGameEnd = null,
}) {
  // 호환성 상태 추가
  const [compatibilityInfo, setCompatibilityInfo] = useState(null);
  const [isCompatibilityReady, setIsCompatibilityReady] = useState(false);

  // 모듈 참조
  const gameRendererRef = useRef(null);
  const uiRendererRef = useRef(null);
  const effectsRendererRef = useRef(null);
  const inputManagerRef = useRef(null);
  const gameEngineRef = useRef(null);
  const physicsEngineRef = useRef(null);
  const entityManagerRef = useRef(null);
  const scoreManagerRef = useRef(null);

  // 시스템 상태
  const [systemMode, setSystemMode] = useState('maker'); // maker, game, result
  const [gameData, setGameData] = useState({
    nodes: [],
    variables: {},
    characterData: initialCharacter,
    currentNode: null,
    gameHistory: [],
    gameState: {},
  });

  // Maker 상태 (프롬프트 제작기)
  const [makerState, setMakerState] = useState({
    selectedNode: null,
    editingTemplate: '',
    availableTokens: [],
    variableRules: {},
  });

  // Game 상태 (실행 엔진)
  const [gameExecutionState, setGameExecutionState] = useState({
    isProcessing: false,
    currentTurn: 1,
    activeVariables: {},
    lastResponse: null,
    gamePhase: 'preparation', // preparation, playing, ended
  });

  const mobileManager = useRef(null);
  const gameResourceManager = useRef(null);
  const fetchFunction = useRef(null); // 호환성 있는 fetch 함수
  const resourceManager = useRef(new GameResourceManager());
  const gameContainerRef = useRef(null);
  const animationFrameRef = useRef(null);

  // 이벤트 버스 (모듈 간 통신)
  const eventBus = useRef({
    listeners: {},
    on: (event, callback) => {
      if (!eventBus.current.listeners[event]) {
        eventBus.current.listeners[event] = [];
      }
      eventBus.current.listeners[event].push(callback);
    },
    off: (event, callback) => {
      if (!eventBus.current.listeners[event]) return;
      eventBus.current.listeners[event] = eventBus.current.listeners[event].filter(
        cb => cb !== callback
      );
    },
    emit: (event, data) => {
      if (!eventBus.current.listeners[event]) return;
      eventBus.current.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] 이벤트 처리 오류 (${event}):`, error);
        }
      });
    },
  });

  // 모듈 초기화 함수
  const initializeModules = useCallback(async () => {
    try {
      console.log('[UnifiedGameSystem] 모듈 초기화 시작');

      // GameEngine 초기화
      gameEngineRef.current = new GameEngine({ tickRate: 60 });
      await gameEngineRef.current.initialize();

      // EntityManager 초기화
      entityManagerRef.current = new EntityManager({ maxEntities: 1000 });
      await entityManagerRef.current.initialize();

      // PhysicsEngine 초기화
      physicsEngineRef.current = new PhysicsEngine({
        gravity: 9.8,
        enableCollisions: true,
      });
      await physicsEngineRef.current.initialize();

      // ScoreManager 초기화
      scoreManagerRef.current = new ScoreManager({
        enableAchievements: true,
        enableStats: true,
      });
      await scoreManagerRef.current.initialize();

      // InputManager 초기화 (게임 컨테이너가 있을 때)
      if (gameContainerRef.current) {
        inputManagerRef.current = new InputManager({
          enableKeyboard: true,
          enableMouse: true,
          enableTouch: compatibilityInfo?.features.touchDevice || false,
        });
        await inputManagerRef.current.initialize(gameContainerRef.current);
      }

      // 렌더러는 나중에 게임 모드에서 초기화

      console.log('[UnifiedGameSystem] 모듈 초기화 완료');
      return true;
    } catch (error) {
      console.error('[UnifiedGameSystem] 모듈 초기화 실패:', error);
      return false;
    }
  }, [compatibilityInfo]);

  // 모듈 정리 함수
  const cleanupModules = useCallback(() => {
    console.log('[UnifiedGameSystem] 모듈 정리 시작');

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (gameRendererRef.current) {
      gameRendererRef.current.cleanup();
      gameRendererRef.current = null;
    }

    if (uiRendererRef.current) {
      uiRendererRef.current.cleanup();
      uiRendererRef.current = null;
    }

    if (effectsRendererRef.current) {
      effectsRendererRef.current.cleanup();
      effectsRendererRef.current = null;
    }

    if (inputManagerRef.current) {
      inputManagerRef.current.cleanup();
      inputManagerRef.current = null;
    }

    if (gameEngineRef.current) {
      gameEngineRef.current.cleanup();
      gameEngineRef.current = null;
    }

    if (physicsEngineRef.current) {
      physicsEngineRef.current.cleanup();
      physicsEngineRef.current = null;
    }

    if (entityManagerRef.current) {
      entityManagerRef.current.cleanup();
      entityManagerRef.current = null;
    }

    if (scoreManagerRef.current) {
      scoreManagerRef.current.cleanup();
      scoreManagerRef.current = null;
    }

    console.log('[UnifiedGameSystem] 모듈 정리 완료');
  }, []);

  // 호환성 초기화
  useEffect(() => {
    const initializeCompatibility = async () => {
      try {
        // 호환성 매니저 초기화
        await CompatibilityManager.initialize();

        const info = CompatibilityManager.getCompatibilityInfo();
        setCompatibilityInfo(info);

        // 모바일 매니저 초기화 (호환성 정보 기반)
        mobileManager.current = new MobileOptimizationManager();

        // 리소스 매니저 초기화 (성능 기반)
        gameResourceManager.current = new GameResourceManager({
          performanceTier: info.performanceTier,
          enablePreloading: info.level >= 3,
          maxConcurrentRequests:
            info.performanceTier === 'high' ? 6 : info.performanceTier === 'medium' ? 3 : 1,
        });

        // 호환성 있는 fetch 함수 설정
        fetchFunction.current = info.features.fetch
          ? fetch.bind(window)
          : CompatibilityManager.getFetchPolyfill();

        setIsCompatibilityReady(true);
      } catch (error) {
        console.error('[UnifiedGameSystem] 호환성 초기화 실패:', error);
        // 호환성 초기화 실패 시에도 기본 기능은 동작하도록
        setIsCompatibilityReady(true);
      }
    };

    initializeCompatibility();

    return () => {
      mobileManager.current?.cleanup();
      gameResourceManager.current?.cleanup();
      cleanupModules();
    };
  }, []);

  useEffect(() => {
    if (!isCompatibilityReady) return;

    let mounted = true;

    const initializeSystem = async () => {
      try {
        // 모바일 최적화 초기화 (호환성 정보 기반)
        if (mobileManager.current && compatibilityInfo) {
          await mobileManager.current.initialize({
            element: null, // 나중에 ref로 연결
            enableTouchOptimization:
              compatibilityInfo.features.touchDevice || compatibilityInfo.device.mobile,
            enableKeyboardNavigation: true,
            enableResponsiveLayout: true,
            compatibilityLevel: compatibilityInfo.level,
          });
        }

        if (!mounted) return;

        // 모듈 초기화
        await initializeModules();

        // 캐릭터 데이터가 있으면 변수로 등록
        if (initialCharacter) {
          registerCharacterVariables(initialCharacter);
        }

        // 게임 템플릿 로드
        if (gameTemplateId) {
          await loadGameTemplate(gameTemplateId);
        }
      } catch (error) {
        console.error('시스템 초기화 실패:', error);
      }
    };

    initializeSystem();

    return () => {
      mounted = false;
    };
  }, [initialCharacter, gameTemplateId, isCompatibilityReady, compatibilityInfo]);

  // 캐릭터 변수 등록 (테스트에서 검증된 로직 적용)
  const registerCharacterVariables = useCallback(character => {
    const characterVars = {
      '{{캐릭터.이름}}': character.name != null ? String(character.name) : '익명',
      '{{캐릭터.설명}}': character.description != null ? String(character.description) : '',
      '{{캐릭터.능력1}}': character.ability1 != null ? String(character.ability1) : '',
      '{{캐릭터.능력2}}': character.ability2 != null ? String(character.ability2) : '',
      '{{캐릭터.능력3}}': character.ability3 != null ? String(character.ability3) : '',
      '{{캐릭터.능력4}}': character.ability4 != null ? String(character.ability4) : '',
      '{{캐릭터.이미지}}': character.image_url != null ? String(character.image_url) : '',
      '{{캐릭터.배경}}': character.background_url != null ? String(character.background_url) : '',
      '{{캐릭터.BGM}}': character.bgm_url != null ? String(character.bgm_url) : '',
      '{{캐릭터.HP}}': 100,
      '{{캐릭터.MP}}': 50,
      '{{캐릭터.레벨}}': 1,
    };

    setGameData(prev => ({
      ...prev,
      variables: { ...prev.variables, ...characterVars },
      characterData: character,
    }));

    setMakerState(prev => ({
      ...prev,
      availableTokens: [...prev.availableTokens, ...Object.keys(characterVars)],
    }));
  }, []);

  // 게임 템플릿 로드
  const loadGameTemplate = useCallback(async templateId => {
    try {
      const template = await resourceManager.current.loadGameTemplate(templateId);

      setGameData(prev => ({
        ...prev,
        nodes: template.nodes || [],
        variables: { ...prev.variables, ...template.variables },
      }));
    } catch (error) {
      console.error('게임 템플릿 로드 실패:', error);
    }
  }, []);

  // 프롬프트 템플릿 컴파일
  const compileTemplate = useCallback((template, variables = {}) => {
    let compiled = template;

    // 변수 치환
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g');
      compiled = compiled.replace(regex, String(value));
    });

    // 조건부 블록 처리 {{#if 조건}} ... {{/if}}
    compiled = compiled.replace(
      /\{\{#if\s+(.+?)\}\}(.*?)\{\{\/if\}\}/gs,
      (match, condition, content) => {
        const conditionValue = variables[`{{${condition}}}`];
        return conditionValue ? content : '';
      }
    );

    // 반복 블록 처리 {{#each 배열}} ... {{/each}}
    compiled = compiled.replace(
      /\{\{#each\s+(.+?)\}\}(.*?)\{\{\/each\}\}/gs,
      (match, arrayName, content) => {
        const arrayValue = variables[`{{${arrayName}}}`];
        if (Array.isArray(arrayValue)) {
          return arrayValue.map(item => content.replace(/\{\{this\}\}/g, item)).join('\n');
        }
        return '';
      }
    );

    return compiled;
  }, []);

  // 노드 추가 (Maker 기능)
  const addNode = useCallback(
    (type = 'ai', template = '') => {
      const newNode = {
        id: `node_${Date.now()}`,
        type: type, // ai, user_action, system, condition
        template: template,
        position: { x: Math.random() * 300, y: Math.random() * 200 },
        connections: [],
        variables: {},
        isStart: gameData.nodes.length === 0,
      };

      setGameData(prev => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
      }));

      return newNode.id;
    },
    [gameData.nodes.length]
  );

  // 노드 편집 (Maker 기능)
  const updateNode = useCallback((nodeId, updates) => {
    setGameData(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => (node.id === nodeId ? { ...node, ...updates } : node)),
    }));
  }, []);

  // 변수 추가 (Maker 기능)
  const addVariable = useCallback((name, value, type = 'string') => {
    const varKey = `{{${name}}}`;

    setGameData(prev => ({
      ...prev,
      variables: {
        ...prev.variables,
        [varKey]: value,
      },
    }));

    setMakerState(prev => ({
      ...prev,
      availableTokens: [...prev.availableTokens.filter(t => t !== varKey), varKey],
    }));
  }, []);

  // 게임 루프 업데이트 (오케스트레이션)
  const updateGameLoop = useCallback(() => {
    if (!gameEngineRef.current?.isGameRunning()) {
      return;
    }

    try {
      // GameEngine 업데이트
      const deltaTime = gameEngineRef.current.update();

      // EntityManager 업데이트
      if (entityManagerRef.current) {
        const entities = entityManagerRef.current.getAllEntities();
        entityManagerRef.current.updateAll(deltaTime);

        // PhysicsEngine 업데이트
        if (physicsEngineRef.current) {
          physicsEngineRef.current.update(deltaTime, entities);
        }
      }

      // 렌더링 업데이트
      if (gameRendererRef.current) {
        gameRendererRef.current.render(gameData);
      }

      if (uiRendererRef.current) {
        uiRendererRef.current.render(gameData, gameExecutionState);
      }

      if (effectsRendererRef.current) {
        effectsRendererRef.current.render(deltaTime);
      }

      // 다음 프레임 예약
      animationFrameRef.current = requestAnimationFrame(updateGameLoop);
    } catch (error) {
      console.error('[UnifiedGameSystem] 게임 루프 오류:', error);
    }
  }, [gameData, gameExecutionState]);

  // 게임 실행 시작
  const startGameExecution = useCallback(() => {
    if (gameData.nodes.length === 0) {
      alert('실행할 노드가 없습니다. 먼저 게임을 제작하세요.');
      return;
    }

    const startNode = gameData.nodes.find(node => node.isStart) || gameData.nodes[0];

    setSystemMode('game');
    setGameExecutionState(prev => ({
      ...prev,
      gamePhase: 'playing',
      activeVariables: { ...gameData.variables },
    }));

    // GameEngine 시작
    if (gameEngineRef.current) {
      gameEngineRef.current.start();
      // 게임 루프 시작
      animationFrameRef.current = requestAnimationFrame(updateGameLoop);
    }

    executeNode(startNode.id);
  }, [gameData, updateGameLoop]);

  // 노드 실행
  const executeNode = useCallback(
    async nodeId => {
      const node = gameData.nodes.find(n => n.id === nodeId);
      if (!node) return;

      setGameExecutionState(prev => ({ ...prev, isProcessing: true }));

      // 이벤트 발송: 노드 실행 시작
      eventBus.current.emit('node:start', { nodeId, node });

      try {
        // 템플릿 컴파일
        const compiledPrompt = compileTemplate(node.template, gameExecutionState.activeVariables);

        // AI 응답 생성 (노드 타입에 따라)
        let response = '';

        if (node.type === 'ai') {
          response = await generateAIResponse(compiledPrompt, gameExecutionState);
        } else if (node.type === 'system') {
          response = compiledPrompt;
        } else if (node.type === 'user_action') {
          response = compiledPrompt;
          // 사용자 입력 대기 상태로 설정
          setGameExecutionState(prev => ({
            ...prev,
            isProcessing: false,
            awaitingUserInput: true,
          }));
          eventBus.current.emit('input:required', { nodeId, prompt: compiledPrompt });
          return;
        }

        // 게임 히스토리 업데이트
        const historyEntry = {
          turn: gameExecutionState.currentTurn,
          nodeId: nodeId,
          nodeType: node.type,
          prompt: compiledPrompt,
          response: response,
          timestamp: new Date().toISOString(),
        };

        setGameData(prev => ({
          ...prev,
          gameHistory: [...prev.gameHistory, historyEntry],
          currentNode: nodeId,
        }));

        setGameExecutionState(prev => ({
          ...prev,
          currentTurn: prev.currentTurn + 1,
          lastResponse: response,
          isProcessing: false,
          awaitingUserInput: false,
        }));

        // GameEngine 턴 진행
        if (gameEngineRef.current) {
          gameEngineRef.current.nextTurn();
        }

        // ScoreManager 통계 기록
        if (scoreManagerRef.current) {
          scoreManagerRef.current.recordStat('totalTurns', 1);
          scoreManagerRef.current.recordStat('totalResponses', 1);
        }

        // 이벤트 발송: 노드 실행 완료
        eventBus.current.emit('node:complete', { nodeId, response, historyEntry });

        // 다음 노드 찾기 및 실행
        const nextNode = findNextNode(node, response);
        if (nextNode) {
          setTimeout(() => executeNode(nextNode.id), 1000);
        } else {
          // 게임 종료
          eventBus.current.emit('game:end', {
            gameData,
            score: scoreManagerRef.current?.getScore(),
          });
          if (onGameEnd) {
            onGameEnd({ gameData, score: scoreManagerRef.current?.getScore() });
          }
        }
      } catch (error) {
        console.error('노드 실행 오류:', error);
        setGameExecutionState(prev => ({
          ...prev,
          isProcessing: false,
          awaitingUserInput: false,
        }));
        eventBus.current.emit('node:error', { nodeId, error });
      }
    },
    [gameData, gameExecutionState, compileTemplate, onGameEnd]
  );

  // AI 응답 생성 (에러 핸들링 강화)
  const generateAIResponse = useCallback(
    async (prompt, gameState) => {
      const maxRetries = 3;
      let attempt = 0;

      while (attempt < maxRetries) {
        try {
          // IE11 호환성: AbortController가 없을 수 있음
          let controller = null;
          let timeoutId = null;

          if (
            typeof AbortController !== 'undefined' &&
            compatibilityInfo?.features.abortController
          ) {
            controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃
          } else {
            // IE11에서는 기본 타임아웃만 사용
            timeoutId = setTimeout(() => {
              console.warn('[UnifiedGameSystem] 요청 타임아웃 (IE11 호환 모드)');
            }, 30000);
          }

          // 호환성 있는 fetch 사용
          const fetchFn = fetchFunction.current || fetch;
          const response = await fetchFn('/api/ai-battle-judge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: prompt,
              gameState: gameState,
              character: gameData.characterData,
            }),
            ...(controller && { signal: controller.signal }), // IE11에서는 AbortController 없을 수 있음
          });

          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();
          return result.narrative || result.response || '응답을 생성할 수 없습니다.';
        } catch (error) {
          attempt++;
          console.warn(`AI 응답 생성 시도 ${attempt}/${maxRetries} 실패:`, error.message);

          if (attempt >= maxRetries) {
            // 폴백 응답 생성
            const fallbackResponses = [
              `${gameData.characterData?.name || '플레이어'}이(가) 신중하게 상황을 살펴봅니다.`,
              '예상치 못한 상황이 발생했지만, 모험은 계속됩니다.',
              '잠시 시간이 흘러가며 새로운 기회가 나타납니다.',
            ];
            return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
          }

          // 재시도 전 잠시 대기
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    },
    [gameData.characterData]
  );

  // 다음 노드 찾기
  const findNextNode = useCallback(
    (currentNode, response) => {
      // 연결된 노드들 중 조건에 맞는 것 찾기
      const connections = currentNode.connections || [];

      for (const connection of connections) {
        const targetNode = gameData.nodes.find(n => n.id === connection.targetId);

        // 조건 확인
        if (connection.condition && !evaluateCondition(connection.condition, response)) {
          continue;
        }

        return targetNode;
      }

      // 기본적으로 다음 노드 반환
      const currentIndex = gameData.nodes.findIndex(n => n.id === currentNode.id);
      return gameData.nodes[currentIndex + 1] || null;
    },
    [gameData.nodes]
  );

  // 조건 평가
  const evaluateCondition = useCallback((condition, response) => {
    // 간단한 키워드 매칭
    if (condition.type === 'keyword') {
      return condition.keywords.some(keyword =>
        response.toLowerCase().includes(keyword.toLowerCase())
      );
    }
    return true;
  }, []);

  // 사용자 액션 처리
  const handleUserAction = useCallback(
    action => {
      if (!gameExecutionState.awaitingUserInput) return;

      // 이벤트 발송: 사용자 액션
      eventBus.current.emit('input:action', { action });

      // 액션을 변수로 저장
      const actionVar = '{{사용자.액션}}';
      setGameExecutionState(prev => ({
        ...prev,
        activeVariables: {
          ...prev.activeVariables,
          [actionVar]: action,
        },
        awaitingUserInput: false,
      }));

      // ScoreManager 통계 기록
      if (scoreManagerRef.current) {
        scoreManagerRef.current.recordStat('playerActions', 1);
        scoreManagerRef.current.addScore(10); // 액션당 10점
      }

      // 현재 노드의 다음 노드 실행
      const currentNode = gameData.nodes.find(n => n.id === gameData.currentNode);
      if (currentNode) {
        const nextNode = findNextNode(currentNode, action);
        if (nextNode) {
          executeNode(nextNode.id);
        }
      }
    },
    [gameExecutionState, gameData, findNextNode, executeNode]
  );

  const styles = {
    container: {
      width: '100%',
      height: '100vh',
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    header: {
      padding: '16px 20px',
      background: 'rgba(0,0,0,0.3)',
      borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      color: 'white',
      fontSize: '18px',
      fontWeight: 'bold',
    },
    modeToggle: {
      display: 'flex',
      background: 'rgba(56, 189, 248, 0.1)',
      borderRadius: '8px',
      overflow: 'hidden',
    },
    modeButton: {
      padding: '8px 16px',
      border: 'none',
      background: 'transparent',
      color: 'rgba(255,255,255,0.7)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    modeButtonActive: {
      background: '#38bdf8',
      color: '#020617',
      fontWeight: 'bold',
    },
    content: {
      flex: 1,
      display: 'flex',
      overflow: 'hidden',
    },
    sidebar: {
      width: '300px',
      background: 'rgba(0,0,0,0.2)',
      borderRight: '1px solid rgba(148, 163, 184, 0.2)',
      display: 'flex',
      flexDirection: 'column',
    },
    mainArea: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    },
    nodeList: {
      padding: '16px',
      color: 'white',
    },
    nodeItem: {
      padding: '12px',
      background: 'rgba(56, 189, 248, 0.1)',
      borderRadius: '8px',
      marginBottom: '8px',
      cursor: 'pointer',
      border: '1px solid transparent',
    },
    nodeItemActive: {
      borderColor: '#38bdf8',
      background: 'rgba(56, 189, 248, 0.2)',
    },
    variableList: {
      padding: '16px',
      color: 'white',
      maxHeight: '200px',
      overflowY: 'auto',
    },
    variableItem: {
      padding: '8px 12px',
      background: 'rgba(34, 197, 94, 0.1)',
      borderRadius: '6px',
      marginBottom: '4px',
      fontSize: '12px',
      fontFamily: 'monospace',
      cursor: 'pointer',
    },
    gameArea: {
      flex: 1,
      padding: '20px',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
    },
    gameHistory: {
      flex: 1,
      overflowY: 'auto',
      marginBottom: '20px',
    },
    historyItem: {
      background: 'rgba(0,0,0,0.3)',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '12px',
    },
    actionArea: {
      padding: '16px',
      background: 'rgba(0,0,0,0.4)',
      borderRadius: '12px',
    },
    actionGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
    },
    actionButton: {
      padding: '16px',
      borderRadius: '8px',
      border: '1px solid rgba(56, 189, 248, 0.5)',
      background: 'rgba(56, 189, 248, 0.1)',
      color: 'white',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
  };

  // Maker 모드 렌더링
  const renderMakerMode = () => (
    <div style={styles.content}>
      <div style={styles.sidebar}>
        <div style={styles.nodeList}>
          <h3>노드 목록</h3>
          {gameData.nodes.map(node => (
            <div
              key={node.id}
              style={{
                ...styles.nodeItem,
                ...(makerState.selectedNode === node.id ? styles.nodeItemActive : {}),
              }}
              onClick={() => setMakerState(prev => ({ ...prev, selectedNode: node.id }))}
            >
              <div>{node.type.toUpperCase()}</div>
              <div style={{ fontSize: '12px', opacity: 0.7 }}>
                {node.template.substring(0, 50)}...
              </div>
            </div>
          ))}
          <button
            onClick={() => addNode('ai', '새로운 AI 응답 노드입니다.')}
            style={{
              ...styles.actionButton,
              width: '100%',
              marginTop: '12px',
            }}
          >
            + AI 노드 추가
          </button>
        </div>

        <div style={styles.variableList}>
          <h4>사용 가능한 변수</h4>
          {makerState.availableTokens.map(token => (
            <div
              key={token}
              style={styles.variableItem}
              onClick={() => {
                navigator.clipboard.writeText(token);
                alert('변수가 클립보드에 복사되었습니다!');
              }}
            >
              {token}
            </div>
          ))}
        </div>
      </div>

      <div style={styles.mainArea}>
        <div style={styles.gameArea}>
          {makerState.selectedNode ? (
            <NodeEditor
              node={gameData.nodes.find(n => n.id === makerState.selectedNode)}
              onUpdate={updates => updateNode(makerState.selectedNode, updates)}
              availableTokens={makerState.availableTokens}
            />
          ) : (
            <div style={{ textAlign: 'center', marginTop: '100px' }}>
              <h2>게임 제작기</h2>
              <p>왼쪽에서 노드를 선택하거나 새 노드를 추가하세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Game 모드 렌더링
  const renderGameMode = () => (
    <div style={styles.content}>
      <div style={styles.gameArea}>
        <div style={styles.gameHistory}>
          {gameData.gameHistory.map(entry => (
            <div key={`${entry.nodeId}-${entry.turn}`} style={styles.historyItem}>
              <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '8px' }}>
                턴 {entry.turn} - {entry.nodeType.toUpperCase()}
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>프롬프트:</strong> {entry.prompt}
              </div>
              <div>
                <strong>응답:</strong> {entry.response}
              </div>
            </div>
          ))}
        </div>

        {gameExecutionState.awaitingUserInput && (
          <div style={styles.actionArea}>
            <div style={{ marginBottom: '12px' }}>
              <strong>행동을 선택하세요:</strong>
            </div>
            <div style={styles.actionGrid}>
              <button style={styles.actionButton} onClick={() => handleUserAction('공격')}>
                ⚔️ 공격
              </button>
              <button style={styles.actionButton} onClick={() => handleUserAction('방어')}>
                🛡️ 방어
              </button>
              <button style={styles.actionButton} onClick={() => handleUserAction('탐색')}>
                🔍 탐색
              </button>
              <button style={styles.actionButton} onClick={() => handleUserAction('대화')}>
                💬 대화
              </button>
            </div>
          </div>
        )}

        {gameExecutionState.isProcessing && (
          <div
            style={{
              ...styles.actionArea,
              textAlign: 'center',
            }}
          >
            <div>AI가 응답을 생성중입니다...</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={styles.container} ref={gameContainerRef}>
      <header style={styles.header}>
        <h1 style={styles.title}>
          통합 게임 시스템 {initialCharacter?.name && `- ${initialCharacter.name}`}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {scoreManagerRef.current && systemMode === 'game' && (
            <div style={{ color: '#22c55e', fontSize: '16px', fontWeight: 'bold' }}>
              점수: {scoreManagerRef.current.getScore()}
            </div>
          )}
          <div style={styles.modeToggle}>
            <button
              style={{
                ...styles.modeButton,
                ...(systemMode === 'maker' ? styles.modeButtonActive : {}),
              }}
              onClick={() => setSystemMode('maker')}
            >
              제작기
            </button>
            <button
              style={{
                ...styles.modeButton,
                ...(systemMode === 'game' ? styles.modeButtonActive : {}),
              }}
              onClick={startGameExecution}
            >
              게임 실행
            </button>
          </div>
        </div>
      </header>

      {systemMode === 'maker' && renderMakerMode()}
      {systemMode === 'game' && renderGameMode()}
    </div>
  );
}

// 노드 에디터 컴포넌트
function NodeEditor({ node, onUpdate, availableTokens }) {
  const [template, setTemplate] = useState(node?.template || '');

  const insertToken = token => {
    setTemplate(prev => prev + token);
    onUpdate({ template: template + token });
  };

  const styles = {
    editor: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    label: {
      color: 'white',
      fontSize: '14px',
      fontWeight: 'bold',
      marginBottom: '8px',
    },
    textarea: {
      width: '100%',
      height: '200px',
      padding: '12px',
      borderRadius: '8px',
      border: '1px solid rgba(148, 163, 184, 0.3)',
      background: 'rgba(0,0,0,0.2)',
      color: 'white',
      fontSize: '14px',
      resize: 'vertical',
    },
    tokenGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
      gap: '8px',
    },
    tokenButton: {
      padding: '8px 12px',
      borderRadius: '6px',
      border: '1px solid rgba(34, 197, 94, 0.5)',
      background: 'rgba(34, 197, 94, 0.1)',
      color: '#22c55e',
      cursor: 'pointer',
      fontSize: '12px',
      textAlign: 'center',
    },
  };

  return (
    <div
      style={styles.editor}
      onKeyDown={e => {
        // 키보드 네비게이션 지원 (접근성)
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          // Ctrl+Enter로 토큰 삽입 모드 전환 등
        }
      }}
    >
      <div>
        <div style={styles.label}>노드 타입: {node?.type?.toUpperCase()}</div>
        <select
          value={node?.type || 'ai'}
          onChange={e => onUpdate({ type: e.target.value })}
          style={{
            ...styles.textarea,
            height: 'auto',
            padding: '8px 12px',
          }}
        >
          <option value="ai">AI 응답</option>
          <option value="user_action">사용자 액션</option>
          <option value="system">시스템 메시지</option>
          <option value="condition">조건 분기</option>
        </select>
      </div>

      <div>
        <div style={styles.label}>템플릿</div>
        <textarea
          style={styles.textarea}
          value={template}
          onChange={e => {
            setTemplate(e.target.value);
            onUpdate({ template: e.target.value });
          }}
          placeholder="프롬프트 템플릿을 입력하세요. 변수를 사용할 수 있습니다."
        />
      </div>

      <div>
        <div style={styles.label}>사용 가능한 변수 (클릭하여 삽입)</div>
        <div style={styles.tokenGrid}>
          {availableTokens.map(token => (
            <button key={token} style={styles.tokenButton} onClick={() => insertToken(token)}>
              {token}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
