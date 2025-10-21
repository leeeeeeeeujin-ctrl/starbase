// components/maker/editor/CodeEditor.js
// JavaScript 코드 실행 에디터 컴포넌트

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export default function CodeEditor({ 
  onCodeRun, 
  initialCode = '', 
  gameContext = {},
  visible = false 
}) {
  const [code, setCode] = useState(initialCode || `// 🎮 게임 로직 코딩하기
// 여기에 JavaScript로 게임 규칙을 작성하세요!

function gameLogic(player, enemy) {
  // 플레이어 행동 처리
  if (player.action === 'attack') {
    const damage = Math.floor(Math.random() * 20) + player.strength
    enemy.hp -= damage
    
    return {
      message: \`플레이어가 \${damage} 데미지를 입혔습니다!\`,
      enemy: enemy,
      gameOver: enemy.hp <= 0
    }
  }
  
  if (player.action === 'heal') {
    const healing = Math.floor(Math.random() * 15) + 10
    player.hp = Math.min(100, player.hp + healing)
    
    return {
      message: \`플레이어가 \${healing} HP를 회복했습니다!\`,
      player: player,
      gameOver: false
    }
  }
  
  return {
    message: '알 수 없는 행동입니다.',
    gameOver: false
  }
}

// 게임 실행
const player = { hp: 100, strength: 15, action: 'attack' }
const enemy = { hp: 50, defense: 5 }

const result = gameLogic(player, enemy)
console.log(result)

return result`)
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const textareaRef = useRef(null)

  // 코드 실행 함수
  const executeCode = useCallback(async () => {
    if (!code.trim()) {
      setError('실행할 코드가 없습니다.')
      return
    }

    setIsRunning(true)
    setOutput('')
    setError('')

    try {
      // 안전한 JavaScript 실행 환경 설정
      const safeEval = new Function(
        'console', 
        'Math',
        'JSON',
        'gameContext',
        'setTimeout',
        'setInterval',
        `
        "use strict";
        const console = arguments[0];
        const Math = arguments[1]; 
        const JSON = arguments[2];
        const gameContext = arguments[3];
        // setTimeout, setInterval은 제한적으로 허용
        
        ${code}
        `
      )

      // 콘솔 출력 캡처
      const logs = []
      const mockConsole = {
        log: (...args) => logs.push(args.map(String).join(' ')),
        error: (...args) => logs.push('ERROR: ' + args.map(String).join(' ')),
        warn: (...args) => logs.push('WARN: ' + args.map(String).join(' '))
      }

      // 제한된 setTimeout (최대 5초)
      const limitedSetTimeout = (fn, delay) => {
        if (delay > 5000) delay = 5000
        return setTimeout(fn, delay)
      }

      // 코드 실행
      const result = safeEval(
        mockConsole, 
        Math, 
        JSON, 
        gameContext,
        limitedSetTimeout,
        setInterval
      )

      // 결과 출력
      const output = [
        ...logs,
        result !== undefined ? `반환값: ${JSON.stringify(result, null, 2)}` : ''
      ].filter(Boolean).join('\n')

      setOutput(output)

      // 상위 컴포넌트에 결과 전달
      if (onCodeRun) {
        onCodeRun({
          code,
          result,
          output,
          success: true
        })
      }

    } catch (err) {
      const errorMsg = `실행 오류: ${err.message}`
      setError(errorMsg)
      
      if (onCodeRun) {
        onCodeRun({
          code,
          result: null,
          output: '',
          error: errorMsg,
          success: false
        })
      }
    } finally {
      setIsRunning(false)
    }
  }, [code, gameContext, onCodeRun])

  // 코드 템플릿
  const insertTemplate = useCallback((template) => {
    const templates = {
      rpg: `// 🏰 RPG 배틀 시스템
function rpgBattle(hero, monster) {
  const heroDamage = Math.floor(Math.random() * hero.attack) + 5
  const monsterDamage = Math.floor(Math.random() * monster.attack) + 3
  
  monster.hp -= heroDamage
  hero.hp -= monsterDamage
  
  console.log(\`영웅이 \${heroDamage} 데미지!\`)
  console.log(\`몬스터가 \${monsterDamage} 데미지!\`)
  
  if (monster.hp <= 0) return { winner: 'hero', message: '영웅 승리!' }
  if (hero.hp <= 0) return { winner: 'monster', message: '몬스터 승리!' }
  
  return { winner: null, message: '배틀 계속...' }
}

const hero = { hp: 100, attack: 20, name: '용사' }
const monster = { hp: 80, attack: 15, name: '드래곤' }

return rpgBattle(hero, monster)`,

      space: `// 🚀 우주 전투 시뮬레이터
function spaceBattle(player, aliens) {
  let score = 0
  let ammo = 50
  
  aliens.forEach((alien, index) => {
    if (ammo > 0) {
      const hitChance = Math.random()
      if (hitChance > 0.3) { // 70% 명중률
        score += alien.points
        ammo--
        console.log(\`외계인 \${index + 1} 격파! (+\${alien.points}점)\`)
      } else {
        console.log(\`외계인 \${index + 1} 빗나감!\`)
      }
    }
  })
  
  return {
    score: score,
    ammo: ammo,
    message: \`최종 점수: \${score}점, 남은 탄약: \${ammo}발\`
  }
}

const aliens = [
  { points: 10 }, { points: 15 }, { points: 20 }
]

return spaceBattle({}, aliens)`,

      puzzle: `// 🧩 퍼즐 게임 로직
function solvePuzzle(grid, moves) {
  let score = 0
  let currentGrid = [...grid]
  
  moves.forEach((move, index) => {
    if (move === 'match') {
      // 3개 연속 매치 체크
      for (let i = 0; i < currentGrid.length - 2; i++) {
        if (currentGrid[i] === currentGrid[i+1] && 
            currentGrid[i+1] === currentGrid[i+2]) {
          score += 100
          console.log(\`매치 발견! 위치 \${i}-\${i+2}\`)
          break
        }
      }
    }
  })
  
  return {
    score: score,
    grid: currentGrid,
    message: \`퍼즐 점수: \${score}점\`
  }
}

const grid = [1, 1, 1, 2, 3, 3, 2, 1]
const moves = ['match', 'swap', 'match']

return solvePuzzle(grid, moves)`
    }

    setCode(templates[template] || templates.rpg)
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.95)',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      color: '#f8fafc'
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          ⚡ JavaScript 게임 로직 에디터
        </h2>
        
        <div style={{ display: 'flex', gap: 8 }}>
          <select 
            onChange={(e) => insertTemplate(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#f8fafc',
              fontSize: 13
            }}
          >
            <option value="">📝 템플릿 선택</option>
            <option value="rpg">🏰 RPG 배틀</option>
            <option value="space">🚀 우주 전투</option>
            <option value="puzzle">🧩 퍼즐 게임</option>
          </select>
          
          <button
            onClick={executeCode}
            disabled={isRunning}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: isRunning ? '#64748b' : '#10b981',
              color: '#fff',
              fontWeight: 600,
              cursor: isRunning ? 'default' : 'pointer',
              fontSize: 13
            }}
          >
            {isRunning ? '🔄 실행 중...' : '▶️ 실행'}
          </button>
        </div>
      </div>

      {/* 메인 영역 */}
      <div style={{
        flex: 1,
        display: 'flex',
        minHeight: 0
      }}>
        {/* 코드 에디터 */}
        <div style={{
          flex: '1 1 60%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid rgba(148, 163, 184, 0.3)'
        }}>
          <div style={{
            padding: '12px 16px',
            background: '#1e293b',
            borderBottom: '1px solid rgba(148, 163, 184, 0.3)',
            fontSize: 14,
            fontWeight: 600
          }}>
            📝 코드 입력
          </div>
          
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="여기에 JavaScript 코드를 입력하세요..."
            style={{
              flex: 1,
              padding: 16,
              border: 'none',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: 14,
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5
            }}
          />
        </div>

        {/* 출력 영역 */}
        <div style={{
          flex: '1 1 40%',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            background: '#1e293b',
            borderBottom: '1px solid rgba(148, 163, 184, 0.3)',
            fontSize: 14,
            fontWeight: 600
          }}>
            📊 실행 결과
          </div>
          
          <div style={{
            flex: 1,
            padding: 16,
            background: '#020617',
            overflow: 'auto',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.6
          }}>
            {error && (
              <div style={{ color: '#ef4444', marginBottom: 12 }}>
                ❌ {error}
              </div>
            )}
            
            {output && (
              <div style={{ color: '#10b981' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {output}
                </pre>
              </div>
            )}
            
            {!output && !error && (
              <div style={{ color: '#64748b', fontStyle: 'italic' }}>
                코드를 실행하면 결과가 여기에 표시됩니다...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}