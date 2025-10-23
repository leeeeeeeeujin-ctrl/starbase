/**
 * 🎮 AI 게임 개발 데모
 * FlexibleGameEngine + 수퍼베이스 + AI API 통합 데모
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  FlexibleGameEngine,
  GameFactory,
  GAME_STATES,
  SCORE_EVENTS,
} from '../game/FlexibleGameEngine';
import GameDatabaseService from '../../services/GameDatabaseService';
import styles from './AIGameDevDemo.module.css';

const AIGameDevDemo = () => {
  // 상태 관리
  const [gameEngine, setGameEngine] = useState(null);
  const [gameStats, setGameStats] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [userId, setUserId] = useState('demo-user-123');
  const [gameType, setGameType] = useState('text_game');
  const [databaseEnabled, setDatabaseEnabled] = useState(true);

  const engineRef = useRef(null);

  // 로그 추가 함수
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-19), { timestamp, message, type }]);
  };

  // 게임 엔진 생성
  const createGameEngine = async () => {
    try {
      addLog('🎮 게임 엔진 생성 중...', 'info');

      let engine;

      if (projectId && databaseEnabled) {
        // 프로젝트 기반 게임 생성
        engine = await GameFactory.createFromProject(projectId, userId);
        addLog(`📦 프로젝트 ${projectId} 기반 게임 생성됨`, 'success');
      } else {
        // 기본 게임 타입으로 생성
        const config = {
          playerId: userId,
          enableDatabase: databaseEnabled,
          projectId: projectId || null,
        };

        engine = GameFactory.createCustomGame(gameType, config);
        addLog(`🎯 ${gameType} 게임 생성됨`, 'success');
      }

      // 이벤트 핸들러 설정
      engine.on('gameStarted', data => {
        addLog(`🚀 게임 시작: 세션 ${data.sessionId || 'local'}`, 'success');
        setIsConnected(true);
      });

      engine.on('scoreChanged', data => {
        addLog(`📊 점수 변동: ${data.oldScore} → ${data.newScore} (${data.event})`, 'info');
        updateGameStats();
      });

      engine.on('gameEnded', data => {
        addLog(`🏁 게임 종료: ${data.reason} (최종점수: ${data.finalScore})`, 'warning');
        setIsConnected(false);
      });

      engine.on('variableChanged', data => {
        addLog(`📦 변수 변경: ${data.key} = ${JSON.stringify(data.value)}`, 'info');
      });

      if (databaseEnabled) {
        // 데이터베이스 실시간 구독 설정
        engine.setupDatabaseSubscriptions();
      }

      setGameEngine(engine);
      engineRef.current = engine;

      await updateGameStats();
    } catch (error) {
      addLog(`❌ 게임 엔진 생성 실패: ${error.message}`, 'error');
    }
  };

  // 게임 통계 업데이트
  const updateGameStats = async () => {
    if (engineRef.current) {
      try {
        const stats = await engineRef.current.getGameStats();
        setGameStats(stats);
      } catch (error) {
        console.error('통계 업데이트 오류:', error);
      }
    }
  };

  // 게임 시작
  const startGame = async () => {
    if (!gameEngine) {
      addLog('⚠️ 게임 엔진이 생성되지 않았습니다', 'warning');
      return;
    }

    try {
      const initialData = {
        playerName: 'AI Developer',
        gameMode: gameType,
        startTime: new Date().toISOString(),
      };

      await gameEngine.startGame(initialData);
      await updateGameStats();
    } catch (error) {
      addLog(`❌ 게임 시작 실패: ${error.message}`, 'error');
    }
  };

  // 점수 이벤트 테스트
  const triggerScoreEvent = async (eventType, amount = null) => {
    if (!gameEngine || gameEngine.gameState.status !== GAME_STATES.ACTIVE) {
      addLog('⚠️ 게임이 활성화되지 않았습니다', 'warning');
      return;
    }

    try {
      const result = await gameEngine.updateScore(eventType, amount, `테스트 이벤트: ${eventType}`);

      if (result) {
        addLog(`✅ 점수 이벤트 처리됨: ${eventType}`, 'success');
      }
    } catch (error) {
      addLog(`❌ 점수 이벤트 실패: ${error.message}`, 'error');
    }
  };

  // 게임 변수 설정
  const setGameVariable = async () => {
    if (!gameEngine) {
      addLog('⚠️ 게임 엔진이 없습니다', 'warning');
      return;
    }

    const testData = {
      playerLevel: Math.floor(Math.random() * 10) + 1,
      inventory: ['sword', 'potion', 'key'],
      lastAction: new Date().toISOString(),
    };

    try {
      await gameEngine.setVariable('testData', testData, 'session');
      addLog('📦 게임 변수 설정됨', 'success');
      await updateGameStats();
    } catch (error) {
      addLog(`❌ 변수 설정 실패: ${error.message}`, 'error');
    }
  };

  // 게임 종료
  const endGame = async () => {
    if (!gameEngine) {
      addLog('⚠️ 게임 엔진이 없습니다', 'warning');
      return;
    }

    try {
      const result = await gameEngine.endGame('manual', {
        reason: '수동 종료',
        timestamp: new Date().toISOString(),
      });

      if (result) {
        addLog(`🏁 게임 종료 완료`, 'success');
        await updateGameStats();
      }
    } catch (error) {
      addLog(`❌ 게임 종료 실패: ${error.message}`, 'error');
    }
  };

  // 프로젝트 생성 테스트
  const createTestProject = async () => {
    try {
      addLog('📁 테스트 프로젝트 생성 중...', 'info');

      const projectData = {
        name: `AI 게임 테스트 ${Date.now()}`,
        type: gameType,
        settings: {
          difficulty: 'normal',
          theme: 'sci-fi',
        },
      };

      const result = await GameDatabaseService.createProject(projectData);

      if (result.success) {
        setProjectId(result.projectId);
        addLog(`📦 프로젝트 생성됨: ${result.projectId}`, 'success');
      } else {
        addLog(`❌ 프로젝트 생성 실패: ${result.error}`, 'error');
      }
    } catch (error) {
      addLog(`❌ 프로젝트 생성 오류: ${error.message}`, 'error');
    }
  };

  // 로그 클리어
  const clearLogs = () => {
    setLogs([]);
    addLog('🧹 로그가 클리어되었습니다', 'info');
  };

  // 초기화
  useEffect(() => {
    addLog('🎮 AI 게임 개발 데모 시작', 'success');
    return () => {
      // 정리 작업
      if (engineRef.current && engineRef.current.dbSubscriptions) {
        Object.values(engineRef.current.dbSubscriptions).forEach(sub => {
          if (sub && sub.unsubscribe) {
            sub.unsubscribe();
          }
        });
      }
    };
  }, []);

  return (
    <div className={styles.container}>
      <h2>🎮 AI 게임 개발 데모</h2>
      <p>FlexibleGameEngine + 수퍼베이스 + AI API 통합 테스트</p>

      {/* 설정 패널 */}
      <div className={styles.configPanel}>
        <h3>⚙️ 설정</h3>

        <div className={styles.configRow}>
          <label>게임 타입:</label>
          <select
            value={gameType}
            onChange={e => setGameType(e.target.value)}
            disabled={isConnected}
          >
            <option value="text_game">텍스트 게임</option>
            <option value="battle_game">배틀 게임</option>
            <option value="puzzle_game">퍼즐 게임</option>
            <option value="rpg_game">RPG 게임</option>
            <option value="survival_game">생존 게임</option>
          </select>
        </div>

        <div className={styles.configRow}>
          <label>프로젝트 ID:</label>
          <input
            type="text"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            placeholder="프로젝트 ID (선택사항)"
            disabled={isConnected}
          />
          <button onClick={createTestProject} disabled={isConnected}>
            테스트 프로젝트 생성
          </button>
        </div>

        <div className={styles.configRow}>
          <label>
            <input
              type="checkbox"
              checked={databaseEnabled}
              onChange={e => setDatabaseEnabled(e.target.checked)}
              disabled={isConnected}
            />
            데이터베이스 사용
          </label>
        </div>
      </div>

      {/* 컨트롤 패널 */}
      <div className={styles.controlPanel}>
        <h3>🎯 컨트롤</h3>

        <div className={styles.buttonGroup}>
          <button onClick={createGameEngine} disabled={isConnected}>
            게임 엔진 생성
          </button>
          <button onClick={startGame} disabled={!gameEngine || isConnected}>
            게임 시작
          </button>
          <button onClick={endGame} disabled={!isConnected}>
            게임 종료
          </button>
        </div>

        <div className={styles.buttonGroup}>
          <button onClick={() => triggerScoreEvent(SCORE_EVENTS.WIN)} disabled={!isConnected}>
            승리 (+점수)
          </button>
          <button onClick={() => triggerScoreEvent(SCORE_EVENTS.LOSE)} disabled={!isConnected}>
            패배 (-점수)
          </button>
          <button
            onClick={() => triggerScoreEvent(SCORE_EVENTS.ACHIEVEMENT)}
            disabled={!isConnected}
          >
            업적 달성
          </button>
          <button onClick={() => triggerScoreEvent(SCORE_EVENTS.BONUS, 75)} disabled={!isConnected}>
            보너스 (+75)
          </button>
        </div>

        <div className={styles.buttonGroup}>
          <button onClick={setGameVariable} disabled={!gameEngine}>
            게임 변수 설정
          </button>
          <button onClick={updateGameStats} disabled={!gameEngine}>
            통계 새로고침
          </button>
          <button onClick={clearLogs}>로그 클리어</button>
        </div>
      </div>

      {/* 게임 상태 */}
      <div className={styles.statusPanel}>
        <h3>📊 게임 상태</h3>
        {gameStats ? (
          <div className={styles.stats}>
            <div className={styles.statRow}>
              <span>상태:</span>
              <span className={isConnected ? styles.active : styles.inactive}>
                {gameStats.status}
              </span>
            </div>
            <div className={styles.statRow}>
              <span>점수:</span>
              <span>{gameStats.currentScore}</span>
            </div>
            <div className={styles.statRow}>
              <span>턴:</span>
              <span>{gameStats.currentTurn}</span>
            </div>
            <div className={styles.statRow}>
              <span>시간:</span>
              <span>{Math.floor(gameStats.duration / 1000)}초</span>
            </div>
            <div className={styles.statRow}>
              <span>DB 연동:</span>
              <span className={gameStats.enableDatabase ? styles.enabled : styles.disabled}>
                {gameStats.enableDatabase ? '활성' : '비활성'}
              </span>
            </div>
            {gameStats.sessionId && (
              <div className={styles.statRow}>
                <span>세션 ID:</span>
                <span className={styles.sessionId}>{gameStats.sessionId.slice(0, 8)}...</span>
              </div>
            )}
          </div>
        ) : (
          <p>게임 엔진을 생성하세요</p>
        )}
      </div>

      {/* 로그 */}
      <div className={styles.logPanel}>
        <h3>📝 로그</h3>
        <div className={styles.logContainer}>
          {logs.map((log, index) => (
            <div key={index} className={`${styles.logEntry} ${styles[log.type]}`}>
              <span className={styles.timestamp}>{log.timestamp}</span>
              <span className={styles.message}>{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AIGameDevDemo;
