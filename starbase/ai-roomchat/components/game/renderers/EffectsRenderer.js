/**
 * ✨ EffectsRenderer - 파티클 및 애니메이션 효과 렌더링
 * 
 * @description
 * 게임 시각 효과를 렌더링하는 모듈
 * - 파티클 시스템 (폭발, 불꽃, 연기 등)
 * - 트윈 애니메이션
 * - 화면 효과 (페이드, 쉐이크 등)
 * - requestAnimationFrame 최적화
 * 
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 * @version 1.0.0
 */

/**
 * @typedef {Object} EffectsRendererConfig
 * @property {HTMLCanvasElement} canvas - 효과 렌더링용 캔버스
 * @property {number} [width=800] - 캔버스 너비
 * @property {number} [height=600] - 캔버스 높이
 * @property {number} [pixelRatio] - 디바이스 픽셀 비율
 * @property {number} [maxParticles=1000] - 최대 파티클 수
 */

/**
 * @typedef {Object} Particle
 * @property {number} x - X 좌표
 * @property {number} y - Y 좌표
 * @property {number} vx - X 속도
 * @property {number} vy - Y 속도
 * @property {number} life - 수명 (0~1)
 * @property {number} maxLife - 최대 수명
 * @property {number} size - 크기
 * @property {string} color - 색상
 * @property {number} alpha - 투명도 (0~1)
 */

/**
 * @typedef {Object} AnimationEffect
 * @property {string} type - 효과 타입 (fade, shake, flash 등)
 * @property {number} startTime - 시작 시간
 * @property {number} duration - 지속 시간
 * @property {Function} update - 업데이트 함수
 */

export class EffectsRenderer {
  /**
   * EffectsRenderer 생성자
   * @param {EffectsRendererConfig} config - 렌더러 설정
   */
  constructor(config) {
    if (!config || !config.canvas) {
      throw new Error('[EffectsRenderer] Canvas element is required')
    }

    this.canvas = config.canvas
    this.width = config.width || 800
    this.height = config.height || 600
    this.pixelRatio = config.pixelRatio || (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1
    this.maxParticles = config.maxParticles || 1000

    // 렌더링 컨텍스트
    this.ctx = null

    // 효과 상태
    this.isInitialized = false
    this.isAnimating = false
    this.animationFrameId = null

    // 파티클 풀 (메모리 최적화)
    this.particles = []
    this.activeParticles = []

    // 애니메이션 효과
    this.effects = []

    // 화면 효과 상태
    this.screenEffects = {
      shake: { active: false, intensity: 0, duration: 0, startTime: 0 },
      fade: { active: false, alpha: 0, target: 0, duration: 0, startTime: 0 },
      flash: { active: false, color: '#ffffff', alpha: 0, duration: 0, startTime: 0 }
    }

    // 바인딩
    this.handleResize = this.handleResize.bind(this)
    this.animate = this.animate.bind(this)

    // 초기화
    this.initialize()
  }

  /**
   * EffectsRenderer 초기화
   * @returns {boolean} 초기화 성공 여부
   */
  initialize() {
    if (this.isInitialized) {
      console.warn('[EffectsRenderer] Already initialized')
      return true
    }

    try {
      // Canvas 2D 컨텍스트 획득
      this.ctx = this.canvas.getContext('2d')
      if (!this.ctx) {
        throw new Error('[EffectsRenderer] Failed to get 2D context')
      }

      // 캔버스 크기 설정
      this.resize(this.width, this.height)

      // 파티클 풀 초기화 (메모리 최적화)
      this.initializeParticlePool()

      // 리사이즈 이벤트 리스너
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', this.handleResize)
      }

      this.isInitialized = true
      console.log('[EffectsRenderer] Initialized successfully')

      return true
    } catch (error) {
      console.error('[EffectsRenderer] Initialization failed:', error)
      return false
    }
  }

