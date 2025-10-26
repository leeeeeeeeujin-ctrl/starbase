import React, { useState, useEffect, useRef } from 'react';
import { MobileOptimizationManager } from '../../services/MobileOptimizationManager';
import { GameResourceManager } from '../../services/GameResourceManager';

/**
 * 핵심 AI 배틀 아레나 - 단순화된 모바일 친화적 AI 배틀 시스템
 *
 * 특징:
 * - 사전 설정된 캐릭터 기반 AI 판정 시스템
 * - 모바일 최적화된 간편 액션 입력
 * - 비주얼 응답 출력 시스템
 * - 조건별 동적 UI 변화
 * - 캐릭터별 배경/BGM 자동 적용
 */
export default function AIBattleArena({
  gameId,
  characters = [], // 사전 설정된 캐릭터 데이터들
  gameMode = '1v1',
  battleSettings = {},
  onBattleEnd,
}) {
  const [battleState, setBattleState] = useState({
    phase: 'preparation', // preparation, battle, result
    currentTurn: 1,
    activeCharacter: null,
    battleLog: [],
    winner: null,
    isProcessing: false,
  });

  const [visualState, setVisualState] = useState({
    backgroundImage: gameSettings.background || '/default-battle-bg.jpg',
    characterPositions: {},
    effects: [],
    displayMode: 'cards', // cards, portraits, minimal
  });

  const [actionInput, setActionInput] = useState({
    selectedAction: null,
    customPrompt: '',
    showActionPanel: false,
  });

  const mobileManager = useRef(new MobileOptimizationManager());
  const resourceManager = useRef(new GameResourceManager());

  useEffect(() => {
    // 모바일 최적화 초기화
    mobileManager.current.initializeOptimizations();

    // 캐릭터 배치 초기화
    initializeCharacterPositions();

    // 캐릭터별 배경/BGM 설정 적용
    applyCharacterThemes();
  }, []);

  const applyCharacterThemes = () => {
    // 첫 번째 캐릭터의 배경과 BGM을 적용하거나 게임 설정 사용
    const primaryChar = characters[0];
    if (primaryChar) {
      setVisualState(prev => ({
        ...prev,
        backgroundImage:
          primaryChar.background || battleSettings.background || '/default-battle-bg.jpg',
      }));

      // BGM 적용 (있다면)
      if (primaryChar.bgm) {
        playBackgroundMusic(primaryChar.bgm);
      }
    }
  };

  const playBackgroundMusic = bgmUrl => {
    try {
      const audio = new Audio(bgmUrl);
      audio.loop = true;
      audio.volume = 0.3;
      audio.play().catch(err => {
        console.log('BGM 자동 재생이 차단되었습니다:', err);
      });
    } catch (error) {
      console.error('BGM 재생 오류:', error);
    }
  };

  const initializeCharacterPositions = () => {
    const positions = {};
    characters.forEach((character, index) => {
      positions[character.id] = {
        x: index % 2 === 0 ? '20%' : '80%',
        y: 50 + index * 10 + '%',
        scale: 1,
        opacity: 1,
      };
    });
    setVisualState(prev => ({ ...prev, characterPositions: positions }));
  };

  // AI 판정 시스템
  const processAIBattle = async (playerAction, character) => {
    setBattleState(prev => ({ ...prev, isProcessing: true }));

    try {
      // 캐릭터 정보와 액션을 AI에게 전달
      const battleContext = {
        character: character,
        action: playerAction,
        turn: battleState.currentTurn,
        gameSettings: gameSettings,
        previousTurns: battleState.battleLog.slice(-3), // 최근 3턴만 참조
      };

      const aiResponse = await submitBattleAction(battleContext);

      // 배틀 로그 업데이트
      const newLogEntry = {
        turn: battleState.currentTurn,
        character: character.name,
        action: playerAction.text || playerAction.type,
        aiResponse: aiResponse.narrative,
        result: aiResponse.result,
        timestamp: new Date().toISOString(),
      };

      setBattleState(prev => ({
        ...prev,
        battleLog: [...prev.battleLog, newLogEntry],
        currentTurn: prev.currentTurn + 1,
        isProcessing: false,
      }));

      // 비주얼 효과 적용
      applyBattleEffects(aiResponse);

      // 승부 판정
      if (aiResponse.battleEnd) {
        endBattle(aiResponse.winner);
      }
    } catch (error) {
      console.error('AI 배틀 처리 중 오류:', error);
      setBattleState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const submitBattleAction = async context => {
    // 실제 AI API 호출 로직
    const response = await fetch('/api/ai-battle-judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });

    if (!response.ok) throw new Error('AI 판정 실패');
    return response.json();
  };

  const applyBattleEffects = aiResponse => {
    // 캐릭터 위치/스케일 변경
    if (aiResponse.effects?.characterEffects) {
      const newPositions = { ...visualState.characterPositions };

      aiResponse.effects.characterEffects.forEach(effect => {
        if (newPositions[effect.characterId]) {
          newPositions[effect.characterId] = {
            ...newPositions[effect.characterId],
            ...effect.changes,
          };
        }
      });

      setVisualState(prev => ({ ...prev, characterPositions: newPositions }));
    }

    // 일시적 시각 효과
    if (aiResponse.effects?.visualEffects) {
      setVisualState(prev => ({
        ...prev,
        effects: [...prev.effects, ...aiResponse.effects.visualEffects],
      }));

      // 3초 후 효과 제거
      setTimeout(() => {
        setVisualState(prev => ({
          ...prev,
          effects: prev.effects.filter(
            effect => !aiResponse.effects.visualEffects.includes(effect)
          ),
        }));
      }, 3000);
    }
  };

  const endBattle = winner => {
    setBattleState(prev => ({
      ...prev,
      phase: 'result',
      winner: winner,
    }));

    if (onBattleEnd) {
      onBattleEnd({
        winner,
        battleLog: battleState.battleLog,
        turns: battleState.currentTurn,
      });
    }
  };

  const styles = {
    arena: {
      position: 'relative',
      width: '100%',
      height: '100vh',
      background: `url("${visualState.backgroundImage}") center/cover`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    battleField: {
      flex: 1,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    character: {
      position: 'absolute',
      width: '120px',
      height: '160px',
      borderRadius: '16px',
      background: 'rgba(0,0,0,0.8)',
      border: '2px solid #38bdf8',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.5s ease',
      cursor: 'pointer',
    },
    characterImage: {
      width: '80px',
      height: '80px',
      borderRadius: '12px',
      objectFit: 'cover',
      marginBottom: '8px',
    },
    characterName: {
      color: 'white',
      fontSize: '14px',
      fontWeight: 'bold',
      textAlign: 'center',
    },
    characterHp: {
      color: '#38bdf8',
      fontSize: '12px',
    },
    actionPanel: {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'rgba(0,0,0,0.9)',
      backdrop: 'blur(10px)',
      padding: '20px',
      borderTopLeftRadius: '20px',
      borderTopRightRadius: '20px',
      borderTop: '1px solid rgba(56, 189, 248, 0.3)',
    },
    actionGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
      marginBottom: '16px',
    },
    actionButton: {
      padding: '16px',
      borderRadius: '12px',
      border: '1px solid rgba(56, 189, 248, 0.5)',
      background: 'rgba(56, 189, 248, 0.1)',
      color: 'white',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      textAlign: 'center',
    },
    narrativePanel: {
      position: 'absolute',
      top: '20px',
      left: '20px',
      right: '20px',
      background: 'rgba(0,0,0,0.8)',
      borderRadius: '16px',
      padding: '16px',
      color: 'white',
      maxHeight: '200px',
      overflowY: 'auto',
    },
    turnInfo: {
      background: 'rgba(56, 189, 248, 0.2)',
      padding: '8px 16px',
      borderRadius: '20px',
      color: '#38bdf8',
      fontSize: '14px',
      fontWeight: 'bold',
      marginBottom: '12px',
      textAlign: 'center',
    },
    processingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '18px',
      fontWeight: 'bold',
    },
  };

  // 캐릭터별 동적 액션 생성
  const generateQuickActions = character => {
    if (!character) return [];

    const baseActions = [
      { type: 'attack', text: '⚔️ 공격', prompt: '상대를 공격합니다' },
      { type: 'defend', text: '🛡️ 방어', prompt: '방어 태세를 취합니다' },
    ];

    // 캐릭터의 abilities를 기반으로 특별 액션 추가
    const abilityActions = character.abilities.slice(0, 2).map((ability, index) => ({
      type: `ability${index + 1}`,
      text: `✨ ${ability.substring(0, 6)}`,
      prompt: `${ability}를 사용합니다`,
      ability: ability,
    }));

    return [...baseActions, ...abilityActions];
  };

  const handleActionSelect = action => {
    if (battleState.isProcessing) return;

    const activeChar = characters.find(c => c.id === battleState.activeCharacter);
    if (!activeChar) return;

    processAIBattle(action, activeChar);
  };

  // 현재 활성 캐릭터의 액션들
  const currentQuickActions = () => {
    const activeChar = characters.find(c => c.id === battleState.activeCharacter);
    return generateQuickActions(activeChar);
  };

  const renderCharacters = () => {
    return characters.map(character => {
      const position = visualState.characterPositions[character.id] || {};

      return (
        <div
          key={character.id}
          style={{
            ...styles.character,
            left: position.x,
            top: position.y,
            transform: `scale(${position.scale || 1})`,
            opacity: position.opacity || 1,
          }}
          onClick={() =>
            setBattleState(prev => ({
              ...prev,
              activeCharacter: character.id,
            }))
          }
        >
          {character.image ? (
            <img src={character.image} alt={character.name} style={styles.characterImage} />
          ) : (
            <div style={styles.characterImage} />
          )}
          <div style={styles.characterName}>{character.name}</div>
          <div style={styles.characterHp}>HP: {character.hp || 100}</div>
        </div>
      );
    });
  };

  const renderNarrative = () => {
    const lastEntry = battleState.battleLog[battleState.battleLog.length - 1];
    if (!lastEntry) return null;

    return (
      <div style={styles.narrativePanel}>
        <div style={styles.turnInfo}>
          턴 {lastEntry.turn} - {lastEntry.character}
        </div>
        <div>{lastEntry.aiResponse}</div>
      </div>
    );
  };

  if (battleState.phase === 'preparation') {
    return (
      <div style={styles.arena}>
        <div style={styles.battleField}>
          {renderCharacters()}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: 'white',
            }}
          >
            <h2>배틀 준비</h2>
            <p>캐릭터를 선택하고 배틀을 시작하세요</p>
            <button
              onClick={() =>
                setBattleState(prev => ({
                  ...prev,
                  phase: 'battle',
                  activeCharacter: characters[0]?.id,
                }))
              }
              style={{
                ...styles.actionButton,
                marginTop: '20px',
                width: '200px',
              }}
            >
              배틀 시작
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.arena}>
      <div style={styles.battleField}>
        {renderCharacters()}
        {renderNarrative()}

        {/* 시각 효과들 */}
        {visualState.effects.map((effect, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              ...effect.style,
              animation: effect.animation,
              pointerEvents: 'none',
            }}
          >
            {effect.content}
          </div>
        ))}
      </div>

      {/* 액션 패널 */}
      {battleState.phase === 'battle' && (
        <div style={styles.actionPanel}>
          <div style={styles.turnInfo}>턴 {battleState.currentTurn} - AI가 판정을 내립니다</div>
          <div style={styles.actionGrid}>
            {currentQuickActions().map(action => (
              <button
                key={action.type}
                style={{
                  ...styles.actionButton,
                  opacity: battleState.isProcessing ? 0.5 : 1,
                  ...(action.ability
                    ? {
                        background: 'rgba(168, 85, 247, 0.2)',
                        borderColor: 'rgba(168, 85, 247, 0.5)',
                      }
                    : {}),
                }}
                onClick={() => handleActionSelect(action)}
                disabled={battleState.isProcessing}
                title={action.ability || action.prompt}
              >
                {action.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 처리 중 오버레이 */}
      {battleState.isProcessing && (
        <div style={styles.processingOverlay}>
          <div>
            <div>AI가 판정 중입니다...</div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>잠시만 기다려주세요</div>
          </div>
        </div>
      )}
    </div>
  );
}
