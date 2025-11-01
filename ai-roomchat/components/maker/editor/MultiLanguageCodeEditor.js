// components/maker/editor/MultiLanguageCodeEditor.js
// 🚀 AI 개발 환경 - 다중 언어 통합 코드 에디터

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiManager } from '../../../lib/encryption';
import AIApiManager from '../settings/AIApiManager';

// 지원 언어 정의
const SUPPORTED_LANGUAGES = {
  javascript: {
    name: 'JavaScript',
    icon: '🟨',
    extension: 'js',
    executable: true,
    color: '#f7df1e',
    template: `// 🎮 JavaScript 게임 로직
function gameSystem(players, gameState) {
  // 게임 상태 업데이트 로직
  console.log('🚀 게임 시작!', players)
  
  // 턴 처리 로직
  const processedTurn = players.map(player => ({
    ...player,
    action: player.ai ? generateAIAction(player) : 'waiting',
    hp: Math.max(0, player.hp)
  }))
  
  return {
    success: true,
    message: '게임이 성공적으로 실행되었습니다! 🎉',
    newState: { 
      ...gameState, 
      turn: gameState.turn + 1,
      players: processedTurn
    }
  }
}

function generateAIAction(player) {
  const actions = ['attack', 'defend', 'heal', 'special']
  return actions[Math.floor(Math.random() * actions.length)]
}

// 🎯 실행 테스트
const result = gameSystem(
  [
    { name: '영웅', hp: 100, ai: false },
    { name: 'AI전사', hp: 100, ai: true }
  ],
  { turn: 1, round: 1 }
)

console.log('🎮 게임 결과:', result)
return result`,
  },
  python: {
    name: 'Python',
    icon: '🐍',
    extension: 'py',
    executable: false,
    color: '#3776ab',
    template: `# 🎮 Python 게임 시스템
import json
import random
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

@dataclass
class Player:
    name: str
    hp: int = 100
    attack: int = 20
    defense: int = 10
    magic: int = 15
    level: int = 1
    
    def take_damage(self, damage: int) -> int:
        actual_damage = max(1, damage - self.defense)
        self.hp = max(0, self.hp - actual_damage)
        return actual_damage
    
    def is_alive(self) -> bool:
        return self.hp > 0

class GameEngine:
    def __init__(self):
        self.players: List[Player] = []
        self.turn_count = 0
        self.game_log = []
    
    def add_player(self, name: str, **stats) -> Player:
        player = Player(name=name, **stats)
        self.players.append(player)
        self.log(f"🎯 {name} 플레이어가 게임에 참가했습니다!")
        return player
    
    def process_combat(self, attacker: Player, defender: Player, action: str) -> Dict[str, Any]:
        if action == "attack":
            damage = random.randint(attacker.attack - 5, attacker.attack + 5)
            actual_damage = defender.take_damage(damage)
            
            result = {
                'action': 'attack',
                'attacker': attacker.name,
                'defender': defender.name,
                'damage': actual_damage,
                'defender_hp': defender.hp,
                'success': True
            }
            
            self.log(f"⚔️ {attacker.name}이(가) {defender.name}에게 {actual_damage} 데미지를 입혔습니다!")
            
            if not defender.is_alive():
                self.log(f"💀 {defender.name}이(가) 쓰러졌습니다!")
                result['game_over'] = True
                result['winner'] = attacker.name
            
            return result
        
        elif action == "heal":
            heal_amount = random.randint(15, 25)
            old_hp = attacker.hp
            attacker.hp = min(100, attacker.hp + heal_amount)
            actual_heal = attacker.hp - old_hp
            
            self.log(f"✨ {attacker.name}이(가) {actual_heal} HP를 회복했습니다!")
            
            return {
                'action': 'heal',
                'player': attacker.name,
                'heal_amount': actual_heal,
                'new_hp': attacker.hp,
                'success': True
            }
    
    def log(self, message: str):
        self.game_log.append(f"턴 {self.turn_count}: {message}")
    
    def get_game_status(self) -> Dict[str, Any]:
        alive_players = [p for p in self.players if p.is_alive()]
        
        return {
            'turn': self.turn_count,
            'total_players': len(self.players),
            'alive_players': len(alive_players),
            'players': [
                {
                    'name': p.name,
                    'hp': p.hp,
                    'alive': p.is_alive(),
                    'stats': {'attack': p.attack, 'defense': p.defense}
                } for p in self.players
            ],
            'game_log': self.game_log[-5:],  # 최근 5개 로그
            'game_over': len(alive_players) <= 1,
            'winner': alive_players[0].name if len(alive_players) == 1 else None
        }

# 🎯 사용 예시
if __name__ == "__main__":
    # 게임 엔진 생성
    engine = GameEngine()
    
    # 플레이어 추가
    hero = engine.add_player("용감한 영웅", attack=25, defense=12)
    orc = engine.add_player("오크 전사", attack=20, defense=8, hp=120)
    mage = engine.add_player("마법사", attack=30, defense=5, hp=80, magic=25)
    
    # 전투 시뮬레이션
    engine.turn_count = 1
    result1 = engine.process_combat(hero, orc, "attack")
    
    engine.turn_count = 2  
    result2 = engine.process_combat(mage, hero, "attack")
    
    engine.turn_count = 3
    result3 = engine.process_combat(orc, mage, "attack")
    
    # 게임 상태 출력
    status = engine.get_game_status()
    print("🎮 게임 상태:")
    print(json.dumps(status, ensure_ascii=False, indent=2))`,
  },
  sql: {
    name: 'SQL Database',
    icon: '🗃️',
    extension: 'sql',
    executable: false,
    color: '#336791',
    template: `-- 🎮 게임 데이터베이스 설계 및 쿼리
-- Real-time Gaming Database Schema

-- 🏆 플레이어 관리 테이블
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    
    -- 게임 스탯
    hp INTEGER DEFAULT 100,
    max_hp INTEGER DEFAULT 100,
    attack INTEGER DEFAULT 10,
    defense INTEGER DEFAULT 5,
    magic INTEGER DEFAULT 0,
    
    -- 게임 기록
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    total_damage_dealt INTEGER DEFAULT 0,
    total_damage_taken INTEGER DEFAULT 0,
    
    -- 메타 데이터
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🎯 게임 세션 관리
CREATE TABLE game_sessions (
    id SERIAL PRIMARY KEY,
    session_name VARCHAR(100),
    game_type VARCHAR(50) DEFAULT 'battle',
    max_players INTEGER DEFAULT 4,
    current_players INTEGER DEFAULT 0,
    
    -- 게임 상태  
    status VARCHAR(20) DEFAULT 'waiting', -- waiting, active, finished
    turn_count INTEGER DEFAULT 0,
    winner_id INTEGER REFERENCES players(id),
    
    -- 게임 설정
    game_config JSONB,
    
    -- 타임스탬프
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🎲 실시간 게임 로그
CREATE TABLE game_logs (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES players(id),
    turn_number INTEGER,
    
    -- 액션 데이터
    action_type VARCHAR(50), -- attack, heal, defend, special, join, leave
    action_data JSONB,
    
    -- 결과 데이터
    result_data JSONB,
    damage_dealt INTEGER DEFAULT 0,
    damage_taken INTEGER DEFAULT 0,
    
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 인덱스를 위한 컬럼
    INDEX session_turn_idx (session_id, turn_number),
    INDEX player_action_idx (player_id, action_type)
);

-- 📊 플레이어 아이템/스킬 관리
CREATE TABLE player_inventory (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    item_type VARCHAR(50), -- weapon, armor, consumable, skill
    item_name VARCHAR(100),
    item_data JSONB,
    quantity INTEGER DEFAULT 1,
    equipped BOOLEAN DEFAULT FALSE,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🏅 업적 시스템
CREATE TABLE achievements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE,
    description TEXT,
    requirement_type VARCHAR(50), -- games_won, damage_dealt, level_reached
    requirement_value INTEGER,
    reward_type VARCHAR(50), -- experience, stats, items
    reward_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE player_achievements (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    achievement_id INTEGER REFERENCES achievements(id),
    achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, achievement_id)
);

-- 📈 샘플 데이터 삽입
INSERT INTO players (username, level, hp, attack, defense, games_played, games_won) VALUES
('DragonSlayer', 15, 180, 35, 25, 50, 35),
('MagicMaster', 12, 120, 45, 15, 40, 28),
('IronTank', 18, 250, 20, 40, 60, 42),
('ShadowNinja', 10, 140, 40, 20, 30, 22),
('HolyPriest', 8, 100, 25, 18, 25, 20);

INSERT INTO achievements (name, description, requirement_type, requirement_value, reward_type, reward_data) VALUES
('First Victory', '첫 번째 승리를 달성하세요!', 'games_won', 1, 'experience', '{"exp": 100}'),
('Damage Dealer', '총 1000 데미지를 입히세요!', 'damage_dealt', 1000, 'stats', '{"attack": 5}'),
('Veteran Player', '레벨 10에 도달하세요!', 'level_reached', 10, 'stats', '{"hp": 20, "attack": 3}'),
('Champion', '100번의 게임에서 승리하세요!', 'games_won', 100, 'items', '{"legendary_sword": 1}');

-- 🔍 유용한 쿼리들

-- 1. 플레이어 순위 (레벨 + 승률 기준)
SELECT 
    username,
    level,
    games_played,
    games_won,
    ROUND((games_won::float / NULLIF(games_played, 0) * 100), 2) as win_rate,
    total_damage_dealt,
    (level * 100 + games_won * 10) as ranking_score
FROM players 
WHERE games_played > 0
ORDER BY ranking_score DESC, level DESC
LIMIT 10;

-- 2. 활성 게임 세션 조회
SELECT 
    gs.id,
    gs.session_name,
    gs.current_players,
    gs.max_players,
    gs.turn_count,
    p.username as current_winner,
    gs.status,
    gs.created_at
FROM game_sessions gs
LEFT JOIN players p ON gs.winner_id = p.id
WHERE gs.status IN ('waiting', 'active')
ORDER BY gs.created_at DESC;

-- 3. 특정 플레이어의 최근 게임 기록
SELECT 
    gl.session_id,
    gl.turn_number,
    gl.action_type,
    gl.action_data,
    gl.damage_dealt,
    gl.damage_taken,
    gl.timestamp
FROM game_logs gl
JOIN players p ON gl.player_id = p.id
WHERE p.username = 'DragonSlayer'
ORDER BY gl.timestamp DESC
LIMIT 20;

-- 4. 게임별 통계 (평균 턴 수, 플레이어 수 등)
SELECT 
    COUNT(*) as total_games,
    AVG(turn_count) as avg_turns,
    AVG(current_players) as avg_players,
    COUNT(CASE WHEN status = 'finished' THEN 1 END) as completed_games,
    AVG(EXTRACT(EPOCH FROM (finished_at - started_at))/60) as avg_duration_minutes
FROM game_sessions
WHERE created_at >= NOW() - INTERVAL '7 days';

-- 5. 플레이어 업적 달성 현황  
SELECT 
    p.username,
    a.name as achievement_name,
    a.description,
    pa.achieved_at,
    CASE 
        WHEN a.requirement_type = 'games_won' THEN p.games_won
        WHEN a.requirement_type = 'level_reached' THEN p.level
        WHEN a.requirement_type = 'damage_dealt' THEN p.total_damage_dealt
    END as current_progress,
    a.requirement_value as required_value
FROM player_achievements pa
JOIN players p ON pa.player_id = p.id  
JOIN achievements a ON pa.achievement_id = a.id
ORDER BY pa.achieved_at DESC;`,
  },
  json: {
    name: 'JSON Config',
    icon: '📋',
    extension: 'json',
    executable: false,
    color: '#000000',
    template: `{
  "gameConfiguration": {
    "meta": {
      "name": "Epic Battle Arena",
      "version": "2.1.0",
      "description": "실시간 멀티플레이어 전투 게임",
      "author": "AI Game Studio",
      "lastUpdated": "2024-01-15"
    },
    "gameSettings": {
      "maxPlayers": 8,
      "minPlayers": 2,
      "turnTimeLimit": 30,
      "gameTimeLimit": 1800,
      "difficulty": "adaptive",
      "gameMode": "battle_royale",
      "enableSpectators": true,
      "enableChat": true,
      "enableVoiceChat": false
    },
    "rules": {
      "winCondition": "lastPlayerStanding",
      "respawnAllowed": false,
      "friendlyFire": false,
      "allowTeaming": true,
      "maxTeamSize": 2,
      "suddenDeathTurn": 50
    }
  },
  
  "playerClasses": [
    {
      "id": "warrior",
      "name": "전사 🛡️",
      "description": "강력한 근접 전투 전문가",
      "rarity": "common",
      "baseStats": {
        "hp": 150,
        "maxHp": 150,
        "attack": 25,
        "defense": 20,
        "magic": 5,
        "speed": 10,
        "critical": 15
      },
      "skills": [
        {
          "id": "slash",
          "name": "강타",
          "type": "attack",
          "damage": "attack * 1.2",
          "cooldown": 0,
          "description": "기본 공격보다 20% 강한 공격"
        },
        {
          "id": "shield_block", 
          "name": "방어",
          "type": "defense",
          "effect": "damage_reduction_50%",
          "cooldown": 2,
          "description": "다음 턴까지 받는 피해 50% 감소"
        },
        {
          "id": "charge",
          "name": "돌진",
          "type": "special", 
          "damage": "attack * 1.5",
          "effect": "ignore_defense_50%",
          "cooldown": 4,
          "description": "상대 방어력 50% 무시하는 강력한 공격"
        }
      ],
      "passiveAbility": {
        "name": "전투 숙련",
        "effect": "매 턴 체력 5% 회복"
      }
    },
    {
      "id": "mage",
      "name": "마법사 🔮", 
      "description": "강력한 마법 공격과 유틸리티 스킬 보유",
      "rarity": "uncommon",
      "baseStats": {
        "hp": 100,
        "maxHp": 100,
        "attack": 15,
        "defense": 8,
        "magic": 35,
        "speed": 12,
        "critical": 25
      },
      "skills": [
        {
          "id": "fireball",
          "name": "파이어볼 🔥",
          "type": "magic_attack",
          "damage": "magic * 1.0",
          "effect": "burn_damage_3turns",
          "cooldown": 1,
          "description": "화염 피해를 입히고 3턴간 화상 효과"
        },
        {
          "id": "heal",
          "name": "힐링 ✨",
          "type": "heal",
          "healing": "magic * 0.8",
          "cooldown": 3,
          "description": "체력을 회복하는 치유 마법"
        },
        {
          "id": "teleport",
          "name": "텔레포트 🌀",
          "type": "utility",
          "effect": "dodge_next_attack",
          "cooldown": 5,
          "description": "다음 공격을 완전히 회피"
        },
        {
          "id": "meteor",
          "name": "메테오 ☄️",
          "type": "ultimate",
          "damage": "magic * 2.5",
          "effect": "area_damage",
          "cooldown": 8,
          "description": "모든 적에게 강력한 광역 피해"
        }
      ],
      "passiveAbility": {
        "name": "마나 흐름",
        "effect": "스킬 사용시 마법력 +2 (최대 50까지)"
      }
    },
    {
      "id": "assassin",
      "name": "암살자 🗡️",
      "description": "빠르고 치명적인 공격 전문가",  
      "rarity": "rare",
      "baseStats": {
        "hp": 120,
        "maxHp": 120,
        "attack": 30,
        "defense": 12,
        "magic": 8,
        "speed": 20,
        "critical": 40
      },
      "skills": [
        {
          "id": "backstab",
          "name": "백스탭",
          "type": "attack",
          "damage": "attack * 1.5",
          "effect": "high_critical_chance",
          "cooldown": 2,
          "description": "높은 치명타 확률의 기습 공격"
        },
        {
          "id": "stealth", 
          "name": "은신",
          "type": "utility",
          "effect": "invisible_2turns",
          "cooldown": 6,
          "description": "2턴간 은신하여 공격받지 않음"
        },
        {
          "id": "poison_blade",
          "name": "독 칼날",
          "type": "special",
          "damage": "attack * 1.0",
          "effect": "poison_damage_4turns",
          "cooldown": 4,  
          "description": "독 피해를 입혀 4턴간 지속 피해"
        }
      ],
      "passiveAbility": {
        "name": "그림자 걸음",
        "effect": "20% 확률로 공격 회피"
      }
    }
  ],
  
  "gameEnvironment": {
    "maps": [
      {
        "id": "colosseum",
        "name": "고대 콜로세움",
        "size": "medium",
        "specialEffects": [
          "매 5턴마다 모든 플레이어 공격력 +5",
          "가운데 치유의 샘 (턴당 15 HP 회복)"
        ],
        "hazards": [
          "10턴마다 용암 분출 (모든 플레이어 20 피해)"
        ]
      },
      {
        "id": "mystic_forest",
        "name": "신비한 숲",
        "size": "large", 
        "specialEffects": [
          "마법사 클래스 마법력 +10",
          "매 턴 무작위 플레이어 마나 +5"
        ],
        "hazards": [
          "독 늪지대 (매 턴 5% 확률로 독 피해)"
        ]
      }
    ],
    "items": [
      {
        "id": "health_potion",
        "name": "체력 물약",
        "type": "consumable",
        "effect": "heal_50hp",
        "rarity": "common",
        "description": "즉시 50 HP 회복"
      },
      {
        "id": "strength_elixir", 
        "name": "힘의 영약",
        "type": "consumable",
        "effect": "attack_boost_20_5turns",
        "rarity": "uncommon", 
        "description": "5턴간 공격력 +20"
      },
      {
        "id": "legendary_sword",
        "name": "전설의 검",
        "type": "weapon",
        "effect": "attack_permanent_15",
        "rarity": "legendary",
        "description": "영구적으로 공격력 +15"
      }
    ]
  },
  
  "balancing": {
    "damageScaling": {
      "lowLevel": 0.8,
      "midLevel": 1.0,
      "highLevel": 1.2
    },
    "experienceRewards": {
      "win": 100,
      "participation": 25,
      "firstKill": 50,
      "survival": 10
    },
    "matchmaking": {
      "levelDifferenceMax": 5,
      "skillRatingWeight": 0.7,
      "recentPerformanceWeight": 0.3
    }
  },
  
  "aiSettings": {
    "difficultyLevels": {
      "easy": {
        "reactionTime": 3000,
        "strategyComplexity": 0.3,
        "mistakeProbability": 0.2
      },
      "normal": {
        "reactionTime": 2000,
        "strategyComplexity": 0.6, 
        "mistakeProbability": 0.1
      },
      "hard": {
        "reactionTime": 1000,
        "strategyComplexity": 0.9,
        "mistakeProbability": 0.05
      }
    },
    "personalityTypes": [
      {
        "name": "aggressive",
        "description": "공격적인 성향",
        "attackPreference": 0.8,
        "defensePreference": 0.2,
        "riskTaking": 0.9
      },
      {
        "name": "defensive", 
        "description": "수비적인 성향",
        "attackPreference": 0.3,
        "defensePreference": 0.7,
        "riskTaking": 0.2
      },
      {
        "name": "balanced",
        "description": "균형잡힌 성향", 
        "attackPreference": 0.5,
        "defensePreference": 0.5,
        "riskTaking": 0.5
      }
    ]
  }
}`,
  },
};

