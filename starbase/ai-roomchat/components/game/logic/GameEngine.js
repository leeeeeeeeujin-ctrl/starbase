/**
 * 🎮 GameEngine - 게임 루프, 상태 관리, 노드 실행
 * 
 * 순수 함수 기반으로 설계되어 테스트가 용이하고 불변성을 유지합니다.
 * 60 FPS 유지를 위한 최적화된 게임 루프를 제공합니다.
 * 
 * @module GameEngine
 * @version 1.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

/**
 * 게임 상태 초기화
 * 
 * @param {Object} options - 초기화 옵션
 * @param {Array} options.nodes - 게임 노드 배열
 * @param {Object} options.variables - 게임 변수 객체
 * @param {Object} options.characterData - 캐릭터 데이터
 * @returns {Object} 초기화된 게임 상태
 */
export function initializeGameState(options = {}) {
  const {
    nodes = [],
    variables = {},
    characterData = null,
  } = options;

  return {
    nodes: [...nodes],
    variables: { ...variables },
    characterData: characterData ? { ...characterData } : null,
    currentNode: null,
    gameHistory: [],
    gameState: {
      phase: 'preparation', // preparation, playing, paused, ended
      currentTurn: 1,
      isProcessing: false,
      awaitingUserInput: false,
      lastResponse: null,
      startTime: null,
      endTime: null,
    },
    performance: {
      frameTime: 0,
      lastFrameTime: 0,
      fps: 0,
      deltaTime: 0,
    },
  };
}

/**
 * 게임 상태 업데이트 (불변성 유지)
 * 
 * @param {Object} currentState - 현재 게임 상태
 * @param {Object} updates - 업데이트할 내용
 * @returns {Object} 새로운 게임 상태
 */
export function updateGameState(currentState, updates) {
  if (!currentState) {
    throw new Error('[GameEngine] 게임 상태가 없습니다.');
  }

  return {
    ...currentState,
    ...updates,
    gameState: {
      ...currentState.gameState,
      ...(updates.gameState || {}),
    },
    variables: {
      ...currentState.variables,
      ...(updates.variables || {}),
    },
    performance: {
      ...currentState.performance,
      ...(updates.performance || {}),
    },
  };
}

/**
 * 노드 찾기
 * 
 * @param {Object} state - 게임 상태
 * @param {string} nodeId - 찾을 노드 ID
 * @returns {Object|null} 노드 객체 또는 null
 */
export function findNode(state, nodeId) {
  if (!state || !state.nodes) {
    return null;
  }

  return state.nodes.find(node => node.id === nodeId) || null;
}

/**
 * 시작 노드 찾기
 * 
 * @param {Object} state - 게임 상태
 * @returns {Object|null} 시작 노드 또는 첫 번째 노드
 */
export function findStartNode(state) {
  if (!state || !state.nodes || state.nodes.length === 0) {
    return null;
  }

  return state.nodes.find(node => node.isStart) || state.nodes[0];
}

/**
 * 다음 노드 찾기 (조건 기반)
 * 
 * @param {Object} state - 게임 상태
 * @param {Object} currentNode - 현재 노드
 * @param {string} response - AI 응답 또는 사용자 액션
 * @returns {Object|null} 다음 노드 또는 null
 */
export function findNextNode(state, currentNode, response = '') {
  if (!currentNode || !state) {
    return null;
  }

  // 연결된 노드들 중 조건에 맞는 것 찾기
  const connections = currentNode.connections || [];
  
  for (const connection of connections) {
    const targetNode = findNode(state, connection.targetId);
    
    // 조건이 있으면 평가
    if (connection.condition) {
      if (evaluateCondition(connection.condition, response, state.variables)) {
        return targetNode;
      }
    } else {
      // 조건이 없으면 첫 번째 연결 반환
      return targetNode;
    }
  }

  // 기본적으로 다음 노드 반환 (순차적)
  const currentIndex = state.nodes.findIndex(n => n.id === currentNode.id);
  if (currentIndex >= 0 && currentIndex < state.nodes.length - 1) {
    return state.nodes[currentIndex + 1];
  }

  return null;
}

/**
 * 조건 평가
 * 
 * @param {Object} condition - 조건 객체
 * @param {string} response - 응답 텍스트
 * @param {Object} variables - 게임 변수
 * @returns {boolean} 조건 만족 여부
 */
