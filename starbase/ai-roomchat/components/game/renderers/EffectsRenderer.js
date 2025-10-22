/**
 * EffectsRenderer - 시각 효과 렌더링 모듈
 * 파티클, 애니메이션, 트랜지션 등 시각 효과를 렌더링
 */
export default class EffectsRenderer {
  constructor(options = {}) {
    this.canvas = null
    this.ctx = null
    this.effects = []
    this.options = {
      maxEffects: 100,
      enableParticles: true,
      ...options,
    }
    this.isInitialized = false
  }

  /**
   * 효과 렌더러 초기화
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
      this.canvas.style.pointerEvents = 'none'
      this.canvas.style.zIndex = '5'
      
      this.ctx = this.canvas.getContext('2d')
      containerElement.appendChild(this.canvas)
      
      this.isInitialized = true
      return true
    } catch (error) {
      console.error('[EffectsRenderer] 초기화 실패:', error)
      return false
    }
  }

  /**
   * 효과 렌더링
   */
  render(deltaTime) {
    if (!this.isInitialized || !this.ctx) return

    try {
      // 화면 클리어
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

      // 효과 업데이트 및 렌더링
      this.effects = this.effects.filter(effect => {
        effect.update(deltaTime)
        
        if (!effect.isAlive()) {
          return false
        }

        effect.render(this.ctx)
        return true
      })
    } catch (error) {
      console.error('[EffectsRenderer] 렌더링 오류:', error)
    }
  }

  /**
   * 효과 추가
   */
  addEffect(type, options = {}) {
    if (this.effects.length >= this.options.maxEffects) {
      this.effects.shift() // 가장 오래된 효과 제거
    }

    let effect
    switch (type) {
      case 'particle':
        effect = new ParticleEffect(options)
        break
      case 'flash':
        effect = new FlashEffect(options)
        break
      case 'shake':
        effect = new ShakeEffect(options)
        break
      default:
        console.warn(`[EffectsRenderer] 알 수 없는 효과 타입: ${type}`)
        return
    }

    this.effects.push(effect)
  }

  /**
   * 모든 효과 제거
   */
  clearEffects() {
    this.effects = []
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    this.clearEffects()
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

/**
 * 파티클 효과 클래스
 */
class ParticleEffect {
  constructor(options = {}) {
    this.x = options.x || 0
    this.y = options.y || 0
    this.vx = options.vx || (Math.random() - 0.5) * 5
    this.vy = options.vy || (Math.random() - 0.5) * 5
    this.size = options.size || 5
    this.color = options.color || '#38bdf8'
    this.life = options.life || 1
    this.decay = options.decay || 0.02
  }

  update(deltaTime) {
    this.x += this.vx * deltaTime
    this.y += this.vy * deltaTime
    this.life -= this.decay * deltaTime
  }

  isAlive() {
    return this.life > 0
  }

  render(ctx) {
    ctx.globalAlpha = this.life
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

/**
 * 플래시 효과 클래스
 */
class FlashEffect {
  constructor(options = {}) {
    this.color = options.color || 'white'
    this.duration = options.duration || 0.2
    this.elapsed = 0
  }

  update(deltaTime) {
    this.elapsed += deltaTime
  }

  isAlive() {
    return this.elapsed < this.duration
  }

  render(ctx) {
    const alpha = 1 - (this.elapsed / this.duration)
    ctx.globalAlpha = alpha * 0.5
    ctx.fillStyle = this.color
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.globalAlpha = 1
  }
}

/**
 * 흔들림 효과 클래스
 */
class ShakeEffect {
  constructor(options = {}) {
    this.intensity = options.intensity || 10
    this.duration = options.duration || 0.3
    this.elapsed = 0
  }

  update(deltaTime) {
    this.elapsed += deltaTime
  }

  isAlive() {
    return this.elapsed < this.duration
  }

  render(ctx) {
    // 흔들림은 canvas transform으로 구현되어야 하므로
    // 실제 구현에서는 부모 컨테이너를 흔들어야 함
  }

  getOffset() {
    if (!this.isAlive()) return { x: 0, y: 0 }
    
    const progress = this.elapsed / this.duration
    const intensity = this.intensity * (1 - progress)
    
    return {
      x: (Math.random() - 0.5) * intensity,
      y: (Math.random() - 0.5) * intensity,
    }
  }
}
