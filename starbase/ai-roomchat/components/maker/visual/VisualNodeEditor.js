/**
 * 🎮 Visual Node Editor
 * Scratch/Blockly 스타일의 드래그앤드롭 게임 로직 구성 시스템
 * - 직관적인 블록 기반 프로그래밍
 * - 실시간 코드 생성 및 미리보기
 * - 게임 개발에 특화된 노드 라이브러리
 * - AI 컨텍스트와 완벽한 연동
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// 노드 타입 정의
const NODE_TYPES = {
  // 이벤트 노드
  EVENTS: {
    START: { label: '게임 시작', color: '#22c55e', icon: '🚀', category: 'events' },
    UPDATE: { label: '매 프레임', color: '#3b82f6', icon: '🔄', category: 'events' },
    CLICK: { label: '클릭 시', color: '#8b5cf6', icon: '👆', category: 'events' },
    COLLISION: { label: '충돌 시', color: '#ef4444', icon: '💥', category: 'events' },
    KEY_PRESS: { label: '키 입력', color: '#f59e0b', icon: '⌨️', category: 'events' },
    TIMER: { label: '타이머', color: '#06b6d4', icon: '⏰', category: 'events' }
  },
  
  // 액션 노드
  ACTIONS: {
    MOVE: { label: '이동하기', color: '#10b981', icon: '🏃', category: 'actions' },
    ROTATE: { label: '회전하기', color: '#f97316', icon: '🔄', category: 'actions' },
    SCALE: { label: '크기 변경', color: '#8b5cf6', icon: '📏', category: 'actions' },
    PLAY_SOUND: { label: '소리 재생', color: '#ec4899', icon: '🔊', category: 'actions' },
    SHOW_TEXT: { label: '텍스트 표시', color: '#3b82f6', icon: '💬', category: 'actions' },
    CHANGE_SCENE: { label: '장면 변경', color: '#ef4444', icon: '🎬', category: 'actions' },
    SPAWN_OBJECT: { label: '오브젝트 생성', color: '#22c55e', icon: '✨', category: 'actions' },
    DESTROY: { label: '파괴하기', color: '#dc2626', icon: '💥', category: 'actions' }
  },
  
  // 조건 노드
  CONDITIONS: {
    IF: { label: '만약', color: '#f59e0b', icon: '❓', category: 'conditions' },
    COMPARE: { label: '비교', color: '#06b6d4', icon: '⚖️', category: 'conditions' },
    AND: { label: '그리고', color: '#8b5cf6', icon: '&', category: 'conditions' },
    OR: { label: '또는', color: '#ec4899', icon: '|', category: 'conditions' },
    NOT: { label: '아니면', color: '#ef4444', icon: '!', category: 'conditions' }
  },
  
  // 변수 노드
  VARIABLES: {
    SET: { label: '변수 설정', color: '#f97316', icon: '📦', category: 'variables' },
    GET: { label: '변수 가져오기', color: '#10b981', icon: '📤', category: 'variables' },
    CHANGE: { label: '변수 변경', color: '#3b82f6', icon: '📊', category: 'variables' },
    RANDOM: { label: '랜덤 숫자', color: '#8b5cf6', icon: '🎲', category: 'variables' }
  },
  
  // 게임 특화 노드
  GAME: {
    PLAYER: { label: '플레이어', color: '#22c55e', icon: '👤', category: 'game' },
    ENEMY: { label: '적', color: '#ef4444', icon: '👹', category: 'game' },
    ITEM: { label: '아이템', color: '#f59e0b', icon: '💎', category: 'game' },
    SCORE: { label: '점수', color: '#3b82f6', icon: '🏆', category: 'game' },
    HEALTH: { label: '체력', color: '#dc2626', icon: '❤️', category: 'game' },
    LEVEL: { label: '레벨', color: '#8b5cf6', icon: '🎯', category: 'game' }
  }
};

// 노드 카테고리
const NODE_CATEGORIES = [
  { id: 'events', label: '이벤트', icon: '⚡', color: '#22c55e' },
  { id: 'actions', label: '액션', icon: '🎬', color: '#3b82f6' },
  { id: 'conditions', label: '조건', icon: '🤔', color: '#f59e0b' },
  { id: 'variables', label: '변수', icon: '📊', color: '#8b5cf6' },
  { id: 'game', label: '게임', icon: '🎮', color: '#ec4899' }
];

const VisualNodeEditor = ({ 
  onClose, 
  onCodeGenerated, 
  gameData = {}, 
  existingNodes = [],
  isMobile = false,
  deviceTier = 'medium'
}) => {
  const [nodes, setNodes] = useState(existingNodes);
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);
  const [activeCategory, setActiveCategory] = useState('events');
  const [connections, setConnections] = useState([]);
  const [viewMode, setViewMode] = useState('editor'); // 'editor' | 'code' | 'preview'
  const [generatedCode, setGeneratedCode] = useState('');
  
  const canvasRef = useRef(null);
  const nodeIdCounter = useRef(1);
  
  // 모바일 최적화 설정
  const mobileOptimized = useMemo(() => ({
    nodeSize: isMobile ? (deviceTier === 'low' ? 120 : 140) : 160,
    fontSize: isMobile ? (deviceTier === 'low' ? 12 : 14) : 16,
    padding: isMobile ? 8 : 12,
    panelWidth: isMobile ? '100%' : '300px'
  }), [isMobile, deviceTier]);
  
  // 드래그 상태 관리
  const [dragState, setDragState] = useState({
    isDragging: false,
    startPos: { x: 0, y: 0 },
    offset: { x: 0, y: 0 }
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
        parameters: getNodeParameters(type)
      }
    };
    
    return newNode;
  }, []);
  
  // 노드 타입 검색
  const getNodeTypeByKey = (typeKey) => {
    for (const category of Object.values(NODE_TYPES)) {
      if (category[typeKey]) {
        return category[typeKey];
      }
    }
    return null;
  };
  
  // 노드별 입력 포트 정의
  const getNodeInputs = (type) => {
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
      LEVEL: ['number']
    };
    
    return inputMap[type] || [];
  };
  
  // 노드별 출력 포트 정의
  const getNodeOutputs = (type) => {
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
      LEVEL: ['value']
    };
    
    return outputMap[type] || [];
  };
  
  // 노드별 매개변수 정의
  const getNodeParameters = (type) => {
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
      KEY_PRESS: { key: 'SPACE' }
    };
    
    return paramMap[type] || {};
  };
  
  // 드래그 시작
  const handleDragStart = useCallback((e, nodeType) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setDraggedNode({
      type: nodeType,
      offset: {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
    });
  }, []);
  
  // 캔버스에 드롭
  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault();
    if (!draggedNode || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const position = {
      x: e.clientX - rect.left - draggedNode.offset.x,
      y: e.clientY - rect.top - draggedNode.offset.y
    };
    
    const newNode = createNode(draggedNode.type, position);
    if (newNode) {
      setNodes(prev => [...prev, newNode]);
    }
    
    setDraggedNode(null);
  }, [draggedNode, createNode]);
  
  // 노드 선택
  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
  }, []);
  
  // 노드 삭제
  const deleteNode = useCallback((nodeId) => {
    setNodes(prev => prev.filter(node => node.id !== nodeId));
    setConnections(prev => prev.filter(conn => 
      conn.from.nodeId !== nodeId && conn.to.nodeId !== nodeId
    ));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  }, [selectedNode]);
  
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
  const generateEventHandler = (node) => {
    const handlers = {
      START: `  initializeGame() {\n    console.log('게임이 시작되었습니다!');\n    // 게임 초기화 로직\n  }\n\n`,
      UPDATE: `  update() {\n    // 매 프레임 실행되는 로직\n    requestAnimationFrame(() => this.update());\n  }\n\n`,
      CLICK: `  onMouseClick(event) {\n    console.log('클릭:', event.target);\n    // 클릭 처리 로직\n  }\n\n`,
      COLLISION: `  onCollision(obj1, obj2) {\n    console.log('충돌 감지:', obj1, obj2);\n    // 충돌 처리 로직\n  }\n\n`,
      KEY_PRESS: `  onKeyPress(key) {\n    if (key === '${node.data.parameters?.key || 'SPACE'}') {\n      console.log('키 입력:', key);\n      // 키 입력 처리 로직\n    }\n  }\n\n`,
      TIMER: `  onTimer() {\n    setTimeout(() => {\n      console.log('타이머 완료!');\n      // 타이머 완료 로직\n    }, ${node.data.parameters?.duration || 1000});\n  }\n\n`
    };
    
    return handlers[node.type] || '';
  };
  
  // 액션 함수 코드 생성
  const generateActionFunction = (node) => {
    const actions = {
      MOVE: `  moveObject(object, direction, speed) {\n    // 오브젝트 이동 로직\n    const movement = { x: 0, y: 0 };\n    switch(direction) {\n      case '→': movement.x = speed; break;\n      case '←': movement.x = -speed; break;\n      case '↑': movement.y = -speed; break;\n      case '↓': movement.y = speed; break;\n    }\n    object.x += movement.x;\n    object.y += movement.y;\n  }\n\n`,
      ROTATE: `  rotateObject(object, angle) {\n    object.rotation += ${node.data.parameters?.angle || 90};\n  }\n\n`,
      SCALE: `  scaleObject(object, factor) {\n    object.scale *= ${node.data.parameters?.factor || 1.5};\n  }\n\n`,
      PLAY_SOUND: `  playSound(soundName) {\n    const audio = new Audio('sounds/' + soundName + '.mp3');\n    audio.play();\n  }\n\n`,
      SHOW_TEXT: `  showText(text, position) {\n    console.log('텍스트 표시:', text, 'at', position);\n    // UI 텍스트 표시 로직\n  }\n\n`,
      SPAWN_OBJECT: `  spawnObject(prefab, position) {\n    const newObject = { ...prefab, ...position };\n    console.log('오브젝트 생성:', newObject);\n    return newObject;\n  }\n\n`
    };
    
    return actions[node.type] || '';
  };
  
  // 노드 렌더링
  const renderNode = (node) => {
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
      boxShadow: isSelected 
        ? '0 8px 25px rgba(255,255,255,0.3)' 
        : '0 4px 15px rgba(0,0,0,0.2)',
      transform: isSelected ? 'scale(1.05)' : 'scale(1)',
      transition: deviceTier === 'high' ? 'all 0.2s ease' : 'none',
      zIndex: isSelected ? 1000 : 1
    };
    
    return (
      <div
        key={node.id}
        style={nodeStyle}
        onClick={() => handleNodeClick(node)}
        onDoubleClick={() => deleteNode(node.id)}
      >
        {/* 노드 헤더 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontSize: mobileOptimized.fontSize,
          fontWeight: 700,
          color: '#ffffff'
        }}>
          <span style={{ fontSize: mobileOptimized.fontSize + 2 }}>
            {node.data.icon}
          </span>
          <span style={{ 
            flex: 1, 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {node.data.label}
          </span>
          <button
            onClick={(e) => {
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
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>
        
        {/* 노드 매개변수 */}
        {Object.entries(node.data.parameters || {}).length > 0 && (
          <div style={{
            fontSize: mobileOptimized.fontSize - 2,
            color: '#ffffff',
            opacity: 0.9
          }}>
            {Object.entries(node.data.parameters).map(([key, value]) => (
              <div key={key} style={{ marginBottom: 2 }}>
                <strong>{key}:</strong> {value}
              </div>
            ))}
          </div>
        )}
        
        {/* 입력/출력 포트 (간소화된 버전) */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8
        }}>
          {node.data.inputs?.length > 0 && (
            <div style={{
              width: 8,
              height: 8,
              background: '#ffffff',
              borderRadius: '50%',
              border: '2px solid ' + node.data.color
            }} />
          )}
          {node.data.outputs?.length > 0 && (
            <div style={{
              width: 8,
              height: 8,
              background: node.data.color,
              borderRadius: '50%',
              border: '2px solid #ffffff'
            }} />
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.95)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      {/* 헤더 */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid rgba(255,255,255,0.1)',
        order: isMobile ? 0 : 'initial'
      }}>
        <h2 style={{
          margin: 0,
          color: '#ffffff',
          fontSize: isMobile ? 18 : 24,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          🎮 비주얼 노드 에디터
        </h2>
        
        <div style={{ display: 'flex', gap: 10 }}>
          {/* 뷰 모드 전환 */}
          <div style={{ 
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: 4,
            display: 'flex'
          }}>
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
                  fontWeight: 600
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
              fontWeight: 600
            }}
          >
            ✕ 닫기
          </button>
        </div>
      </div>
      
      <div style={{ 
        display: 'flex', 
        flex: 1, 
        flexDirection: isMobile ? 'column' : 'row',
        overflow: 'hidden'
      }}>
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
        <div style={{ 
          flex: 1, 
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)'
        }}>
          {viewMode === 'editor' && (
            <div
              ref={canvasRef}
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'auto'
              }}
              onDrop={handleCanvasDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {/* 그리드 배경 */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundImage: deviceTier === 'high' ? 
                  'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)' : 'none',
                backgroundSize: '20px 20px',
                pointerEvents: 'none'
              }} />
              
              {/* 노드들 렌더링 */}
              {nodes.map(renderNode)}
              
              {/* 빈 캔버스 안내 */}
              {nodes.length === 0 && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: isMobile ? 16 : 18
                }}>
                  <div style={{ fontSize: isMobile ? 48 : 64, marginBottom: 20 }}>🎮</div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    왼쪽에서 노드를 드래그해서 게임 로직을 만들어보세요!
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.8 }}>
                    노드를 더블클릭하면 삭제됩니다
                  </div>
                </div>
              )}
            </div>
          )}
          
          {viewMode === 'code' && (
            <CodeViewer 
              code={generatedCode}
              onCodeChange={setGeneratedCode}
              isMobile={isMobile}
            />
          )}
          
          {viewMode === 'preview' && (
            <GamePreview 
              nodes={nodes}
              generatedCode={generatedCode}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>
      
      {/* 선택된 노드 속성 패널 */}
      {selectedNode && viewMode === 'editor' && (
        <NodePropertiesPanel
          node={selectedNode}
          onNodeUpdate={(updatedNode) => {
            setNodes(prev => prev.map(n => 
              n.id === updatedNode.id ? updatedNode : n
            ));
          }}
          onClose={() => setSelectedNode(null)}
          isMobile={isMobile}
        />
      )}
    </div>
  );
};