export function evaluateCondition(condition, response = '', variables = {}) {
  if (!condition) {
    return true;
  }

  try {
    // 키워드 매칭
    if (condition.type === 'keyword') {
      const keywords = condition.keywords || [];
      return keywords.some(keyword => 
        response.toLowerCase().includes(keyword.toLowerCase())
      );
    }

    // 변수 비교
    if (condition.type === 'variable') {
      const varKey = condition.variable;
      const value = variables[varKey];
      const compareValue = condition.value;
      const operator = condition.operator || '===';

      switch (operator) {
        case '===':
        case '==':
          return value == compareValue;
        case '!==':
        case '!=':
          return value != compareValue;
        case '>':
          return Number(value) > Number(compareValue);
        case '>=':
          return Number(value) >= Number(compareValue);
        case '<':
          return Number(value) < Number(compareValue);
        case '<=':
          return Number(value) <= Number(compareValue);
        default:
          return false;
      }
    }

    // 복합 조건 (AND, OR)
    if (condition.type === 'compound') {
      const subConditions = condition.conditions || [];
      const logic = condition.logic || 'AND';

      if (logic === 'AND') {
        return subConditions.every(cond => 
          evaluateCondition(cond, response, variables)
        );
      } else if (logic === 'OR') {
        return subConditions.some(cond => 
          evaluateCondition(cond, response, variables)
        );
      }
    }

    return true;
  } catch (error) {
    console.error('[GameEngine] 조건 평가 오류:', error);
    return false;
  }
}

/**
 * 템플릿 컴파일 (변수 치환)
 * 
 * @param {string} template - 템플릿 문자열
 * @param {Object} variables - 변수 객체
 * @returns {string} 컴파일된 문자열
 */
