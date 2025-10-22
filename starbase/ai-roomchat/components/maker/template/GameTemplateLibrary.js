/**
 * 🎮 게임 템플릿 라이브러리
 * 장르별 게임 템플릿과 패턴 제공
 */

'use client'

import { useState } from 'react'

const GameTemplateLibrary = ({ onSelectTemplate, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // 🎯 게임 템플릿 데이터
  const gameTemplates = [
    // 🏃‍♂️ 액션 게임
    {
      id: 'platformer_basic',
      name: '플랫포머 게임',
      category: 'action',
      difficulty: 'beginner',
      description: '점프하고 이동하는 기본 플랫폼 게임',
      features: ['키보드 컨트롤', '점프 물리', '충돌 감지', '스프라이트 애니메이션'],
      code: `
// 🏃‍♂️ 기본 플랫포머 게임
const game = {
  player: {
    x: 100,
    y: 300,
    width: 40,
    height: 40,
    velocityY: 0,
    onGround: false,
    speed: 5
  },
  
  gravity: 0.8,
  jumpPower: -15,
  
  // 플레이어 업데이트
  updatePlayer() {
    // 중력 적용
    this.player.velocityY += this.gravity
    this.player.y += this.player.velocityY
    
    // 바닥 충돌
    if (this.player.y > 400) {
      this.player.y = 400
      this.player.velocityY = 0
      this.player.onGround = true
    }
    
    // 키보드 입력
    if (keys.left) this.player.x -= this.player.speed
    if (keys.right) this.player.x += this.player.speed
    if (keys.space && this.player.onGround) {
      this.player.velocityY = this.jumpPower
      this.player.onGround = false
    }
  },
  
  // 게임 렌더링
  render(ctx) {
    ctx.clearRect(0, 0, 800, 600)
    
    // 플레이어 그리기
    ctx.fillStyle = '#4ade80'
    ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height)
    
    // 바닥 그리기
    ctx.fillStyle = '#8b5cf6'
    ctx.fillRect(0, 440, 800, 160)
  }
}

// 키보드 상태
const keys = {}
document.addEventListener('keydown', e => keys[e.code.replace('Key', '').toLowerCase()] = true)
document.addEventListener('keyup', e => keys[e.code.replace('Key', '').toLowerCase()] = false)
      `.trim(),
      preview: '🏃‍♂️ 캐릭터가 점프하며 플랫폼을 이동하는 게임'
    },
    
    {
      id: 'shooter_basic',
      name: '슈팅 게임',
      category: 'action',
      difficulty: 'intermediate',
      description: '우주선으로 적을 물리치는 슈팅 게임',
      features: ['발사 시스템', '적 생성', '충돌 감지', '점수 시스템'],
      code: `
// 🚀 기본 슈팅 게임
const game = {
  player: { x: 400, y: 500, width: 40, height: 40 },
  bullets: [],
  enemies: [],
  score: 0,
  
  // 총알 발사
  shoot() {
    this.bullets.push({
      x: this.player.x + 15,
      y: this.player.y,
      speed: 10
    })
  },
  
  // 적 생성
  spawnEnemy() {
    if (Math.random() < 0.02) {
      this.enemies.push({
        x: Math.random() * 760,
        y: -40,
        width: 40,
        height: 40,
        speed: 2
      })
    }
  },
  
  // 게임 업데이트
  update() {
    // 플레이어 이동
    if (keys.left && this.player.x > 0) this.player.x -= 5
    if (keys.right && this.player.x < 760) this.player.x += 5
    if (keys.space) this.shoot()
    
    // 총알 업데이트
    this.bullets = this.bullets.filter(bullet => {
      bullet.y -= bullet.speed
      return bullet.y > -10
    })
    
    // 적 업데이트
    this.enemies = this.enemies.filter(enemy => {
      enemy.y += enemy.speed
      return enemy.y < 600
    })
    
    // 충돌 검사
    this.checkCollisions()
    this.spawnEnemy()
  },
  
  // 충돌 검사
  checkCollisions() {
    this.bullets.forEach((bullet, bi) => {
      this.enemies.forEach((enemy, ei) => {
        if (bullet.x < enemy.x + enemy.width &&
            bullet.x + 10 > enemy.x &&
            bullet.y < enemy.y + enemy.height &&
            bullet.y + 10 > enemy.y) {
          this.bullets.splice(bi, 1)
          this.enemies.splice(ei, 1)
          this.score += 10
        }
      })
    })
  }
}
      `.trim(),
      preview: '🚀 우주선이 적을 물리치며 점수를 얻는 게임'
    },

    // 🧩 퍼즐 게임
    {
      id: 'match3_basic',
      name: '매치3 퍼즐',
      category: 'puzzle',
      difficulty: 'intermediate',
      description: '같은 색깔 3개를 맞추는 퍼즐 게임',
      features: ['그리드 시스템', '매칭 로직', '애니메이션', '점수 계산'],
      code: `
// 🧩 매치3 퍼즐 게임
const game = {
  grid: [],
  gridSize: 8,
  colors: ['red', 'blue', 'green', 'yellow', 'purple'],
  score: 0,
  
  // 그리드 초기화
  initGrid() {
    this.grid = []
    for (let i = 0; i < this.gridSize; i++) {
      this.grid[i] = []
      for (let j = 0; j < this.gridSize; j++) {
        this.grid[i][j] = this.colors[Math.floor(Math.random() * this.colors.length)]
      }
    }
  },
  
  // 매치 찾기
  findMatches() {
    const matches = []
    
    // 가로 매치
    for (let i = 0; i < this.gridSize; i++) {
      for (let j = 0; j < this.gridSize - 2; j++) {
        if (this.grid[i][j] === this.grid[i][j+1] && 
            this.grid[i][j] === this.grid[i][j+2]) {
          matches.push([i, j], [i, j+1], [i, j+2])
        }
      }
    }
    
    // 세로 매치
    for (let i = 0; i < this.gridSize - 2; i++) {
      for (let j = 0; j < this.gridSize; j++) {
        if (this.grid[i][j] === this.grid[i+1][j] && 
            this.grid[i][j] === this.grid[i+2][j]) {
          matches.push([i, j], [i+1, j], [i+2, j])
        }
      }
    }
    
    return matches
  },
  
  // 블록 교체
  swapBlocks(x1, y1, x2, y2) {
    const temp = this.grid[x1][y1]
    this.grid[x1][y1] = this.grid[x2][y2]
    this.grid[x2][y2] = temp
    
    const matches = this.findMatches()
    if (matches.length > 0) {
      this.score += matches.length * 10
      this.removeMatches(matches)
    } else {
      // 매치가 없으면 원래대로
      this.grid[x2][y2] = this.grid[x1][y1]
      this.grid[x1][y1] = temp
    }
  }
}
      `.trim(),
      preview: '🧩 같은 색깔을 3개 이상 맞추면 사라지는 퍼즐'
    },

    // 🏎️ 레이싱 게임
    {
      id: 'racing_basic',
      name: '레이싱 게임',
      category: 'racing',
      difficulty: 'intermediate',
      description: '자동차로 달리는 무한 레이싱',
      features: ['자동차 컨트롤', '도로 생성', '장애물', '속도 시스템'],
      code: `
// 🏎️ 기본 레이싱 게임
const game = {
  car: {
    x: 375,
    y: 450,
    width: 50,
    height: 80,
    speed: 0,
    maxSpeed: 8
  },
  
  road: {
    offset: 0,
    speed: 5
  },
  
  obstacles: [],
  score: 0,
  
  // 자동차 업데이트
  updateCar() {
    // 좌우 이동
    if (keys.left && this.car.x > 50) {
      this.car.x -= 6
    }
    if (keys.right && this.car.x < 700) {
      this.car.x += 6
    }
    
    // 가속/감속
    if (keys.up) {
      this.car.speed = Math.min(this.car.maxSpeed, this.car.speed + 0.3)
    } else {
      this.car.speed = Math.max(0, this.car.speed - 0.1)
    }
    
    this.road.speed = 3 + this.car.speed
  },
  
  // 장애물 생성
  spawnObstacle() {
    if (Math.random() < 0.01) {
      this.obstacles.push({
        x: 200 + Math.random() * 400,
        y: -100,
        width: 50,
        height: 80,
        speed: this.road.speed
      })
    }
  },
  
  // 도로 그리기
  drawRoad(ctx) {
    ctx.fillStyle = '#374151'
    ctx.fillRect(0, 0, 800, 600)
    
    // 도로 차선
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 10; i++) {
      const y = (i * 100 + this.road.offset) % 600
      ctx.fillRect(395, y, 10, 50)
    }
    
    this.road.offset += this.road.speed
  }
}
      `.trim(),
      preview: '🏎️ 도로를 달리며 장애물을 피하는 레이싱'
    },

    // 🃏 카드 게임
    {
      id: 'memory_card',
      name: '메모리 카드',
      category: 'card',
      difficulty: 'beginner',
      description: '카드를 뒤집어 같은 그림 찾기',
      features: ['카드 시스템', '메모리 로직', '점수 계산', '타이머'],
      code: `
// 🃏 메모리 카드 게임
const game = {
  cards: [],
  flippedCards: [],
  matchedCards: [],
  gridSize: 4,
  symbols: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'],
  score: 0,
  moves: 0,
  
  // 카드 초기화
  initCards() {
    this.cards = []
    const symbols = [...this.symbols, ...this.symbols] // 각 심볼 2개씩
    
    // 섞기
    for (let i = symbols.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[symbols[i], symbols[j]] = [symbols[j], symbols[i]]
    }
    
    // 카드 배치
    for (let i = 0; i < 16; i++) {
      this.cards.push({
        id: i,
        symbol: symbols[i],
        flipped: false,
        matched: false,
        x: (i % 4) * 120 + 160,
        y: Math.floor(i / 4) * 120 + 100
      })
    }
  },
  
  // 카드 클릭
  flipCard(cardId) {
    const card = this.cards[cardId]
    if (card.flipped || card.matched || this.flippedCards.length >= 2) {
      return
    }
    
    card.flipped = true
    this.flippedCards.push(card)
    
    if (this.flippedCards.length === 2) {
      this.moves++
      setTimeout(() => this.checkMatch(), 1000)
    }
  },
  
  // 매치 확인
  checkMatch() {
    const [card1, card2] = this.flippedCards
    
    if (card1.symbol === card2.symbol) {
      // 매치 성공
      card1.matched = true
      card2.matched = true
      this.matchedCards.push(card1, card2)
      this.score += 100
    } else {
      // 매치 실패
      card1.flipped = false
      card2.flipped = false
    }
    
    this.flippedCards = []
    
    // 게임 완료 체크
    if (this.matchedCards.length === 16) {
      alert(\`게임 클리어! 점수: \${this.score}, 이동: \${this.moves}\`)
    }
  }
}
      `.trim(),
      preview: '🃏 카드를 뒤집어 같은 그림을 찾는 기억력 게임'
    },

    // 🎲 보드 게임
    {
      id: 'tic_tac_toe',
      name: '틱택토',
      category: 'board',
      difficulty: 'beginner',
      description: '3x3 격자에서 3개를 일렬로 만드는 게임',
      features: ['턴 기반 게임', '승리 조건', 'AI 상대', '게임 상태'],
      code: `
// 🎲 틱택토 게임
const game = {
  board: Array(9).fill(''),
  currentPlayer: 'X',
  gameOver: false,
  winner: null,
  
  // 게임판 클릭
  makeMove(index) {
    if (this.board[index] === '' && !this.gameOver) {
      this.board[index] = this.currentPlayer
      
      if (this.checkWinner()) {
        this.winner = this.currentPlayer
        this.gameOver = true
      } else if (this.board.every(cell => cell !== '')) {
        this.gameOver = true
        this.winner = 'draw'
      } else {
        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X'
      }
    }
  },
  
  // 승리 조건 확인
  checkWinner() {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // 가로
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // 세로
      [0, 4, 8], [2, 4, 6] // 대각선
    ]
    
    return winPatterns.some(pattern => {
      const [a, b, c] = pattern
      return this.board[a] && 
             this.board[a] === this.board[b] && 
             this.board[a] === this.board[c]
    })
  },
  
  // 게임 리셋
  reset() {
    this.board = Array(9).fill('')
    this.currentPlayer = 'X'
    this.gameOver = false
    this.winner = null
  },
  
  // 게임판 그리기
  render(ctx) {
    ctx.clearRect(0, 0, 400, 400)
    
    // 격자 그리기
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 4
    
    // 세로선
    ctx.beginPath()
    ctx.moveTo(133, 0)
    ctx.lineTo(133, 400)
    ctx.moveTo(266, 0)
    ctx.lineTo(266, 400)
    ctx.stroke()
    
    // 가로선
    ctx.beginPath()
    ctx.moveTo(0, 133)
    ctx.lineTo(400, 133)
    ctx.moveTo(0, 266)
    ctx.lineTo(400, 266)
    ctx.stroke()
    
    // X, O 그리기
    ctx.font = '48px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    this.board.forEach((mark, index) => {
      if (mark) {
        const x = (index % 3) * 133 + 66
        const y = Math.floor(index / 3) * 133 + 66
        ctx.fillStyle = mark === 'X' ? '#ef4444' : '#3b82f6'
        ctx.fillText(mark, x, y)
      }
    })
  }
}
      `.trim(),
      preview: '🎲 3x3 격자에서 3개를 일렬로 만드는 클래식 게임'
    }
  ]

  // 카테고리 필터링
  const categories = [
    { id: 'all', name: '전체', icon: '🎮' },
    { id: 'action', name: '액션', icon: '⚡' },
    { id: 'puzzle', name: '퍼즐', icon: '🧩' },
    { id: 'racing', name: '레이싱', icon: '🏎️' },
    { id: 'card', name: '카드', icon: '🃏' },
    { id: 'board', name: '보드', icon: '🎲' }
  ]

  // 난이도 색상
  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'beginner': return '#22c55e'
      case 'intermediate': return '#f59e0b'
      case 'advanced': return '#ef4444'
      default: return '#6b7280'
    }
  }

  // 필터링된 템플릿
  const filteredTemplates = gameTemplates.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e40af 100%)',
        borderRadius: 24,
        padding: 0,
        width: '95vw',
        height: '90vh',
        maxWidth: 1400,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '24px 32px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h1 style={{ 
              margin: 0, 
              color: '#ffffff', 
              fontSize: 24,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              🎮 게임 템플릿 라이브러리
            </h1>
            <p style={{ 
              margin: '4px 0 0 0', 
              color: '#cbd5e1', 
              fontSize: 14 
            }}>
              원하는 장르의 게임을 선택하고 바로 개발을 시작하세요!
            </p>
          </div>
          
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 12,
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

        {/* 필터 및 검색 */}
        <div style={{
          padding: '20px 32px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          {/* 카테고리 필터 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                style={{
                  background: selectedCategory === category.id
                    ? 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)'
                    : 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 20,
                  color: '#ffffff',
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease'
                }}
              >
                {category.icon} {category.name}
              </button>
            ))}
          </div>

          {/* 검색 */}
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="게임 템플릿 검색..."
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 12,
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: 14,
              outline: 'none',
              minWidth: 200
            }}
          />
        </div>

        {/* 템플릿 그리드 */}
        <div style={{
          flex: 1,
          padding: '24px 32px',
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
          gap: 20
        }}>
          {filteredTemplates.map(template => (
            <div
              key={template.id}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 16,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                position: 'relative'
              }}
              onClick={() => onSelectTemplate(template)}
              onMouseOver={(e) => {
                e.target.style.transform = 'translateY(-4px)'
                e.target.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.3)'
                e.target.style.background = 'rgba(255, 255, 255, 0.12)'
              }}
              onMouseOut={(e) => {
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = 'none'
                e.target.style.background = 'rgba(255, 255, 255, 0.08)'
              }}
            >
              {/* 난이도 배지 */}
              <div style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: getDifficultyColor(template.difficulty),
                borderRadius: 12,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                color: '#ffffff'
              }}>
                {template.difficulty === 'beginner' ? '초급' :
                 template.difficulty === 'intermediate' ? '중급' : '고급'}
              </div>

              {/* 템플릿 정보 */}
              <h3 style={{
                margin: '0 0 8px 0',
                color: '#ffffff',
                fontSize: 18,
                fontWeight: 700
              }}>
                {template.name}
              </h3>

              <p style={{
                margin: '0 0 12px 0',
                color: '#cbd5e1',
                fontSize: 14,
                lineHeight: 1.5
              }}>
                {template.description}
              </p>

              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                padding: 12,
                margin: '12px 0',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <p style={{
                  margin: 0,
                  color: '#e2e8f0',
                  fontSize: 12,
                  fontStyle: 'italic'
                }}>
                  {template.preview}
                </p>
              </div>

              {/* 기능 목록 */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 16
              }}>
                {template.features.map((feature, index) => (
                  <span
                    key={index}
                    style={{
                      background: 'rgba(139, 92, 246, 0.2)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: 12,
                      padding: '3px 8px',
                      fontSize: 11,
                      color: '#c4b5fd'
                    }}
                  >
                    {feature}
                  </span>
                ))}
              </div>

              {/* 선택 버튼 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectTemplate(template)
                }}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  border: 'none',
                  borderRadius: 12,
                  color: '#ffffff',
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)'
                }}
              >
                🚀 이 템플릿으로 시작하기
              </button>
            </div>
          ))}
        </div>

        {/* 검색 결과 없음 */}
        {filteredTemplates.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{
              fontSize: 48,
              opacity: 0.5
            }}>
              🔍
            </div>
            <p style={{
              color: '#9ca3af',
              fontSize: 16,
              textAlign: 'center'
            }}>
              검색 조건에 맞는 템플릿이 없습니다.<br />
              다른 카테고리나 검색어를 시도해보세요.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default GameTemplateLibrary