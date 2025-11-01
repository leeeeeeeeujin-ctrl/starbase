// components/maker/editor/CodeEditor.js
// 다중 언어 지원 통합 개발 환경

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// 지원 언어 정의
const SUPPORTED_LANGUAGES = {
  javascript: {
    name: 'JavaScript',
    icon: '🟨',
    extension: 'js',
    executable: true,
    template: `// 🎮 JavaScript 게임 로직
function gameSystem(players, gameState) {
  // 게임 상태 업데이트 로직
  console.log('게임 시작!', players)
  
  return {
    success: true,
    message: '게임이 성공적으로 실행되었습니다!',
    newState: { ...gameState, turn: gameState.turn + 1 }
  }
}

// 실행
const result = gameSystem(
  [{ name: '플레이어1', hp: 100 }, { name: '플레이어2', hp: 100 }],
  { turn: 1, round: 1 }
)

console.log(result)
return result`,
  },
  python: {
    name: 'Python',
    icon: '🐍',
    extension: 'py',
    executable: false, // 클라이언트에서 실행 불가
    template: `# 🎮 Python 게임 시스템
import json
from typing import Dict, List, Any

class GameEngine:
    def __init__(self):
        self.players = []
        self.game_state = {}
    
    def add_player(self, name: str, stats: Dict[str, int]):
        player = {
            'name': name,
            'stats': stats,
            'id': len(self.players) + 1
        }
        self.players.append(player)
        return player
    
    def process_turn(self, player_action: str) -> Dict[str, Any]:
        # 턴 처리 로직
        return {
            'success': True,
            'message': f'{player_action} 액션이 처리되었습니다',
            'result': 'continue'
        }

# 사용 예시
engine = GameEngine()
engine.add_player('영웅', {'hp': 100, 'attack': 20})
result = engine.process_turn('attack')
print(json.dumps(result, ensure_ascii=False, indent=2))`,
  },
  sql: {
    name: 'SQL',
    icon: '🗃️',
    extension: 'sql',
    executable: false,
    template: `-- 🎮 게임 데이터베이스 스키마

-- 플레이어 테이블
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    hp INTEGER DEFAULT 100,
    attack INTEGER DEFAULT 10,
    defense INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 게임 세션 테이블  
CREATE TABLE game_sessions (
    id SERIAL PRIMARY KEY,
    session_name VARCHAR(100),
    player_count INTEGER,
    status VARCHAR(20) DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 게임 로그 테이블
CREATE TABLE game_logs (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id),
    player_id INTEGER REFERENCES players(id),
    action_type VARCHAR(50),
    action_data JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 샘플 데이터 삽입
INSERT INTO players (username, level, hp, attack) VALUES
('DragonSlayer', 5, 150, 25),
('MagicUser', 3, 80, 35),
('Tank', 4, 200, 15);

-- 플레이어 조회
SELECT username, level, hp, attack FROM players ORDER BY level DESC;`,
  },
  json: {
    name: 'JSON Config',
    icon: '📋',
    extension: 'json',
    executable: false,
    template: `{
  "gameConfig": {
    "name": "Epic Battle RPG",
    "version": "1.0.0",
    "maxPlayers": 4,
    "turnTimeLimit": 30,
    "gameSettings": {
      "difficulty": "normal",
      "pvpEnabled": true,
      "respawnAllowed": false
    }
  },
  "playerClasses": [
    {
      "id": "warrior",
      "name": "전사",
      "baseStats": {
        "hp": 120,
        "attack": 25,
        "defense": 20,
        "magic": 5
      },
      "skills": ["강타", "방어", "돌진"]
    },
    {
      "id": "mage", 
      "name": "마법사",
      "baseStats": {
        "hp": 80,
        "attack": 15,
        "defense": 10,
        "magic": 30
      },
      "skills": ["파이어볼", "힐링", "텔레포트"]
    }
  ],
  "gameRules": {
    "winCondition": "lastPlayerStanding",
    "specialRules": [
      "매 턴마다 1 HP씩 자동 회복",
      "마법 사용시 마나 소모",
      "크리티컬 확률 10%"
    ]
  }
}`,
  },
};