// 🤖 AI 채팅 도우미 설정
const AI_ASSISTANT_PROMPTS = {
  javascript: `당신은 JavaScript 게임 개발 전문가입니다. 
사용자의 게임 아이디어를 실행 가능한 JavaScript 코드로 변환해주세요.
실시간 게임 로직, 플레이어 상호작용, 게임 상태 관리에 특화된 조언을 제공하세요.`,

  python: `당신은 Python 게임 엔진 아키텍트입니다.
객체지향 설계, 데이터 구조 최적화, 게임 시뮬레이션 알고리즘 전문가로서
사용자의 아이디어를 완전한 Python 게임 시스템으로 설계해주세요.`,

  sql: `당신은 게임 데이터베이스 설계 전문가입니다.
플레이어 데이터, 게임 세션 관리, 실시간 로깅, 성능 최적화를 고려한
완벽한 게임 데이터베이스 스키마를 설계해주세요.`,

  json: `당신은 게임 설정 및 밸런싱 전문가입니다.
게임 규칙, 캐릭터 밸런스, 아이템 설정, AI 동작 패턴을
JSON 형태로 구조화하여 제공해주세요.`,
};

export default function MultiLanguageCodeEditor({
  onCodeRun,
  initialCode = '',
  gameContext = {},
  visible = false,
}) {
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [code, setCode] = useState(() => {
    return initialCode || SUPPORTED_LANGUAGES.javascript.template;
  });
  const [aiChat, setAiChat] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showApiManager, setShowApiManager] = useState(false);
  const [selectedApiConfig, setSelectedApiConfig] = useState(null);
  const textareaRef = useRef(null);
  const aiInputRef = useRef(null);

  // API 설정 로드
  useEffect(() => {
    const activeApis = apiManager.getActiveApis();
    if (activeApis.length > 0) {
      // 첫 번째 활성 API를 기본값으로 설정
      const firstApi = activeApis[0];
      const apiKey = apiManager.getActiveApiKey(firstApi.provider, firstApi.model);

      setSelectedApiConfig({
        provider: firstApi.provider,
        model: firstApi.model,
        apiKey: apiKey,
        endpoint: getApiEndpoint(firstApi.provider, firstApi.model),
      });
    }
  }, []);

  // API 엔드포인트 가져오기
  const getApiEndpoint = (provider, model) => {
    const providers = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      cohere: 'https://api.cohere.ai/v1/generate',
      local: 'http://localhost:11434/api/generate',
    };
    return providers[provider];
  };

  // 언어 변경 핸들러
  const handleLanguageChange = useCallback(newLanguage => {
    setSelectedLanguage(newLanguage);
    setCode(SUPPORTED_LANGUAGES[newLanguage].template);
    setOutput('');
    setChatHistory([
      {
        type: 'system',
        message: `🔄 ${SUPPORTED_LANGUAGES[newLanguage].name} 환경으로 전환되었습니다!`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  // AI 도우미 채팅
  const handleAiChat = useCallback(async () => {
    if (!aiChat.trim() || isAiThinking) return;

    const userMessage = aiChat.trim();
    setAiChat('');
    setIsAiThinking(true);

    // 사용자 메시지 추가
    const newUserMessage = {
      type: 'user',
      message: userMessage,
      timestamp: new Date().toLocaleTimeString(),
    };

    setChatHistory(prev => [...prev, newUserMessage]);

    try {
      // API 설정 확인
      if (!selectedApiConfig) {
        setChatHistory(prev => [
          ...prev,
          {
            type: 'error',
            message: '🚨 AI API가 설정되지 않았습니다. 설정 버튼을 클릭하여 API를 추가해주세요.',
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
        return;
      }

      // AI 응답 생성 (사용자 설정 API 사용)
      const response = await fetch('/api/ai-workers/code-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          language: selectedLanguage,
          currentCode: code,
          context: gameContext,
          prompt: AI_ASSISTANT_PROMPTS[selectedLanguage],
          userApiConfig: selectedApiConfig,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.needsApiSetup) {
          setChatHistory(prev => [
            ...prev,
            {
              type: 'error',
              message: '🔑 AI API 설정이 필요합니다. 설정 버튼을 클릭하여 API 키를 추가해주세요.',
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
          return;
        }
        throw new Error(errorData.error || 'AI 응답 실패');
      }

      const aiResponse = await response.json();

      // AI 응답 추가
      const aiMessage = {
        type: 'ai',
        message: aiResponse.message || '죄송합니다. 응답을 생성할 수 없습니다.',
        code: aiResponse.code,
        suggestions: aiResponse.suggestions,
        timestamp: new Date().toLocaleTimeString(),
      };

      setChatHistory(prev => [...prev, aiMessage]);

      // 코드 제안이 있으면 적용할지 물어보기
      if (aiResponse.code) {
        const applyCode = window.confirm('AI가 제안한 코드를 적용하시겠습니까?');
        if (applyCode) {
          setCode(aiResponse.code);
        }
      }
    } catch (error) {
      console.error('AI 채팅 오류:', error);
      setChatHistory(prev => [
        ...prev,
        {
          type: 'error',
          message: '🚨 AI 응답 중 오류가 발생했습니다. 다시 시도해주세요.',
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsAiThinking(false);
    }
  }, [aiChat, isAiThinking, selectedLanguage, code, gameContext]);

  // 코드 실행
  const executeCode = useCallback(async () => {
    if (isRunning) return;

    const currentLang = SUPPORTED_LANGUAGES[selectedLanguage];

    if (!currentLang.executable) {
      setOutput(
        `❌ ${currentLang.name}는 브라우저에서 직접 실행할 수 없습니다.\n💡 코드를 확인하고 외부 환경에서 테스트해보세요!`
      );
      return;
    }

    setIsRunning(true);
    setOutput('🚀 코드 실행 중...');

    try {
      if (selectedLanguage === 'javascript') {
        // JavaScript 실행 (전역 console 프록시로 재선언 충돌 방지)
        const logs = [];
        const originalConsole = globalThis.console;
        const proxyConsole = Object.assign({}, originalConsole, {
          log: (...args) => {
            try { logs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')); } catch(_) {}
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

        let result = null;
        try {
          globalThis.console = proxyConsole;
          const fn = new Function('gameContext', `"use strict";\n${code}\n`);
          result = fn(gameContext);
        } finally {
          try { globalThis.console = originalConsole; } catch(_) {}
        }

        const output = [
          '✅ JavaScript 실행 완료!',
          '',
          '📋 Console 출력:',
          ...logs,
          '',
          '🎯 반환값:',
          typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result),
        ].join('\n');

        setOutput(output);
        onCodeRun && onCodeRun({ success: true, result, logs });
      }
    } catch (error) {
      console.error('코드 실행 오류:', error);
      setOutput(`❌ 실행 오류:\n${error.message}\n\n💡 코드를 다시 확인해보세요!`);
      onCodeRun && onCodeRun({ success: false, error: error.message });
    } finally {
      setIsRunning(false);
    }
  }, [code, selectedLanguage, isRunning, gameContext, onCodeRun]);

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeCode();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        aiInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [executeCode]);

  if (!visible) return null;

  const currentLang = SUPPORTED_LANGUAGES[selectedLanguage];

  return (
    <div
      className={`fixed inset-0 z-50 ${isDarkMode ? 'bg-gray-900' : 'bg-white'} transition-colors`}
    >
      {/* 헤더 */}
      <div
        className={`flex items-center justify-between p-4 border-b ${
          isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <div className="flex items-center space-x-4">
          <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            🚀 AI 개발 환경
          </h2>

          {/* 언어 선택 */}
          <div className="flex space-x-2">
            {Object.entries(SUPPORTED_LANGUAGES).map(([key, lang]) => (
              <button
                key={key}
                onClick={() => handleLanguageChange(key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedLanguage === key
                    ? 'text-white shadow-lg transform scale-105'
                    : isDarkMode
                      ? 'text-gray-300 bg-gray-700 hover:bg-gray-600'
                      : 'text-gray-700 bg-gray-200 hover:bg-gray-300'
                }`}
                style={{
                  backgroundColor: selectedLanguage === key ? lang.color : undefined,
                }}
              >
                {lang.icon} {lang.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* API 설정 버튼 */}
          <button
            onClick={() => setShowApiManager(true)}
            className={`p-2 rounded-lg ${
              selectedApiConfig
                ? isDarkMode
                  ? 'bg-green-700 text-green-200'
                  : 'bg-green-200 text-green-800'
                : isDarkMode
                  ? 'bg-red-700 text-red-200'
                  : 'bg-red-200 text-red-800'
            }`}
            title={selectedApiConfig ? `연결됨: ${selectedApiConfig.provider}` : 'AI API 설정 필요'}
          >
            {selectedApiConfig ? '🔗' : '🔑'}
          </button>

          {/* 다크모드 토글 */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-lg ${
              isDarkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {isDarkMode ? '🌙' : '☀️'}
          </button>

          {/* 실행 버튼 */}
          <button
            onClick={executeCode}
            disabled={!currentLang.executable || isRunning}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              currentLang.executable && !isRunning
                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl'
                : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }`}
          >
            {isRunning ? '⏳ 실행중...' : '▶️ 실행 (Ctrl+Enter)'}
          </button>

          {/* 닫기 버튼 */}
          <button
            onClick={() => onCodeRun && onCodeRun({ action: 'close' })}
            className={`p-2 rounded-lg ${
              isDarkMode ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'
            } text-white`}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* 코드 에디터 */}
        <div className="flex-1 flex flex-col">
          <div className={`flex-1 p-4 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
            <textarea
              ref={textareaRef}
              value={code}
              onChange={e => setCode(e.target.value)}
              className={`w-full h-full font-mono text-sm resize-none border rounded-lg p-4 ${
                isDarkMode
                  ? 'bg-gray-800 text-green-400 border-gray-600 focus:border-green-500'
                  : 'bg-gray-50 text-gray-900 border-gray-300 focus:border-blue-500'
              } focus:outline-none focus:ring-2 ${
                isDarkMode ? 'focus:ring-green-500' : 'focus:ring-blue-500'
              } focus:ring-opacity-50`}
              placeholder={`${currentLang.icon} ${currentLang.name} 코드를 입력하세요...`}
              spellCheck={false}
            />
          </div>

          {/* 실행 결과 */}
          {output && (
            <div className={`h-64 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div
                className={`h-full p-4 ${isDarkMode ? 'bg-black' : 'bg-gray-50'} overflow-y-auto`}
              >
                <pre
                  className={`text-sm ${isDarkMode ? 'text-green-300' : 'text-gray-800'} whitespace-pre-wrap`}
                >
                  {output}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* AI 채팅 패널 */}
        <div
          className={`w-80 border-l ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'} flex flex-col`}
        >
          {/* 채팅 헤더 */}
          <div className={`p-3 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              🤖 AI 개발 도우미
            </h3>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
              {currentLang.name} 전문가가 도움을 드립니다
            </p>
          </div>

          {/* 채팅 내역 */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`${msg.type === 'user' ? 'text-right' : 'text-left'}`}>
                <div
                  className={`inline-block max-w-[90%] p-3 rounded-lg text-sm ${
                    msg.type === 'user'
                      ? 'bg-blue-600 text-white'
                      : msg.type === 'error'
                        ? 'bg-red-600 text-white'
                        : isDarkMode
                          ? 'bg-gray-700 text-gray-100'
                          : 'bg-white text-gray-900 border'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.message}</div>
                  {msg.code && (
                    <pre
                      className={`mt-2 p-2 text-xs rounded ${
                        isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
                      } overflow-x-auto`}
                    >
                      {msg.code}
                    </pre>
                  )}
                  <div className={`text-xs mt-1 opacity-70`}>{msg.timestamp}</div>
                </div>
              </div>
            ))}
            {isAiThinking && (
              <div className="text-left">
                <div
                  className={`inline-block p-3 rounded-lg ${
                    isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600 border'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin">🤖</div>
                    <span className="text-sm">AI가 생각 중...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 채팅 입력 */}
          <div className={`p-3 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <div className="flex space-x-2">
              <input
                ref={aiInputRef}
                type="text"
                value={aiChat}
                onChange={e => setAiChat(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleAiChat()}
                placeholder="AI에게 질문하세요... (Ctrl+/)"
                className={`flex-1 px-3 py-2 text-sm rounded-lg border ${
                  isDarkMode
                    ? 'bg-gray-700 text-white border-gray-600 focus:border-blue-500'
                    : 'bg-white text-gray-900 border-gray-300 focus:border-blue-500'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
                disabled={isAiThinking}
              />
              <button
                onClick={handleAiChat}
                disabled={!aiChat.trim() || isAiThinking}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  aiChat.trim() && !isAiThinking
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                }`}
              >
                📤
              </button>
            </div>
            <div className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              💡 팁: "이 코드를 최적화해줘", "버그를 찾아줘", "새로운 기능 추가해줘"
            </div>
          </div>
        </div>
      </div>

      {/* AI API 관리자 */}
      <AIApiManager
        visible={showApiManager}
        onClose={() => {
          setShowApiManager(false);
          // API 설정 변경 후 다시 로드
          const activeApis = apiManager.getActiveApis();
          if (activeApis.length > 0) {
            const firstApi = activeApis[0];
            const apiKey = apiManager.getActiveApiKey(firstApi.provider, firstApi.model);

            setSelectedApiConfig({
              provider: firstApi.provider,
              model: firstApi.model,
              apiKey: apiKey,
              endpoint: getApiEndpoint(firstApi.provider, firstApi.model),
            });
          } else {
            setSelectedApiConfig(null);
          }
        }}
      />
    </div>
  );
}
