import React, { useState, useCallback } from 'react'
import AIBattleGameLauncher from './AIBattleGameLauncher'
import AIBattleArena from './AIBattleArena'

/**
 * AI 배틀 게임 통합 컨트롤러
 * 
 * 캐릭터 선택 → 게임 시작 → 배틀 진행 → 결과 처리의 전체 플로우를 관리
 */
export default function AIBattleGameController({
  availableCharacters = [], // CharacterDashboard에서 전달받는 캐릭터 목록
  onClose,
  onBattleResult,
}) {
  const [gameState, setGameState] = useState('launcher') // launcher, battle, result
  const [gameData, setGameData] = useState(null)
  const [battleResult, setBattleResult] = useState(null)

  // 게임 시작
  const handleGameStart = useCallback((launchData) => {
    setGameData(launchData)
    setGameState('battle')
  }, [])

  // 배틀 종료
  const handleBattleEnd = useCallback((result) => {
    setBattleResult(result)
    setGameState('result')
    
    // 상위 컴포넌트에 결과 전달
    if (onBattleResult) {
      onBattleResult(result)
    }
  }, [onBattleResult])

  // 게임 재시작
  const handleRestart = useCallback(() => {
    setGameData(null)
    setBattleResult(null)
    setGameState('launcher')
  }, [])

  // 게임 종료
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose(battleResult)
    }
  }, [onClose, battleResult])

  if (gameState === 'launcher') {
    return (
      <AIBattleGameLauncher
        availableCharacters={availableCharacters}
        onGameStart={handleGameStart}
        onCancel={handleClose}
      />
    )
  }

  if (gameState === 'battle' && gameData) {
    return (
      <AIBattleArena
        gameId={`battle_${Date.now()}`}
        characters={gameData.characters}
        gameMode={gameData.gameMode}
        battleSettings={gameData.battleSettings}
        onBattleEnd={handleBattleEnd}
      />
    )
  }

  if (gameState === 'result' && battleResult) {
    return (
      <BattleResultScreen
        result={battleResult}
        onRestart={handleRestart}
        onClose={handleClose}
      />
    )
  }

  return null
}

/**
 * 배틀 결과 화면
 */
function BattleResultScreen({ result, onRestart, onClose }) {
  const styles = {
    screen: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.95)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    },
    card: {
      background: 'rgba(15, 23, 42, 0.95)',
      borderRadius: '24px',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      padding: '40px',
      maxWidth: '500px',
      width: '100%',
      textAlign: 'center',
    },
    title: {
      color: '#38bdf8',
      fontSize: '32px',
      fontWeight: 'bold',
      marginBottom: '16px',
    },
    winner: {
      color: 'white',
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '24px',
    },
    stats: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '16px',
      marginBottom: '32px',
    },
    statItem: {
      background: 'rgba(56, 189, 248, 0.1)',
      borderRadius: '12px',
      padding: '16px',
    },
    statLabel: {
      color: '#94a3b8',
      fontSize: '14px',
      marginBottom: '4px',
    },
    statValue: {
      color: 'white',
      fontSize: '20px',
      fontWeight: 'bold',
    },
    logSection: {
      marginBottom: '32px',
      maxHeight: '200px',
      overflowY: 'auto',
    },
    logTitle: {
      color: '#e2e8f0',
      fontSize: '18px',
      fontWeight: 'bold',
      marginBottom: '12px',
    },
    logEntry: {
      background: 'rgba(0,0,0,0.3)',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
      textAlign: 'left',
    },
    logTurn: {
      color: '#38bdf8',
      fontSize: '12px',
      fontWeight: 'bold',
    },
    logText: {
      color: '#cbd5e1',
      fontSize: '14px',
      marginTop: '4px',
    },
    actions: {
      display: 'flex',
      gap: '16px',
      justifyContent: 'center',
    },
    button: {
      padding: '12px 24px',
      borderRadius: '12px',
      border: 'none',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    restartButton: {
      background: 'rgba(34, 197, 94, 0.2)',
      color: '#22c55e',
      border: '1px solid rgba(34, 197, 94, 0.3)',
    },
    closeButton: {
      background: 'rgba(148, 163, 184, 0.2)',
      color: '#94a3b8',
      border: '1px solid rgba(148, 163, 184, 0.3)',
    },
  }

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <h1 style={styles.title}>배틀 종료!</h1>
        
        {result.winner && (
          <div style={styles.winner}>🏆 {result.winner} 승리!</div>
        )}
        
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <div style={styles.statLabel}>총 턴 수</div>
            <div style={styles.statValue}>{result.turns}턴</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statLabel}>배틀 로그</div>
            <div style={styles.statValue}>{result.battleLog?.length || 0}개</div>
          </div>
        </div>
        
        {result.battleLog && result.battleLog.length > 0 && (
          <div style={styles.logSection}>
            <h3 style={styles.logTitle}>배틀 하이라이트</h3>
            {result.battleLog.slice(-5).map((entry, index) => (
              <div key={index} style={styles.logEntry}>
                <div style={styles.logTurn}>
                  턴 {entry.turn} - {entry.character}
                </div>
                <div style={styles.logText}>
                  {entry.action}: {entry.aiResponse}
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div style={styles.actions}>
          <button
            style={{...styles.button, ...styles.restartButton}}
            onClick={onRestart}
          >
            다시 배틀
          </button>
          <button
            style={{...styles.button, ...styles.closeButton}}
            onClick={onClose}
          >
            종료
          </button>
        </div>
      </div>
    </div>
  )
}