  /**
   * 파티클 풀 초기화 (메모리 재사용)
   * @private
   */
  initializeParticlePool() {
    this.particles = []
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: 0, y: 0,
        vx: 0, vy: 0,
        life: 0, maxLife: 1,
        size: 2, color: '#ffffff',
        alpha: 1,
        active: false
      })
    }
  }

  /**
   * 캔버스 리사이즈
   * @param {number} width - 새 너비
   * @param {number} height - 새 높이
   */
  resize(width, height) {
    this.width = width
    this.height = height

    const scaledWidth = Math.floor(width * this.pixelRatio)
    const scaledHeight = Math.floor(height * this.pixelRatio)

    this.canvas.width = scaledWidth
    this.canvas.height = scaledHeight

    this.canvas.style.width = width + 'px'
    this.canvas.style.height = height + 'px'

    if (this.ctx) {
      this.ctx.scale(this.pixelRatio, this.pixelRatio)
    }
  }

  /**
   * 윈도우 리사이즈 핸들러
   * @private
   */
  handleResize() {
    if (!this.canvas || !this.canvas.parentElement) return

    const parent = this.canvas.parentElement
    const width = parent.clientWidth || this.width
    const height = parent.clientHeight || this.height

    this.resize(width, height)
  }

  /**
   * 캔버스 클리어
   */
  clear() {
    if (!this.ctx) return
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  /**
   * 비활성 파티클 가져오기
   * @private
   * @returns {Particle|null}
   */
  getInactiveParticle() {
    for (let i = 0; i < this.particles.length; i++) {
      if (!this.particles[i].active) {
        return this.particles[i]
      }
    }
    return null
  }

  /**
   * 파티클 이미터 (폭발 효과)
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @param {Object} [options] - 옵션
   * @param {number} [options.count=20] - 파티클 개수
   * @param {string} [options.color='#ff6b35'] - 색상
   * @param {number} [options.speed=5] - 속도
   * @param {number} [options.life=1] - 수명 (초)
   */
  emitExplosion(x, y, options) {
    const opts = options || {}
    const count = opts.count || 20
    const color = opts.color || '#ff6b35'
    const speed = opts.speed || 5
    const life = opts.life || 1

    for (let i = 0; i < count; i++) {
      const particle = this.getInactiveParticle()
      if (!particle) break

      const angle = (Math.PI * 2 * i) / count
      const velocity = speed * (0.5 + Math.random() * 0.5)

      particle.x = x
      particle.y = y
      particle.vx = Math.cos(angle) * velocity
      particle.vy = Math.sin(angle) * velocity
      particle.life = 1
      particle.maxLife = life
      particle.size = 2 + Math.random() * 3
      particle.color = color
      particle.alpha = 1
      particle.active = true

      this.activeParticles.push(particle)
    }
  }

  /**
   * 파티클 스트림 (연속 방출)
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @param {number} angle - 방출 각도 (라디안)
   * @param {Object} [options] - 옵션
   * @param {string} [options.color='#4ade80'] - 색상
   * @param {number} [options.speed=3] - 속도
   * @param {number} [options.spread=0.5] - 퍼짐 정도
   */
  emitStream(x, y, angle, options) {
    const opts = options || {}
    const color = opts.color || '#4ade80'
    const speed = opts.speed || 3
    const spread = opts.spread || 0.5

    const particle = this.getInactiveParticle()
    if (!particle) return

    const spreadAngle = angle + (Math.random() - 0.5) * spread
    const velocity = speed * (0.8 + Math.random() * 0.4)

    particle.x = x
    particle.y = y
    particle.vx = Math.cos(spreadAngle) * velocity
    particle.vy = Math.sin(spreadAngle) * velocity
    particle.life = 1
    particle.maxLife = 0.5 + Math.random() * 0.5
    particle.size = 2 + Math.random() * 2
    particle.color = color
    particle.alpha = 1
    particle.active = true

    this.activeParticles.push(particle)
  }

  /**
   * 파티클 업데이트
   * @param {number} deltaTime - 프레임 시간 (초)
   * @private
   */
  updateParticles(deltaTime) {
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const particle = this.activeParticles[i]

      // 위치 업데이트
      particle.x += particle.vx * deltaTime
      particle.y += particle.vy * deltaTime

      // 중력 적용
      particle.vy += 9.8 * deltaTime

      // 수명 감소
      particle.life -= deltaTime / particle.maxLife

      // 알파 감소 (페이드 아웃)
      particle.alpha = Math.max(0, particle.life)

      // 파티클 제거
      if (particle.life <= 0 || particle.y > this.height) {
        particle.active = false
        this.activeParticles.splice(i, 1)
      }
    }
  }

  /**
   * 파티클 렌더링
   * @private
   */
  renderParticles() {
    if (!this.ctx) return

    const ctx = this.ctx

    for (let i = 0; i < this.activeParticles.length; i++) {
      const particle = this.activeParticles[i]

      ctx.globalAlpha = particle.alpha
      ctx.fillStyle = particle.color

      // 원형 파티클
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.globalAlpha = 1
  }

  /**
   * 화면 흔들림 효과 시작
   * @param {number} intensity - 강도 (픽셀)
   * @param {number} duration - 지속 시간 (초)
   */
  shakeScreen(intensity, duration) {
    this.screenEffects.shake = {
      active: true,
      intensity: intensity || 10,
      duration: (duration || 0.5) * 1000,
      startTime: Date.now()
    }
  }

  /**
   * 화면 페이드 효과 시작
   * @param {number} targetAlpha - 목표 투명도 (0~1)
   * @param {number} duration - 지속 시간 (초)
   */
  fadeScreen(targetAlpha, duration) {
    this.screenEffects.fade = {
      active: true,
      alpha: this.screenEffects.fade.alpha || 0,
      target: targetAlpha,
      duration: (duration || 1) * 1000,
      startTime: Date.now()
    }
  }

  /**
   * 화면 플래시 효과 시작
   * @param {string} color - 플래시 색상
   * @param {number} duration - 지속 시간 (초)
   */
  flashScreen(color, duration) {
    this.screenEffects.flash = {
      active: true,
      color: color || '#ffffff',
      alpha: 1,
      duration: (duration || 0.3) * 1000,
      startTime: Date.now()
    }
  }

  /**
   * 화면 효과 업데이트
   * @private
   */
  updateScreenEffects() {
    const now = Date.now()

    // 흔들림 효과
    const shake = this.screenEffects.shake
    if (shake.active) {
      const elapsed = now - shake.startTime
      if (elapsed >= shake.duration) {
        shake.active = false
        // 원래 위치로 복원
        if (this.canvas) {
          this.canvas.style.transform = 'translate(0, 0)'
        }
      } else {
        // 랜덤 흔들림 적용
        const progress = elapsed / shake.duration
        const intensity = shake.intensity * (1 - progress)
        const offsetX = (Math.random() - 0.5) * intensity * 2
        const offsetY = (Math.random() - 0.5) * intensity * 2
        
        if (this.canvas) {
          this.canvas.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px)'
        }
      }
    }

    // 페이드 효과
    const fade = this.screenEffects.fade
    if (fade.active) {
      const elapsed = now - fade.startTime
      if (elapsed >= fade.duration) {
        fade.active = false
        fade.alpha = fade.target
      } else {
        const progress = elapsed / fade.duration
        fade.alpha = fade.alpha + (fade.target - fade.alpha) * progress
      }
    }

    // 플래시 효과
    const flash = this.screenEffects.flash
    if (flash.active) {
      const elapsed = now - flash.startTime
      if (elapsed >= flash.duration) {
        flash.active = false
        flash.alpha = 0
      } else {
        const progress = elapsed / flash.duration
        flash.alpha = 1 - progress
      }
    }
  }

  /**
   * 화면 효과 렌더링
   * @private
   */
  renderScreenEffects() {
    if (!this.ctx) return

    const ctx = this.ctx

    // 페이드 효과
    if (this.screenEffects.fade.active || this.screenEffects.fade.alpha > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, ' + this.screenEffects.fade.alpha + ')'
      ctx.fillRect(0, 0, this.width, this.height)
    }

    // 플래시 효과
    if (this.screenEffects.flash.active || this.screenEffects.flash.alpha > 0) {
      const flash = this.screenEffects.flash
      
      // 색상 파싱 (간단한 hex 파싱)
      let r = 255, g = 255, b = 255
      if (flash.color.startsWith('#')) {
        const hex = flash.color.substring(1)
        r = parseInt(hex.substring(0, 2), 16)
        g = parseInt(hex.substring(2, 4), 16)
        b = parseInt(hex.substring(4, 6), 16)
      }

      ctx.fillStyle = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + flash.alpha + ')'
      ctx.fillRect(0, 0, this.width, this.height)
    }
  }

  /**
   * 애니메이션 루프 시작
   */
  startAnimation() {
    if (this.isAnimating) {
      console.warn('[EffectsRenderer] Animation already running')
      return
    }

    this.isAnimating = true
    this.lastFrameTime = Date.now()

    // 애니메이션 루프 시작 (IE11+ 호환)
    this.animationFrameId = (
      window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      function(callback) { return setTimeout(callback, 1000 / 60) }
    )(this.animate)
  }

  /**
   * 애니메이션 프레임 처리
   * @param {number} timestamp - 프레임 타임스탬프
   * @private
   */
  animate(timestamp) {
    if (!this.isAnimating) return

    // 델타 타임 계산
    const now = Date.now()
    const deltaTime = (now - (this.lastFrameTime || now)) / 1000
    this.lastFrameTime = now

    // 캔버스 클리어
    this.clear()

    // 파티클 업데이트 및 렌더링
    this.updateParticles(deltaTime)
    this.renderParticles()

    // 화면 효과 업데이트 및 렌더링
    this.updateScreenEffects()
    this.renderScreenEffects()

    // 다음 프레임 예약
    this.animationFrameId = (
      window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      function(callback) { return setTimeout(callback, 1000 / 60) }
    )(this.animate)
  }

  /**
   * 애니메이션 루프 정지
   */
  stopAnimation() {
    this.isAnimating = false

    if (this.animationFrameId !== null) {
      (
        window.cancelAnimationFrame ||
        window.webkitCancelAnimationFrame ||
        window.mozCancelAnimationFrame ||
        window.msCancelAnimationFrame ||
        clearTimeout
      )(this.animationFrameId)

      this.animationFrameId = null
    }
  }

  /**
   * 모든 효과 제거
   */
  clearAllEffects() {
    // 파티클 제거
    this.activeParticles.forEach(p => { p.active = false })
    this.activeParticles = []

    // 화면 효과 제거
    this.screenEffects.shake.active = false
    this.screenEffects.fade.active = false
    this.screenEffects.flash.active = false

    // 화면 변형 제거
    if (this.canvas) {
      this.canvas.style.transform = 'translate(0, 0)'
    }

    // 캔버스 클리어
    this.clear()
  }

  /**
   * 정리 작업 (메모리 누수 방지)
   */
  cleanup() {
    // 애니메이션 정지
    this.stopAnimation()

    // 효과 제거
    this.clearAllEffects()

    // 이벤트 리스너 제거
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize)
    }

    // 파티클 풀 정리
    this.particles = []
    this.activeParticles = []

    // 컨텍스트 정리
    this.ctx = null
    this.canvas = null
    this.isInitialized = false

    console.log('[EffectsRenderer] Cleanup completed')
  }

  /**
   * 렌더러 상태 정보 반환
   * @returns {Object} 렌더러 상태
   */
  getInfo() {
    return {
      isInitialized: this.isInitialized,
      isAnimating: this.isAnimating,
      size: { width: this.width, height: this.height },
      pixelRatio: this.pixelRatio,
      activeParticles: this.activeParticles.length,
      maxParticles: this.maxParticles,
      screenEffects: {
        shake: this.screenEffects.shake.active,
        fade: this.screenEffects.fade.active,
        flash: this.screenEffects.flash.active
      }
    }
  }
}

export default EffectsRenderer
