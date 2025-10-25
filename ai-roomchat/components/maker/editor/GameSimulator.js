// components/maker/editor/GameSimulator.js
// 실제 게임 엔진과 동일한 환경의 시뮬레이션 시스템

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';

export default function GameSimulator({
  visible = false,
  gameData = null, // Maker JSON 스키마 데이터
  onClose,
  onSimulationResult,
}) {
  const [simulationState, setSimulationState] = useState({
    running: false,
    currentTurn: 0,
    currentNodeId: null,
    participants: [],
    logs: [],
    variables: {},
    turnHistory: [],
  });

  // AI 테스트 플레이어들 생성
  const createTestPlayers = useCallback(() => {
    return [
      {
        id: 'ai_player_1',
        name: 'AI 플레이어 1',
        type: 'ai',
        personality: 'aggressive', // 공격적 성향
        stats: { hp: 100, attack: 20, defense: 15, magic: 10 },
      },
      {
        id: 'ai_player_2',
        name: 'AI 플레이어 2',
        type: 'ai',
        personality: 'defensive', // 방어적 성향
        stats: { hp: 120, attack: 15, defense: 25, magic: 5 },
      },
      {
        id: 'user_test',
        name: '테스트 사용자',
        type: 'human',
        personality: 'balanced',
        stats: { hp: 110, attack: 18, defense: 20, magic: 8 },
      },
    ];
  }, []);

  // 게임 시뮬레이션 시작
  const startSimulation = useCallback(() => {
    if (!gameData || !gameData.slots) {
      alert('게임 데이터가 없습니다. 먼저 프롬프트를 생성하세요.');
      return;
    }

    const testPlayers = createTestPlayers();

    // 시작 슬롯 찾기 (is_start: true)
    const startSlot = gameData.slots.find(slot => slot.is_start || slot.isStart);
    if (!startSlot) {
      alert('시작 슬롯을 찾을 수 없습니다. is_start: true인 슬롯이 필요합니다.');
      return;
    }

    setSimulationState({
      running: true,
      currentTurn: 1,
      currentNodeId: startSlot.slot_no || startSlot.slotNo,
      participants: testPlayers,
      logs: [
        {
          turn: 0,
          type: 'system',
          message: `🎮 게임 시뮬레이션 시작!\\n참가자: ${testPlayers.map(p => p.name).join(', ')}`,
          timestamp: new Date().toISOString(),
        },
      ],
      variables: initializeVariables(gameData),
      turnHistory: [],
    });

    // 첫 번째 턴 실행
    executeGameTurn(startSlot, testPlayers[0], testPlayers);
  }, [gameData, createTestPlayers]);

  // 변수 초기화
  const initializeVariables = useCallback(gameData => {
    const variables = {};

    // 전역 변수 추출
    gameData.slots?.forEach(slot => {
      const globalRules = slot.var_rules_global || slot.varRulesGlobal || {};
      Object.keys(globalRules).forEach(varName => {
        if (!variables[varName]) {
          variables[varName] = globalRules[varName].defaultValue || 0;
        }
      });
    });

    return variables;
  }, []);

  // 게임 턴 실행
  const executeGameTurn = useCallback(
    (currentSlot, activePlayer, allPlayers) => {
      console.log('🎯 턴 실행:', currentSlot, activePlayer);

      // 프롬프트 템플릿에서 변수 치환
      let processedPrompt = currentSlot.template || '';

      // 기본 변수 치환
      processedPrompt = processedPrompt.replace(/\{player_name\}/g, activePlayer.name);
      processedPrompt = processedPrompt.replace(/\{player_hp\}/g, activePlayer.stats.hp);
      processedPrompt = processedPrompt.replace(/\{turn\}/g, simulationState.currentTurn);

      // AI 플레이어 응답 생성
      const aiResponse = generateAIResponse(currentSlot, activePlayer, processedPrompt);

      // 로그 추가
      setSimulationState(prev => ({
        ...prev,
        logs: [
          ...prev.logs,
          {
            turn: prev.currentTurn,
            type: currentSlot.slot_type || 'ai',
            player: activePlayer.name,
            prompt: processedPrompt,
            response: aiResponse,
            timestamp: new Date().toISOString(),
          },
        ],
        turnHistory: [
          ...prev.turnHistory,
          {
            slotId: currentSlot.slot_no,
            playerId: activePlayer.id,
            response: aiResponse,
          },
        ],
      }));

      // 다음 슬롯으로 이동 결정
      setTimeout(() => {
        const nextSlot = determineNextSlot(currentSlot, aiResponse, gameData);
        if (nextSlot) {
          const nextPlayer = getNextPlayer(activePlayer, allPlayers);
          executeGameTurn(nextSlot, nextPlayer, allPlayers);
        } else {
          endSimulation('게임 완료!');
        }
      }, 1500); // 1.5초 간격으로 턴 진행
    },
    [gameData, simulationState]
  );

  // AI 응답 생성 (간단한 룰 기반)
  const generateAIResponse = useCallback((slot, player, prompt) => {
    const slotType = slot.slot_type || slot.slotType || 'ai';

    if (slotType === 'user_action' || slotType === 'user') {
      // 유저 액션 슬롯: 플레이어 성향에 따른 선택
      const choices = ['공격한다', '방어한다', '마법을 사용한다', '아이템을 사용한다'];

      if (player.personality === 'aggressive') {
        return Math.random() > 0.3
          ? '공격한다'
          : choices[Math.floor(Math.random() * choices.length)];
      } else if (player.personality === 'defensive') {
        return Math.random() > 0.3
          ? '방어한다'
          : choices[Math.floor(Math.random() * choices.length)];
      } else {
        return choices[Math.floor(Math.random() * choices.length)];
      }
    } else if (slotType === 'system') {
      // 시스템 슬롯: 게임 상태 업데이트
      return `시스템: ${player.name}의 행동이 처리되었습니다.`;
    } else {
      // AI 슬롯: 상황에 맞는 AI 응답
      const responses = [
        `${player.name}이(가) 주변을 살펴봅니다.`,
        `${player.name}이(가) 전투 준비를 합니다.`,
        `${player.name}이(가) 상대의 움직임을 관찰합니다.`,
        `${player.name}이(가) 마법 에너지를 집중합니다.`,
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }, []);

  // 다음 슬롯 결정 (브리지 로직)
  const determineNextSlot = useCallback((currentSlot, response, gameData) => {
    // 브리지 확인
    const bridges = gameData.bridges || [];
    const applicableBridge = bridges.find(bridge => {
      const fromId = bridge.from_slot_id || bridge.fromSlotId;
      return fromId == currentSlot.slot_no || fromId == currentSlot.slotNo;
    });

    if (applicableBridge) {
      const toId = applicableBridge.to_slot_id || applicableBridge.toSlotId;
      return gameData.slots.find(slot => slot.slot_no == toId || slot.slotNo == toId);
    }

    // 브리지가 없으면 다음 순번 슬롯
    const currentIndex = gameData.slots.findIndex(
      slot => slot.slot_no == currentSlot.slot_no || slot.slotNo == currentSlot.slotNo
    );

    return gameData.slots[currentIndex + 1] || null;
  }, []);

  // 다음 플레이어 선택
  const getNextPlayer = useCallback((currentPlayer, allPlayers) => {
    const currentIndex = allPlayers.findIndex(p => p.id === currentPlayer.id);
    return allPlayers[(currentIndex + 1) % allPlayers.length];
  }, []);

  // 시뮬레이션 종료
  const endSimulation = useCallback(
    reason => {
      setSimulationState(prev => ({
        ...prev,
        running: false,
        logs: [
          ...prev.logs,
          {
            turn: prev.currentTurn,
            type: 'system',
            message: `🏁 ${reason}`,
            timestamp: new Date().toISOString(),
          },
        ],
      }));

      if (onSimulationResult) {
        onSimulationResult({
          success: true,
          logs: simulationState.logs,
          finalState: simulationState,
        });
      }
    },
    [simulationState, onSimulationResult]
  );

  // 시뮬레이션 중지
  const stopSimulation = useCallback(() => {
    endSimulation('사용자가 중지했습니다.');
  }, [endSimulation]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.95)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        color: '#f8fafc',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🎮 게임 시뮬레이션 테스터</h2>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={simulationState.running ? stopSimulation : startSimulation}
            disabled={!gameData}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: simulationState.running ? '#ef4444' : '#10b981',
              color: '#fff',
              fontWeight: 600,
              cursor: gameData ? 'pointer' : 'not-allowed',
              opacity: gameData ? 1 : 0.5,
            }}
          >
            {simulationState.running ? '🛑 중지' : '▶️ 시작'}
          </button>

          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid #64748b',
              background: 'transparent',
              color: '#e2e8f0',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✕ 닫기
          </button>
        </div>
      </div>

      {/* 메인 영역 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 게임 상태 패널 */}
        <div
          style={{
            width: 300,
            borderRight: '1px solid rgba(148, 163, 184, 0.3)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px',
              background: '#1e293b',
              borderBottom: '1px solid rgba(148, 163, 184, 0.3)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, marginBottom: 12 }}>🎯 게임 상태</h3>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              <div>턴: {simulationState.currentTurn}</div>
              <div>현재 노드: {simulationState.currentNodeId || '없음'}</div>
              <div>상태: {simulationState.running ? '🔥 실행 중' : '⏸️ 대기 중'}</div>
            </div>
          </div>

          <div
            style={{
              padding: '16px',
              background: '#1e293b',
              borderBottom: '1px solid rgba(148, 163, 184, 0.3)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, marginBottom: 12 }}>👥 참가자</h3>
            {simulationState.participants.map((player, index) => (
              <div
                key={player.id}
                style={{
                  padding: '8px',
                  background: 'rgba(15, 23, 42, 0.5)',
                  borderRadius: 8,
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600 }}>{player.name}</div>
                <div style={{ opacity: 0.7 }}>
                  HP: {player.stats.hp} | 공격: {player.stats.attack}
                </div>
              </div>
            ))}
          </div>

          {/* 게임 정보 */}
          {gameData && (
            <div style={{ padding: '16px', fontSize: 13, opacity: 0.8 }}>
              <div>슬롯 개수: {gameData.slots?.length || 0}</div>
              <div>브리지 개수: {gameData.bridges?.length || 0}</div>
            </div>
          )}
        </div>

        {/* 시뮬레이션 로그 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: '#1e293b',
              borderBottom: '1px solid rgba(148, 163, 184, 0.3)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            📊 시뮬레이션 로그
          </div>

          <div
            style={{
              flex: 1,
              padding: 16,
              overflow: 'auto',
              background: '#020617',
            }}
          >
            {simulationState.logs.length === 0 ? (
              <div
                style={{
                  color: '#64748b',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  marginTop: 40,
                }}
              >
                시뮬레이션을 시작하면 로그가 표시됩니다...
              </div>
            ) : (
              simulationState.logs.map((log, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    background:
                      log.type === 'system' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    borderRadius: 8,
                    borderLeft: `3px solid ${log.type === 'system' ? '#3b82f6' : '#10b981'}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                      marginBottom: 4,
                    }}
                  >
                    턴 {log.turn} • {log.player || log.type}
                  </div>

                  {log.prompt && (
                    <div
                      style={{
                        fontSize: 13,
                        marginBottom: 8,
                        padding: 8,
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 4,
                        fontStyle: 'italic',
                      }}
                    >
                      📝 {log.prompt}
                    </div>
                  )}

                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{log.response || log.message}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
