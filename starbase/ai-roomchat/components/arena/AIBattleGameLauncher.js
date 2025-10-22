import React, { useState, useEffect, useRef } from 'react'

/**
 * 캐릭터 사전 설정 시스템과 연동된 AI 배틀 게임 런처
 * 
 * 특징:
 * - 게임 시작 전 미리 정의된 캐릭터 데이터 활용
 * - 캐릭터별 능력치, 이미지, 배경, BGM 자동 적용
 * - 간편한 게임 시작 플로우
 */
export default function AIBattleGameLauncher({
  availableCharacters = [], // 사전 설정된 캐릭터들
  gameSettings = {},
  onGameStart,
  onCancel,
}) {
  const [selectedCharacters, setSelectedCharacters] = useState([])
  const [gameMode, setGameMode] = useState('1v1') // 1v1, 2v2, battle_royale
  const [battleSettings, setBattleSettings] = useState({
    turnLimit: 10,
    theme: gameSettings.theme || 'fantasy',
    environment: gameSettings.environment || 'arena',
  })

  // 캐릭터 선택 처리
  const handleCharacterToggle = (character) => {
    setSelectedCharacters(prev => {
      const isSelected = prev.find(c => c.id === character.id)
      
      if (isSelected) {
        return prev.filter(c => c.id !== character.id)
      } else {
        // 게임 모드에 따른 최대 캐릭터 수 제한
        const maxChars = gameMode === '1v1' ? 2 : gameMode === '2v2' ? 4 : 6
        if (prev.length >= maxChars) {
          alert(`${gameMode} 모드에서는 최대 ${maxChars}명까지만 선택할 수 있습니다.`)
          return prev
        }
        return [...prev, character]
      }
    })
  }

  // 게임 시작 처리
  const handleStartGame = () => {
    if (selectedCharacters.length < 2) {
      alert('최소 2명의 캐릭터를 선택해야 합니다.')
      return
    }

    // 캐릭터 데이터를 게임용 형태로 변환
    const gameCharacters = selectedCharacters.map(char => ({
      id: char.id,
      name: char.name,
      description: char.description,
      image: char.image_url,
      background: char.background_url,
      bgm: char.bgm_url,
      abilities: [
        char.ability1,
        char.ability2,
        char.ability3,
        char.ability4,
      ].filter(Boolean), // 빈 능력 제거
      
      // 게임용 추가 속성
      hp: 100,
      energy: 100,
      confidence: 50,
      
      // 능력치 파싱 (description에서 추출하거나 기본값 사용)
      stats: parseCharacterStats(char),
    }))

    if (onGameStart) {
      onGameStart({
        characters: gameCharacters,
        gameMode,
        battleSettings,
      })
    }
  }

  const styles = {
    launcher: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.9)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
    },
    header: {
      background: 'rgba(15, 23, 42, 0.95)',
      padding: '20px',
      borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
    },
    title: {
      color: 'white',
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '8px',
    },
    subtitle: {
      color: '#94a3b8',
      fontSize: '16px',
    },
    content: {
      flex: 1,
      padding: '20px',
      overflowY: 'auto',
    },
    section: {
      marginBottom: '32px',
    },
    sectionTitle: {
      color: '#38bdf8',
      fontSize: '18px',
      fontWeight: 'bold',
      marginBottom: '16px',
    },
    gameModeGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '12px',
      marginBottom: '20px',
    },
    modeButton: {
      padding: '16px',
      borderRadius: '12px',
      border: '2px solid rgba(56, 189, 248, 0.3)',
      background: 'rgba(56, 189, 248, 0.1)',
      color: 'white',
      fontSize: '14px',
      fontWeight: 'bold',
      cursor: 'pointer',
      textAlign: 'center',
      transition: 'all 0.2s ease',
    },
    modeButtonActive: {
      borderColor: '#38bdf8',
      background: 'rgba(56, 189, 248, 0.3)',
    },
    characterGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '16px',
    },
    characterCard: {
      borderRadius: '16px',
      border: '2px solid rgba(148, 163, 184, 0.3)',
      background: 'rgba(15, 23, 42, 0.8)',
      padding: '16px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      position: 'relative',
      overflow: 'hidden',
    },
    characterCardSelected: {
      borderColor: '#38bdf8',
      background: 'rgba(56, 189, 248, 0.15)',
    },
    characterImage: {
      width: '80px',
      height: '80px',
      borderRadius: '12px',
      objectFit: 'cover',
      marginBottom: '12px',
    },
    characterName: {
      color: 'white',
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '8px',
    },
    characterDescription: {
      color: '#94a3b8',
      fontSize: '12px',
      lineHeight: '1.4',
      marginBottom: '12px',
      height: '48px',
      overflow: 'hidden',
    },
    abilityChips: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
    },
    abilityChip: {
      background: 'rgba(56, 189, 248, 0.2)',
      color: '#38bdf8',
      fontSize: '10px',
      padding: '4px 8px',
      borderRadius: '8px',
    },
    selectedBadge: {
      position: 'absolute',
      top: '8px',
      right: '8px',
      background: '#22c55e',
      color: 'white',
      fontSize: '12px',
      fontWeight: 'bold',
      padding: '4px 8px',
      borderRadius: '12px',
    },
    footer: {
      background: 'rgba(15, 23, 42, 0.95)',
      padding: '20px',
      borderTop: '1px solid rgba(56, 189, 248, 0.3)',
      display: 'flex',
      gap: '12px',
      justifyContent: 'flex-end',
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
    cancelButton: {
      background: 'rgba(148, 163, 184, 0.2)',
      color: '#94a3b8',
    },
    startButton: {
      background: '#38bdf8',
      color: '#020617',
    },
    settingsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px',
    },
    settingItem: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
    settingLabel: {
      color: '#e2e8f0',
      fontSize: '14px',
      fontWeight: 'bold',
    },
    settingInput: {
      padding: '8px 12px',
      borderRadius: '8px',
      border: '1px solid rgba(148, 163, 184, 0.3)',
      background: 'rgba(15, 23, 42, 0.8)',
      color: 'white',
      fontSize: '14px',
    },
  }

  const gameModes = [
    { id: '1v1', name: '1 vs 1', description: '클래식 듀얼' },
    { id: '2v2', name: '2 vs 2', description: '팀 배틀' },
    { id: 'battle_royale', name: '배틀로얄', description: '다인전' },
  ]

  return (
    <div style={styles.launcher}>
      <div style={styles.header}>
        <h1 style={styles.title}>AI 배틀 아레나</h1>
        <p style={styles.subtitle}>
          캐릭터를 선택하고 AI가 심판하는 흥미진진한 배틀을 시작하세요
        </p>
      </div>

      <div style={styles.content}>
        {/* 게임 모드 선택 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>게임 모드</h2>
          <div style={styles.gameModeGrid}>
            {gameModes.map(mode => (
              <button
                key={mode.id}
                style={{
                  ...styles.modeButton,
                  ...(gameMode === mode.id ? styles.modeButtonActive : {}),
                }}
                onClick={() => setGameMode(mode.id)}
              >
                <div>{mode.name}</div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>
                  {mode.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 배틀 설정 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>배틀 설정</h2>
          <div style={styles.settingsGrid}>
            <div style={styles.settingItem}>
              <label style={styles.settingLabel}>최대 턴 수</label>
              <input
                type="number"
                value={battleSettings.turnLimit}
                onChange={e => setBattleSettings(prev => ({ 
                  ...prev, 
                  turnLimit: parseInt(e.target.value) || 10 
                }))}
                style={styles.settingInput}
                min="5"
                max="50"
              />
            </div>
            <div style={styles.settingItem}>
              <label style={styles.settingLabel}>테마</label>
              <select
                value={battleSettings.theme}
                onChange={e => setBattleSettings(prev => ({ 
                  ...prev, 
                  theme: e.target.value 
                }))}
                style={styles.settingInput}
              >
                <option value="fantasy">판타지</option>
                <option value="sci-fi">SF</option>
                <option value="modern">현대</option>
                <option value="historical">역사</option>
              </select>
            </div>
            <div style={styles.settingItem}>
              <label style={styles.settingLabel}>환경</label>
              <select
                value={battleSettings.environment}
                onChange={e => setBattleSettings(prev => ({ 
                  ...prev, 
                  environment: e.target.value 
                }))}
                style={styles.settingInput}
              >
                <option value="arena">아레나</option>
                <option value="forest">숲</option>
                <option value="castle">성</option>
                <option value="space">우주</option>
              </select>
            </div>
          </div>
        </div>

        {/* 캐릭터 선택 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            캐릭터 선택 ({selectedCharacters.length}명 선택됨)
          </h2>
          <div style={styles.characterGrid}>
            {availableCharacters.map(character => {
              const isSelected = selectedCharacters.find(c => c.id === character.id)
              const abilities = [
                character.ability1,
                character.ability2,
                character.ability3,
                character.ability4,
              ].filter(Boolean)

              return (
                <div
                  key={character.id}
                  style={{
                    ...styles.characterCard,
                    ...(isSelected ? styles.characterCardSelected : {}),
                  }}
                  onClick={() => handleCharacterToggle(character)}
                >
                  {isSelected && (
                    <div style={styles.selectedBadge}>선택됨</div>
                  )}
                  
                  <img
                    src={character.image_url || '/default-character.png'}
                    alt={character.name}
                    style={styles.characterImage}
                  />
                  
                  <div style={styles.characterName}>{character.name}</div>
                  
                  <div style={styles.characterDescription}>
                    {character.description || '설명이 없습니다'}
                  </div>
                  
                  {abilities.length > 0 && (
                    <div style={styles.abilityChips}>
                      {abilities.map((ability, index) => (
                        <span key={index} style={styles.abilityChip}>
                          {ability.length > 8 ? ability.substring(0, 8) + '...' : ability}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={styles.footer}>
        <button
          style={{...styles.button, ...styles.cancelButton}}
          onClick={onCancel}
        >
          취소
        </button>
        <button
          style={{
            ...styles.button,
            ...styles.startButton,
            opacity: selectedCharacters.length >= 2 ? 1 : 0.5,
          }}
          onClick={handleStartGame}
          disabled={selectedCharacters.length < 2}
        >
          게임 시작 ({selectedCharacters.length}명)
        </button>
      </div>
    </div>
  )
}

// 캐릭터 능력치 파싱 헬퍼 함수
function parseCharacterStats(character) {
  // description이나 abilities에서 능력치 정보를 추출하거나 기본값 사용
  const stats = {
    strength: 50,
    agility: 50,
    intelligence: 50,
    charisma: 50,
  }

  // description에서 능력치 키워드 찾기
  const description = (character.description || '').toLowerCase()
  
  if (description.includes('강함') || description.includes('힘')) stats.strength += 20
  if (description.includes('빠름') || description.includes('민첩')) stats.agility += 20
  if (description.includes('똑똑') || description.includes('지능')) stats.intelligence += 20
  if (description.includes('매력') || description.includes('카리스마')) stats.charisma += 20

  // abilities에서도 능력치 힌트 찾기
  const abilities = [
    character.ability1,
    character.ability2, 
    character.ability3,
    character.ability4,
  ].filter(Boolean).join(' ').toLowerCase()

  if (abilities.includes('공격') || abilities.includes('전투')) stats.strength += 10
  if (abilities.includes('회피') || abilities.includes('속도')) stats.agility += 10
  if (abilities.includes('마법') || abilities.includes('전략')) stats.intelligence += 10
  if (abilities.includes('설득') || abilities.includes('치유')) stats.charisma += 10

  // 최대값 제한
  Object.keys(stats).forEach(key => {
    stats[key] = Math.min(stats[key], 100)
  })

  return stats
}