// 노드 팔레트 컴포넌트
const NodePalette = ({ 
  activeCategory, 
  onCategoryChange, 
  onDragStart,
  isMobile,
  deviceTier,
  mobileOptimized 
}) => {
  return (
    <div style={{
      width: isMobile ? '100%' : '280px',
      background: 'rgba(15, 23, 42, 0.9)',
      borderRight: isMobile ? 'none' : '2px solid rgba(255,255,255,0.1)',
      borderBottom: isMobile ? '2px solid rgba(255,255,255,0.1)' : 'none',
      display: 'flex',
      flexDirection: isMobile ? 'row' : 'column',
      maxHeight: isMobile ? '120px' : 'none',
      overflowX: isMobile ? 'auto' : 'visible',
      overflowY: isMobile ? 'hidden' : 'auto'
    }}>
      {/* 카테고리 탭 */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        padding: 8,
        gap: 4,
        borderBottom: isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)',
        borderRight: isMobile ? '1px solid rgba(255,255,255,0.1)' : 'none',
        minWidth: isMobile ? '100px' : 'auto'
      }}>
        {NODE_CATEGORIES.map(category => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            style={{
              background: activeCategory === category.id 
                ? category.color 
                : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 6,
              color: '#ffffff',
              padding: isMobile ? '6px' : '8px 12px',
              cursor: 'pointer',
              fontSize: isMobile ? 10 : 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
              flex: isMobile ? '0 0 auto' : 'none'
            }}
          >
            <span>{category.icon}</span>
            {!isMobile && <span>{category.label}</span>}
          </button>
        ))}
      </div>
      
      {/* 노드 목록 */}
      <div style={{
        flex: 1,
        padding: 8,
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        gap: 6,
        overflowX: isMobile ? 'auto' : 'visible',
        overflowY: isMobile ? 'hidden' : 'auto'
      }}>
        {Object.entries(NODE_TYPES[activeCategory.toUpperCase()] || {}).map(([key, nodeType]) => (
          <div
            key={key}
            draggable
            onDragStart={(e) => onDragStart(e, key)}
            style={{
              background: `linear-gradient(135deg, ${nodeType.color}dd, ${nodeType.color}aa)`,
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: 8,
              padding: isMobile ? '6px 8px' : '8px 12px',
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: mobileOptimized.fontSize - 2,
              fontWeight: 600,
              color: '#ffffff',
              transition: deviceTier === 'high' ? 'all 0.2s ease' : 'none',
              minWidth: isMobile ? '120px' : 'auto',
              flexShrink: 0
            }}
            onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
            onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
          >
            <span style={{ fontSize: mobileOptimized.fontSize }}>
              {nodeType.icon}
            </span>
            <span style={{ 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {nodeType.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// 코드 뷰어 컴포넌트
const CodeViewer = ({ code, onCodeChange, isMobile }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      padding: 20,
      background: '#0f172a',
      color: '#f1f5f9',
      fontFamily: 'monospace',
      fontSize: isMobile ? 12 : 14,
      overflow: 'auto'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        paddingBottom: 10,
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <h3 style={{ margin: 0, color: '#3b82f6' }}>생성된 코드</h3>
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          style={{
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid #3b82f6',
            borderRadius: 6,
            color: '#3b82f6',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: 12
          }}
        >
          📋 복사
        </button>
      </div>
      
      <pre style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word'
      }}>
        {code}
      </pre>
    </div>
  );
};

// 게임 미리보기 컴포넌트
const GamePreview = ({ nodes, generatedCode, isMobile }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      padding: 20,
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 40,
        textAlign: 'center',
        maxWidth: isMobile ? '90%' : '500px'
      }}>
        <div style={{ fontSize: isMobile ? 48 : 64, marginBottom: 20 }}>🎮</div>
        <h3 style={{ 
          margin: 0, 
          color: '#ffffff', 
          fontSize: isMobile ? 18 : 24,
          marginBottom: 15 
        }}>
          게임 미리보기
        </h3>
        <p style={{ 
          color: '#cbd5e1', 
          fontSize: isMobile ? 14 : 16,
          marginBottom: 20,
          lineHeight: 1.6
        }}>
          현재 {nodes.length}개의 노드로 구성된 게임 로직이 있습니다.
          실제 게임 실행은 코드 생성 후 가능합니다.
        </p>
        
        {nodes.length > 0 && (
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 8,
            padding: 15,
            marginTop: 20
          }}>
            <h4 style={{ 
              color: '#22c55e', 
              fontSize: 14, 
              margin: '0 0 10px 0' 
            }}>
              노드 구성:
            </h4>
            {NODE_CATEGORIES.map(category => {
              const count = nodes.filter(node => 
                NODE_TYPES[category.id.toUpperCase()]?.[node.type]
              ).length;
              return count > 0 ? (
                <div key={category.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#e2e8f0',
                  fontSize: 12,
                  marginBottom: 4
                }}>
                  <span>{category.icon} {category.label}</span>
                  <span>{count}개</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// 노드 속성 패널
const NodePropertiesPanel = ({ node, onNodeUpdate, onClose, isMobile }) => {
  const [parameters, setParameters] = useState(node.data.parameters || {});
  
  const updateParameter = (key, value) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    
    const updatedNode = {
      ...node,
      data: {
        ...node.data,
        parameters: newParameters
      }
    };
    
    onNodeUpdate(updatedNode);
  };
  
  return (
    <div style={{
      position: isMobile ? 'fixed' : 'absolute',
      top: isMobile ? '50%' : '20px',
      right: isMobile ? '50%' : '20px',
      transform: isMobile ? 'translate(50%, -50%)' : 'none',
      width: isMobile ? '90%' : '250px',
      maxWidth: isMobile ? '350px' : 'none',
      background: 'rgba(15, 23, 42, 0.95)',
      border: '2px solid rgba(255,255,255,0.2)',
      borderRadius: 12,
      padding: 16,
      zIndex: 1001,
      boxShadow: '0 15px 35px -5px rgba(0,0,0,0.5)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <h4 style={{
          margin: 0,
          color: '#ffffff',
          fontSize: 16,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>{node.data.icon}</span>
          <span>{node.data.label}</span>
        </h4>
        
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: 6,
            color: '#ffffff',
            width: 24,
            height: 24,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14
          }}
        >
          ×
        </button>
      </div>
      
      {Object.entries(parameters).map(([key, value]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <label style={{
            display: 'block',
            color: '#e2e8f0',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 6
          }}>
            {key}
          </label>
          
          <input
            type={typeof value === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => updateParameter(
              key, 
              typeof value === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
            )}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: 14
            }}
          />
        </div>
      ))}
      
      {Object.keys(parameters).length === 0 && (
        <div style={{
          color: '#64748b',
          fontSize: 14,
          textAlign: 'center',
          fontStyle: 'italic'
        }}>
          이 노드에는 설정 가능한 매개변수가 없습니다.
        </div>
      )}
    </div>
  );
};

export default VisualNodeEditor;