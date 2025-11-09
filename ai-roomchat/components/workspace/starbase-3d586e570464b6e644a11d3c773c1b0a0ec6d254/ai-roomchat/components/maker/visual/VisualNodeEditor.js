/**
 * 🎮 Visual Node Editor
 * Scratch/Blockly 스타일의 드래그앤드롭 게임 로직 구성 시스템
 * - 직관적인 블록 기반 프로그래밍
 * - 실시간 코드 생성 및 미리보기
 * - 게임 개발에 특화된 노드 라이브러리
 * - AI 컨텍스트와 완벽한 연동
 *
 * 🔧 호환성 지원:
 * - IE 11+, Safari 12+, Chrome 70+, Firefox 65+
 * - 터치 디바이스 및 모바일 최적화
 * - 키보드 네비게이션 지원
 * - 고대비 모드 및 접근성 기능
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { CompatibilityManager } from '../../../utils/compatibilityManager';
import { MobileOptimizationManager } from '../../../utils/mobileOptimizationManager';
import { NODE_TYPES, NODE_CATEGORIES } from './constants';
import NodePalette from './components/NodePalette';
import CodeViewer from './components/CodeViewer';
import GamePreview from './components/GamePreview';
import NodePropertiesPanel from './components/NodePropertiesPanel';

// 노드 타입 및 카테고리는 constants에서 import

const VisualNodeEditor = ({
  onClose,
  onCodeGenerated,
  gameData = {},
  existingNodes = [],
  isMobile = false,
  deviceTier = 'medium',
}) => {
  // 호환성 상태
  const [compatibilityInfo, setCompatibilityInfo] = useState(null);
  const [isCompatibilityReady, setIsCompatibilityReady] = useState(false);

  const [nodes, setNodes] = useState(existingNodes);
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);
  const [activeCategory, setActiveCategory] = useState('events');
  const [connections, setConnections] = useState([]);
  const [viewMode, setViewMode] = useState('editor'); // 'editor' | 'code' | 'preview'
  const [generatedCode, setGeneratedCode] = useState('');

  const canvasRef = useRef(null);
  const nodeIdCounter = useRef(1);
  const touchManager = useRef(null);

  // 호환성 초기화
  useEffect(() => {
    const initializeCompatibility = async () => {
      try {
        const info = CompatibilityManager.getCompatibilityInfo();
        setCompatibilityInfo(info);

        // 터치 매니저 초기화 (모바일 디바이스용)
        if (info.device.mobile || info.features.touchDevice) {
          touchManager.current = new MobileOptimizationManager();
          await touchManager.current.initialize({
            element: canvasRef.current,
            enableTouchOptimization: true,
            enableKeyboardNavigation: true,
            compatibilityLevel: info.level,
          });
        }

        setIsCompatibilityReady(true);
      } catch (error) {
        console.error('[VisualNodeEditor] 호환성 초기화 실패:', error);
        setIsCompatibilityReady(true); // 실패해도 기본 기능은 동작
      }
    };

    initializeCompatibility();

    return () => {
      touchManager.current?.cleanup();
    };
  }, []);

  // 모바일 최적화 설정
  const mobileOptimized = useMemo(
    () => ({
      nodeSize: isMobile ? (deviceTier === 'low' ? 120 : 140) : 160,
      fontSize: isMobile ? (deviceTier === 'low' ? 12 : 14) : 16,
      padding: isMobile ? 8 : 12,
      panelWidth: isMobile ? '100%' : '300px',
    }),
    [isMobile, deviceTier]
  );

  // 드래그 상태 관리
  const [dragState, setDragState] = useState({
    isDragging: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
  });

  useEffect(() => {
    generateCode();
  }, [nodes, connections]);

  // 노드 생성
  const createNode = useCallback((type, position) => {
    const nodeType = getNodeTypeByKey(type);
    if (!nodeType) return null;

    const newNode = {
      id: `node_${nodeIdCounter.current++}`,
      type,
      position,
      data: {
        label: nodeType.label,
        color: nodeType.color,
        icon: nodeType.icon,
        category: nodeType.category,
        inputs: getNodeInputs(type),
        outputs: getNodeOutputs(type),
        parameters: getNodeParameters(type),
      },
    };

    return newNode;
  }, []);

  // 노드 타입 검색
  const getNodeTypeByKey = typeKey => {
    for (const category of Object.values(NODE_TYPES)) {
      if (category[typeKey]) {
        return category[typeKey];
      }
    }
    return null;
  };

  // 노드별 입력 포트 정의
  const getNodeInputs = type => {
    const inputMap = {
      // 이벤트 노드들은 대부분 입력 없음
      UPDATE: [],
      START: [],
      CLICK: ['target'],
      COLLISION: ['object1', 'object2'],
      KEY_PRESS: ['key'],
      TIMER: ['duration'],

      // 액션 노드들
      MOVE: ['object', 'direction', 'speed'],
      ROTATE: ['object', 'angle'],
      SCALE: ['object', 'factor'],
      PLAY_SOUND: ['sound'],
      SHOW_TEXT: ['text', 'position'],
      CHANGE_SCENE: ['scene'],
      SPAWN_OBJECT: ['prefab', 'position'],
      DESTROY: ['object'],

      // 조건 노드들
      IF: ['condition'],
      COMPARE: ['value1', 'operator', 'value2'],
      AND: ['condition1', 'condition2'],
      OR: ['condition1', 'condition2'],
      NOT: ['condition'],

      // 변수 노드들
      SET: ['variable', 'value'],
      GET: ['variable'],
      CHANGE: ['variable', 'amount'],
      RANDOM: ['min', 'max'],

      // 게임 노드들
      PLAYER: [],
      ENEMY: ['type'],
      ITEM: ['type'],
      SCORE: ['amount'],
      HEALTH: ['amount'],
      LEVEL: ['number'],
    };

    return inputMap[type] || [];
  };

  // 노드별 출력 포트 정의
  const getNodeOutputs = type => {
    const outputMap = {
      // 이벤트 노드들은 실행 신호 출력
      START: ['execute'],
      UPDATE: ['execute'],
      CLICK: ['execute', 'target'],
      COLLISION: ['execute', 'object'],
      KEY_PRESS: ['execute', 'key'],
      TIMER: ['execute'],

      // 액션 노드들
      MOVE: ['execute'],
      ROTATE: ['execute'],
      SCALE: ['execute'],
      PLAY_SOUND: ['execute'],
      SHOW_TEXT: ['execute'],
      CHANGE_SCENE: ['execute'],
      SPAWN_OBJECT: ['execute', 'object'],
      DESTROY: ['execute'],

      // 조건 노드들
      IF: ['true', 'false'],
      COMPARE: ['result'],
      AND: ['result'],
      OR: ['result'],
      NOT: ['result'],

      // 변수 노드들
      SET: ['execute'],
      GET: ['value'],
      CHANGE: ['execute'],
      RANDOM: ['value'],

      // 게임 노드들
      PLAYER: ['object'],
      ENEMY: ['object'],
      ITEM: ['object'],
      SCORE: ['value'],
      HEALTH: ['value'],
      LEVEL: ['value'],
    };

    return outputMap[type] || [];
  };

  // 노드별 매개변수 정의
  const getNodeParameters = type => {
    const paramMap = {
      MOVE: { direction: '→', speed: 100 },
      ROTATE: { angle: 90 },
      SCALE: { factor: 1.5 },
      TIMER: { duration: 1000 },
      COMPARE: { operator: '>' },
      SET: { variable: 'myVar', value: 0 },
      GET: { variable: 'myVar' },
      CHANGE: { variable: 'myVar', amount: 1 },
      RANDOM: { min: 1, max: 100 },
      SHOW_TEXT: { text: 'Hello!', position: 'center' },
      PLAY_SOUND: { sound: 'beep' },
      KEY_PRESS: { key: 'SPACE' },
    };

    return paramMap[type] || {};
  };

  // 드래그 시작 (터치 이벤트 호환성 포함)
  const handleDragStart = useCallback((e, nodeType) => {
    // HTML5 DnD: dataTransfer 설정 (일부 브라우저는 데이터 없으면 drop 미발생)
    if (e.dataTransfer && typeof e.dataTransfer.setData === 'function') {
      try {
        e.dataTransfer.setData('application/x-visual-node', String(nodeType));
        e.dataTransfer.effectAllowed = 'copy';
      } catch (_) {}
    } else {
      // 터치 드래그 대비: 기본 동작 취소 후 내부 상태로 처리
      e.preventDefault();
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = e.currentTarget.getBoundingClientRect();
    setDraggedNode({
      type: nodeType,
      offset: { x: clientX - rect.left, y: clientY - rect.top },
    });
  }, []);

  // 캔버스에 드롭 (터치 이벤트 호환성 포함)
  const handleCanvasDrop = useCallback(
    e => {
      e.preventDefault();
      if (!canvasRef.current) return;

      // 노드 타입 결정: 내부 상태 우선, 없으면 dataTransfer에서 복구
      let nodeType = draggedNode && draggedNode.type;
      if (!nodeType && e.dataTransfer) {
        try { nodeType = e.dataTransfer.getData('application/x-visual-node') || null; } catch(_) {}
      }
      if (!nodeType) return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const rect = canvasRef.current.getBoundingClientRect();
      const position = {
        x: clientX - rect.left - (draggedNode?.offset.x || 0),
        y: clientY - rect.top - (draggedNode?.offset.y || 0),
      };

      const newNode = createNode(nodeType, position);
      if (newNode) {
        setNodes(prev => [...prev, newNode]);
      }

      setDraggedNode(null);
    },
    [draggedNode, createNode]
  );

  // 노드 선택
  const handleNodeClick = useCallback(node => {
    setSelectedNode(node);
  }, []);

  // 노드 삭제
  const deleteNode = useCallback(
    nodeId => {
      setNodes(prev => prev.filter(node => node.id !== nodeId));
      setConnections(prev =>
        prev.filter(conn => conn.from.nodeId !== nodeId && conn.to.nodeId !== nodeId)
      );
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
      }
    },
    [selectedNode]
  );

  // 코드 생성
  const generateCode = useCallback(() => {
    if (nodes.length === 0) {
      setGeneratedCode('// 노드를 추가하여 코드를 생성하세요!');
      return;
    }

    let code = '// 자동 생성된 게임 코드\n\n';
    code += 'class GameLogic {\n';
    code += '  constructor() {\n';
    code += '    this.initializeGame();\n';
    code += '  }\n\n';

    // 이벤트 처리 함수들 생성
    const eventNodes = nodes.filter(node => NODE_TYPES.EVENTS[node.type]);
    eventNodes.forEach(node => {
      code += generateEventHandler(node);
    });

    // 액션 함수들 생성
    const actionNodes = nodes.filter(node => NODE_TYPES.ACTIONS[node.type]);
    actionNodes.forEach(node => {
      code += generateActionFunction(node);
    });

    code += '}\n\n';
    code += '// 게임 인스턴스 생성\n';
    code += 'const game = new GameLogic();\n';

    setGeneratedCode(code);

    if (onCodeGenerated) {
      onCodeGenerated(code);
    }
  }, [nodes, connections, onCodeGenerated]);

  // 이벤트 핸들러 코드 생성
  const generateEventHandler = node => {
    const handlers = {
      START: `  initializeGame() {\n    console.log('게임이 시작되었습니다!');\n    // 게임 초기화 로직\n  }\n\n`,
      UPDATE: `  update() {\n    // 매 프레임 실행되는 로직\n    requestAnimationFrame(() => this.update());\n  }\n\n`,
      CLICK: `  onMouseClick(event) {\n    console.log('클릭:', event.target);\n    // 클릭 처리 로직\n  }\n\n`,
      COLLISION: `  onCollision(obj1, obj2) {\n    console.log('충돌 감지:', obj1, obj2);\n    // 충돌 처리 로직\n  }\n\n`,
      KEY_PRESS: `  onKeyPress(key) {\n    if (key === '${node.data.parameters?.key || 'SPACE'}') {\n      console.log('키 입력:', key);\n      // 키 입력 처리 로직\n    }\n  }\n\n`,
      TIMER: `  onTimer() {\n    setTimeout(() => {\n      console.log('타이머 완료!');\n      // 타이머 완료 로직\n    }, ${node.data.parameters?.duration || 1000});\n  }\n\n`,
    };

    return handlers[node.type] || '';
  };

  // 액션 함수 코드 생성
  const generateActionFunction = node => {
    const actions = {
      MOVE: `  moveObject(object, direction, speed) {\n    // 오브젝트 이동 로직\n    const movement = { x: 0, y: 0 };\n    switch(direction) {\n      case '→': movement.x = speed; break;\n      case '←': movement.x = -speed; break;\n      case '↑': movement.y = -speed; break;\n      case '↓': movement.y = speed; break;\n    }\n    object.x += movement.x;\n    object.y += movement.y;\n  }\n\n`,
      ROTATE: `  rotateObject(object, angle) {\n    object.rotation += ${node.data.parameters?.angle || 90};\n  }\n\n`,
      SCALE: `  scaleObject(object, factor) {\n    object.scale *= ${node.data.parameters?.factor || 1.5};\n  }\n\n`,
      PLAY_SOUND: `  playSound(soundName) {\n    const audio = new Audio('sounds/' + soundName + '.mp3');\n    audio.play();\n  }\n\n`,
      SHOW_TEXT: `  showText(text, position) {\n    console.log('텍스트 표시:', text, 'at', position);\n    // UI 텍스트 표시 로직\n  }\n\n`,
      SPAWN_OBJECT: `  spawnObject(prefab, position) {\n    const newObject = { ...prefab, ...position };\n    console.log('오브젝트 생성:', newObject);\n    return newObject;\n  }\n\n`,
    };

    return actions[node.type] || '';
  };

  // 노드 렌더링
  const renderNode = node => {
    const isSelected = selectedNode?.id === node.id;
    const nodeStyle = {
      position: 'absolute',
      left: node.position.x,
      top: node.position.y,
      width: mobileOptimized.nodeSize,
      minHeight: 60,
      background: `linear-gradient(135deg, ${node.data.color}dd, ${node.data.color}aa)`,
      border: isSelected ? '3px solid #ffffff' : '2px solid rgba(255,255,255,0.3)',
      borderRadius: 12,
      padding: mobileOptimized.padding,
      cursor: 'move',
      boxShadow: isSelected ? '0 8px 25px rgba(255,255,255,0.3)' : '0 4px 15px rgba(0,0,0,0.2)',
      transform: isSelected ? 'scale(1.05)' : 'scale(1)',
      transition: deviceTier === 'high' ? 'all 0.2s ease' : 'none',
      zIndex: isSelected ? 1000 : 1,
    };

    return (
      <div
        key={node.id}
        style={nodeStyle}
        onClick={() => handleNodeClick(node)}
        onDoubleClick={() => deleteNode(node.id)}
      >
        {/* 노드 헤더 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            fontSize: mobileOptimized.fontSize,
            fontWeight: 700,
            color: '#ffffff',
          }}
        >
          <span style={{ fontSize: mobileOptimized.fontSize + 2 }}>{node.data.icon}</span>
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.data.label}
          </span>
          <button
            onClick={e => {
              e.stopPropagation();
              deleteNode(node.id);
            }}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: 4,
              color: '#ffffff',
              width: 20,
              height: 20,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* 노드 매개변수 */}
        {Object.entries(node.data.parameters || {}).length > 0 && (
          <div
            style={{
              fontSize: mobileOptimized.fontSize - 2,
              color: '#ffffff',
              opacity: 0.9,
            }}
          >
            {Object.entries(node.data.parameters).map(([key, value]) => (
              <div key={key} style={{ marginBottom: 2 }}>
                <strong>{key}:</strong> {value}
              </div>
            ))}
          </div>
        )}

        {/* 입력/출력 포트 (간소화된 버전) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 8,
          }}
        >
          {node.data.inputs?.length > 0 && (
            <div
              style={{
                width: 8,
                height: 8,
                background: '#ffffff',
                borderRadius: '50%',
                border: '2px solid ' + node.data.color,
              }}
            />
          )}
          {node.data.outputs?.length > 0 && (
            <div
              style={{
                width: 8,
                height: 8,
                background: node.data.color,
                borderRadius: '50%',
                border: '2px solid #ffffff',
              }}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.95)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid rgba(255,255,255,0.1)',
          order: isMobile ? 0 : 'initial',
        }}
      >
        <h2
          style={{
            margin: 0,
            color: '#ffffff',
            fontSize: isMobile ? 18 : 24,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          🎮 비주얼 노드 에디터
        </h2>

        <div style={{ display: 'flex', gap: 10 }}>
          {/* 뷰 모드 전환 */}
          <div
            style={{
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: 4,
              display: 'flex',
            }}
          >
            {['editor', 'code', 'preview'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  background: viewMode === mode ? 'rgba(255,255,255,0.2)' : 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {mode === 'editor' ? '에디터' : mode === 'code' ? '코드' : '미리보기'}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#ffffff',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ✕ 닫기
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: isMobile ? 'column' : 'row',
          overflow: 'hidden',
        }}
      >
        {/* 노드 팔레트 */}
        {viewMode === 'editor' && (
          <NodePalette
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            onDragStart={handleDragStart}
            isMobile={isMobile}
            deviceTier={deviceTier}
            mobileOptimized={mobileOptimized}
          />
        )}

        {/* 메인 캔버스 영역 */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
          }}
        >
          {viewMode === 'editor' && (
            <div
              ref={canvasRef}
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'auto',
              }}
              onDrop={handleCanvasDrop}
              onDragOver={e => e.preventDefault()}
              onTouchEnd={handleCanvasDrop} // 터치 디바이스 지원
              onKeyDown={e => {
                // 키보드 네비게이션 지원 (접근성)
                if (e.key === 'Delete' && selectedNode) {
                  deleteNode(selectedNode.id);
                } else if (e.key === 'Escape') {
                  setSelectedNode(null);
                }
              }}
              tabIndex={0} // 키보드 포커스 가능하도록
            >
              {/* 그리드 배경 */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundImage:
                    deviceTier === 'high'
                      ? 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)'
                      : 'none',
                  backgroundSize: '20px 20px',
                  pointerEvents: 'none',
                }}
              />

              {/* 노드들 렌더링 */}
              {nodes.map(renderNode)}

              {/* 빈 캔버스 안내 */}
              {nodes.length === 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    color: '#64748b',
                    fontSize: isMobile ? 16 : 18,
                  }}
                >
                  <div style={{ fontSize: isMobile ? 48 : 64, marginBottom: 20 }}>🎮</div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    왼쪽에서 노드를 드래그해서 게임 로직을 만들어보세요!
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.8 }}>노드를 더블클릭하면 삭제됩니다</div>
                </div>
              )}
            </div>
          )}

          {viewMode === 'code' && (
            <CodeViewer code={generatedCode} onCodeChange={setGeneratedCode} isMobile={isMobile} />
          )}

          {viewMode === 'preview' && (
            <GamePreview nodes={nodes} generatedCode={generatedCode} isMobile={isMobile} />
          )}
        </div>
      </div>

      {/* 선택된 노드 속성 패널 */}
      {selectedNode && viewMode === 'editor' && (
        <NodePropertiesPanel
          node={selectedNode}
          onNodeUpdate={updatedNode => {
            setNodes(prev => prev.map(n => (n.id === updatedNode.id ? updatedNode : n)));
          }}
          onClose={() => setSelectedNode(null)}
          isMobile={isMobile}
        />
      )}
    </div>
  );
};

export default VisualNodeEditor;