export default function CodeEditor({
  onCodeRun,
  initialCode = '',
  gameContext = {},
  visible = false,
}) {
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [code, setCode] = useState(
    initialCode ||
      `// 🎮 게임 로직 코딩하기
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

return result`
  );
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  // 코드 실행 함수
  const executeCode = useCallback(async () => {
    if (!code.trim()) {
      setError('실행할 코드가 없습니다.');
      return;
    }

    setIsRunning(true);
    setOutput('');
    setError('');

    try {
      // 콘솔 출력 캡처 및 전역 console 프록시(재선언 충돌 방지)
      const logs = [];
      const originalConsole = globalThis.console;
      const mockConsole = Object.assign({}, originalConsole, {
        log: (...args) => {
          try { logs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')); } catch(_) {}
          if (originalConsole && typeof originalConsole.log === 'function') {
            try { originalConsole.log.apply(originalConsole, args); } catch(_) {}
          }
        },
        error: (...args) => {
          try { logs.push('ERROR: ' + args.map(String).join(' ')); } catch(_) {}
          if (originalConsole && typeof originalConsole.error === 'function') {
            try { originalConsole.error.apply(originalConsole, args); } catch(_) {}
          }
        },
        warn: (...args) => {
          try { logs.push('WARN: ' + args.map(String).join(' ')); } catch(_) {}
          if (originalConsole && typeof originalConsole.warn === 'function') {
            try { originalConsole.warn.apply(originalConsole, args); } catch(_) {}
          }
        },
      });

      // 제한된 setTimeout (최대 5초)
      const limitedSetTimeout = (fn, delay) => {
        if (delay > 5000) delay = 5000;
        return setTimeout(fn, delay);
      };

      // 안전한 JavaScript 실행 환경 설정 (전역 console 프록시 사용)
      const fn = new Function(
        'Math', 'JSON', 'gameContext', 'setTimeout', 'setInterval',
        `\n"use strict";\n${code}\n`
      );

      // 코드 실행
      let result = null;
      globalThis.console = mockConsole;
      result = fn(Math, JSON, gameContext, limitedSetTimeout, setInterval);

      // 결과 출력
      const output = [
        ...logs,
        result !== undefined ? `반환값: ${JSON.stringify(result, null, 2)}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      setOutput(output);

      // 상위 컴포넌트에 결과 전달
      if (onCodeRun) {
        onCodeRun({
          code,
          result,
          output,
          success: true,
        });
      }
    } catch (err) {
      const errorMsg = `실행 오류: ${err.message}`;
      setError(errorMsg);

      if (onCodeRun) {
        onCodeRun({
          code,
          result: null,
          output: '',
          error: errorMsg,
          success: false,
        });
      }
    } finally {
      try { globalThis.console = originalConsole; } catch(_) {}
      setIsRunning(false);
    }
  }, [code, gameContext, onCodeRun]);

  // 코드 템플릿
  const insertTemplate = useCallback(template => {
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

return solvePuzzle(grid, moves)`,
    };

    setCode(templates[template] || templates.rpg);
  }, []);

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
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        color: '#f8fafc',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>⚡ JavaScript 게임 로직 에디터</h2>

        <div style={{ display: 'flex', gap: 8 }}>
          <select
            onChange={e => insertTemplate(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#f8fafc',
              fontSize: 13,
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
              fontSize: 13,
            }}
          >
            {isRunning ? '🔄 실행 중...' : '▶️ 실행'}
          </button>
        </div>
      </div>

      {/* 메인 영역 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          minHeight: 0,
        }}
      >
        {/* 코드 에디터 */}
        <div
          style={{
            flex: '1 1 60%',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid rgba(148, 163, 184, 0.3)',
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
            📝 코드 입력
          </div>

          <textarea
            ref={textareaRef}
            value={code}
            onChange={e => setCode(e.target.value)}
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
              lineHeight: 1.5,
            }}
          />
        </div>

        {/* 출력 영역 */}
        <div
          style={{
            flex: '1 1 40%',
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
            📊 실행 결과
          </div>

          <div
            style={{
              flex: 1,
              padding: 16,
              background: '#020617',
              overflow: 'auto',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>❌ {error}</div>}

            {output && (
              <div style={{ color: '#10b981' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{output}</pre>
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
  );
}