export function compileTemplate(template, variables = {}) {
  if (!template || typeof template !== 'string') {
    return '';
  }

  let compiled = template;

  try {
    // 변수 치환
    Object.entries(variables).forEach(([key, value]) => {
      // 키가 {{}}로 감싸져 있지 않으면 추가
      const searchKey = key.startsWith('{{') ? key : `{{${key}}}`;
      const regex = new RegExp(searchKey.replace(/[{}]/g, '\\$&'), 'g');
      const safeValue = value != null ? String(value) : '';
      compiled = compiled.replace(regex, safeValue);
    });

    // 조건부 블록 처리 {{#if 조건}} ... {{/if}}
    compiled = compiled.replace(/\{\{#if\s+(.+?)\}\}(.*?)\{\{\/if\}\}/gs, (match, condition, content) => {
      const conditionKey = condition.trim();
      const conditionValue = variables[`{{${conditionKey}}}`] || variables[conditionKey];
      return conditionValue ? content : '';
    });

    // 반복 블록 처리 {{#each 배열}} ... {{/each}}
    compiled = compiled.replace(/\{\{#each\s+(.+?)\}\}(.*?)\{\{\/each\}\}/gs, (match, arrayName, content) => {
      const arrayKey = arrayName.trim();
      const arrayValue = variables[`{{${arrayKey}}}`] || variables[arrayKey];
      if (Array.isArray(arrayValue)) {
        return arrayValue.map(item => {
          const itemStr = typeof item === 'object' ? JSON.stringify(item) : String(item);
          return content.replace(/\{\{this\}\}/g, itemStr);
        }).join('\n');
      }
      return '';
    });

    return compiled;
  } catch (error) {
    console.error('[GameEngine] 템플릿 컴파일 오류:', error);
    return template;
  }
}

/**
 * 게임 히스토리 엔트리 생성
 * 
 * @param {Object} options - 히스토리 엔트리 옵션
 * @returns {Object} 히스토리 엔트리
 */
export function createHistoryEntry(options = {}) {
  const {
    turn = 1,
    nodeId = null,
    nodeType = 'unknown',
    prompt = '',
    response = '',
  } = options;

  return {
    turn,
    nodeId,
    nodeType,
    prompt,
    response,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 게임 히스토리에 엔트리 추가 (불변성 유지)
 * 
 * @param {Object} state - 게임 상태
 * @param {Object} entry - 히스토리 엔트리
 * @returns {Object} 업데이트된 게임 상태
 */
export function addHistoryEntry(state, entry) {
  if (!state || !entry) {
    return state;
  }

  return {
    ...state,
    gameHistory: [...state.gameHistory, entry],
  };
}

/**
 * 게임 시작
 * 
 * @param {Object} state - 게임 상태
 * @returns {Object} 업데이트된 게임 상태
 */
export function startGame(state) {
  if (!state) {
    throw new Error('[GameEngine] 게임 상태가 없습니다.');
  }

  const startNode = findStartNode(state);
  
  if (!startNode) {
    throw new Error('[GameEngine] 시작 노드를 찾을 수 없습니다.');
  }

  return updateGameState(state, {
    currentNode: startNode.id,
    gameState: {
      phase: 'playing',
      startTime: Date.now(),
      currentTurn: 1,
    },
  });
}

/**
 * 게임 일시정지
 * 
 * @param {Object} state - 게임 상태
 * @returns {Object} 업데이트된 게임 상태
 */
export function pauseGame(state) {
  return updateGameState(state, {
    gameState: {
      phase: 'paused',
    },
  });
}

/**
 * 게임 재개
 * 
 * @param {Object} state - 게임 상태
 * @returns {Object} 업데이트된 게임 상태
 */
export function resumeGame(state) {
  return updateGameState(state, {
    gameState: {
      phase: 'playing',
    },
  });
}

/**
 * 게임 종료
 * 
 * @param {Object} state - 게임 상태
 * @returns {Object} 업데이트된 게임 상태
 */
export function endGame(state) {
  return updateGameState(state, {
    gameState: {
      phase: 'ended',
      endTime: Date.now(),
    },
  });
}

/**
 * 프레임 성능 업데이트 (60 FPS 모니터링)
 * 
 * @param {Object} state - 게임 상태
 * @param {number} currentTime - 현재 시간 (밀리초)
 * @returns {Object} 업데이트된 게임 상태
 */
export function updatePerformance(state, currentTime) {
  const lastFrameTime = state.performance.lastFrameTime || currentTime;
  const deltaTime = currentTime - lastFrameTime;
  const fps = deltaTime > 0 ? 1000 / deltaTime : 0;

  return updateGameState(state, {
    performance: {
      frameTime: currentTime,
      lastFrameTime: currentTime,
      deltaTime,
      fps: Math.round(fps),
    },
  });
}

/**
 * 게임 상태 검증
 * 
 * @param {Object} state - 게임 상태
 * @returns {Object} 검증 결과 { valid: boolean, errors: string[] }
 */
export function validateGameState(state) {
  const errors = [];

  if (!state) {
    errors.push('게임 상태가 null입니다.');
    return { valid: false, errors };
  }

  if (!state.nodes || !Array.isArray(state.nodes)) {
    errors.push('노드 배열이 없습니다.');
  }

  if (!state.variables || typeof state.variables !== 'object') {
    errors.push('변수 객체가 없습니다.');
  }

  if (!state.gameState || typeof state.gameState !== 'object') {
    errors.push('게임 상태 객체가 없습니다.');
  }

  if (!state.gameHistory || !Array.isArray(state.gameHistory)) {
    errors.push('게임 히스토리 배열이 없습니다.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 성능 최적화: 저사양 디바이스 감지
 * 
 * @returns {boolean} 저사양 디바이스 여부
 */
export function isLowEndDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  // 메모리 기반 판단
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) {
    return true;
  }

  // CPU 코어 수 기반 판단
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
    return true;
  }

  return false;
}

/**
 * 성능 최적화: 프레임 레이트 제한
 * 
 * @param {number} targetFPS - 목표 FPS (기본: 60)
 * @returns {number} 프레임 간격 (밀리초)
 */
export function getFrameInterval(targetFPS = 60) {
  const lowEnd = isLowEndDevice();
  const adjustedFPS = lowEnd ? Math.min(targetFPS, 30) : targetFPS;
  return 1000 / adjustedFPS;
}

export default {
  initializeGameState,
  updateGameState,
  findNode,
  findStartNode,
  findNextNode,
  evaluateCondition,
  compileTemplate,
  createHistoryEntry,
  addHistoryEntry,
  startGame,
  pauseGame,
  resumeGame,
  endGame,
  updatePerformance,
  validateGameState,
  isLowEndDevice,
  getFrameInterval,
};
