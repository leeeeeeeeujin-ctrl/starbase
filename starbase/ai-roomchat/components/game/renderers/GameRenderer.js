/**
 * GameRenderer - 게임 캔버스 렌더링 모듈
 * 게임의 메인 비주얼 요소(캐릭터, 배경, 엔티티)를 렌더링
 */
export default class GameRenderer {
  constructor(options = {}) {
    this.canvas = null
    this.ctx = null
    this.options = {
      enableAnimations: true,
      performanceTier: 'medium',
      ...options,
    }
    this.isInitialized = false
  }

  /**
   * 렌더러 초기화
   */
  async initialize(containerElement) {
    try {
      if (!containerElement) {
        throw new Error('Container element is required')
      }

      this.canvas = document.createElement('canvas')
      this.canvas.width = containerElement.clientWidth || 800
      this.canvas.height = containerElement.clientHeight || 600
      this.canvas.style.position = 'absolute'
      this.canvas.style.top = '0'
      this.canvas.style.left = '0'
      
      this.ctx = this.canvas.getContext('2d')
      containerElement.appendChild(this.canvas)
      
      this.isInitialized = true
      return true
    } catch (error) {
      console.error('[GameRenderer] 초기화 실패:', error)
      return false
    }
  }

  /**
   * 게임 화면 렌더링
   */
  render(gameState) {
    if (!this.isInitialized || !this.ctx) return

    try {
      // 화면 클리어
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

      // 배경 렌더링
      this.renderBackground(gameState)

      // 엔티티 렌더링
      this.renderEntities(gameState)

      // 캐릭터 렌더링
      this.renderCharacter(gameState)
    } catch (error) {
      console.error('[GameRenderer] 렌더링 오류:', error)
    }
  }

  /**
   * 배경 렌더링
   */
  renderBackground(gameState) {
    const { characterData } = gameState
    if (characterData?.background_url) {
      // 실제 구현에서는 이미지 로딩 및 캐싱 필요
      this.ctx.fillStyle = '#1e293b'
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    } else {
      this.ctx.fillStyle = '#1e293b'
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }

  /**
   * 엔티티 렌더링
   */
  renderEntities(gameState) {
    const { gameState: state } = gameState
    if (!state?.entities) return

    state.entities.forEach(entity => {
      this.ctx.fillStyle = entity.color || '#38bdf8'
      this.ctx.fillRect(entity.x || 0, entity.y || 0, entity.width || 32, entity.height || 32)
    })
  }

  /**
   * 캐릭터 렌더링
   */
  renderCharacter(gameState) {
    const { characterData } = gameState
    if (!characterData) return

    // 간단한 캐릭터 표현
    const x = this.canvas.width / 2
    const y = this.canvas.height / 2
    
    this.ctx.fillStyle = '#22c55e'
    this.ctx.beginPath()
    this.ctx.arc(x, y, 30, 0, Math.PI * 2)
    this.ctx.fill()
    
    // 캐릭터 이름 표시
    if (characterData.name) {
      this.ctx.fillStyle = 'white'
      this.ctx.font = '14px sans-serif'
      this.ctx.textAlign = 'center'
      this.ctx.fillText(characterData.name, x, y + 50)
    }
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas)
    }
    this.canvas = null
    this.ctx = null
    this.isInitialized = false
  }

  /**
   * 캔버스 리사이즈
   */
  resize(width, height) {
    if (this.canvas) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }
}
