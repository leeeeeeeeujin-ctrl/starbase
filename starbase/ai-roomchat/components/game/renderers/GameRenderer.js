/**
 * 🎨 GameRenderer - 메인 게임 캔버스 렌더링
 * 
 * @description
 * 게임의 메인 캔버스를 렌더링하는 모듈
 * - 캐릭터, 배경, 오브젝트 등 게임 씬 렌더링
 * - Canvas 2D API 사용 (WebGL 폴백 지원)
 * - 모바일 해상도 대응 (devicePixelRatio)
 * - requestAnimationFrame 기반 최적화된 렌더링
 * 
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 * @version 1.0.0
 */

/**
 * @typedef {Object} GameRendererConfig
 * @property {HTMLCanvasElement} canvas - 렌더링할 캔버스 요소
 * @property {number} [width=800] - 캔버스 너비
 * @property {number} [height=600] - 캔버스 높이
 * @property {boolean} [enableWebGL=false] - WebGL 사용 여부 (폴백: Canvas 2D)
 * @property {boolean} [autoResize=true] - 자동 리사이즈 활성화
 * @property {number} [pixelRatio] - 디바이스 픽셀 비율 (기본: window.devicePixelRatio)
 */

/**
 * @typedef {Object} GameEntity
 * @property {number} x - X 좌표
 * @property {number} y - Y 좌표
 * @property {number} [width] - 너비
 * @property {number} [height] - 높이
 * @property {string} [imageUrl] - 이미지 URL
 * @property {string} [type] - 엔티티 타입 (character, background, object)
 */

export class GameRenderer {
  /**
   * GameRenderer 생성자
   * @param {GameRendererConfig} config - 렌더러 설정
   */
  constructor(config) {
    // 필수 파라미터 검증
    if (!config || !config.canvas) {
      throw new Error('[GameRenderer] Canvas element is required')
    }

    this.canvas = config.canvas
    this.width = config.width || 800
    this.height = config.height || 600
    this.enableWebGL = config.enableWebGL || false
    this.autoResize = config.autoResize !== false
    this.pixelRatio = config.pixelRatio || (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1

    // 렌더링 컨텍스트
    this.ctx = null
    this.isWebGL = false

    // 렌더링 상태
    this.isInitialized = false
    this.isRendering = false
    this.animationFrameId = null

    // 캐시된 리소스
    this.imageCache = new Map()
    this.loadingImages = new Map()

    // 렌더링 큐
    this.renderQueue = []

    // 바인딩
    this.handleResize = this.handleResize.bind(this)

    // 자동 초기화
    this.initialize()
  }

  /**
   * 렌더러 초기화
   * @returns {boolean} 초기화 성공 여부
   */
  initialize() {
    if (this.isInitialized) {
      console.warn('[GameRenderer] Already initialized')
      return true
    }

    try {
      // 렌더링 컨텍스트 초기화
      this.initializeContext()

      // 캔버스 크기 설정
      this.resize(this.width, this.height)

      // 리사이즈 이벤트 리스너 등록
      if (this.autoResize && typeof window !== 'undefined') {
        window.addEventListener('resize', this.handleResize)
      }

      this.isInitialized = true
      console.log('[GameRenderer] Initialized successfully', {
        context: this.isWebGL ? 'WebGL' : 'Canvas 2D',
        size: `${this.width}x${this.height}`,
        pixelRatio: this.pixelRatio
      })

      return true
    } catch (error) {
      console.error('[GameRenderer] Initialization failed:', error)
      return false
    }
  }

  /**
   * 렌더링 컨텍스트 초기화 (WebGL 폴백 지원)
   * @private
   */
  initializeContext() {
    // WebGL 시도 (enableWebGL이 true일 때만)
    if (this.enableWebGL) {
      try {
        // WebGL 컨텍스트 생성 시도
        this.ctx = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl')
        if (this.ctx) {
          this.isWebGL = true
          console.log('[GameRenderer] Using WebGL context')
          return
        }
      } catch (e) {
        console.warn('[GameRenderer] WebGL not available, falling back to Canvas 2D')
      }
    }

    // Canvas 2D 폴백 (IE11+ 호환)
    this.ctx = this.canvas.getContext('2d')
    this.isWebGL = false

    if (!this.ctx) {
      throw new Error('[GameRenderer] Failed to get rendering context')
    }

    // Canvas 2D 최적화 설정
    // IE11에서도 동작하는 안전한 설정
    if (this.ctx.imageSmoothingEnabled !== undefined) {
      this.ctx.imageSmoothingEnabled = true
      this.ctx.imageSmoothingQuality = 'high'
    } else if (this.ctx.mozImageSmoothingEnabled !== undefined) {
      // Firefox 폴백
      this.ctx.mozImageSmoothingEnabled = true
    } else if (this.ctx.webkitImageSmoothingEnabled !== undefined) {
      // Safari 폴백
      this.ctx.webkitImageSmoothingEnabled = true
    } else if (this.ctx.msImageSmoothingEnabled !== undefined) {
      // IE11 폴백
      this.ctx.msImageSmoothingEnabled = true
    }

    console.log('[GameRenderer] Using Canvas 2D context')
  }

  /**
   * 캔버스 리사이즈
   * @param {number} width - 새 너비
   * @param {number} height - 새 높이
   */
  resize(width, height) {
    this.width = width
    this.height = height

    // 디바이스 픽셀 비율 적용
    const scaledWidth = Math.floor(width * this.pixelRatio)
    const scaledHeight = Math.floor(height * this.pixelRatio)

    // 캔버스 내부 해상도 설정
    this.canvas.width = scaledWidth
    this.canvas.height = scaledHeight

    // CSS 크기 설정 (실제 표시 크기)
    this.canvas.style.width = width + 'px'
    this.canvas.style.height = height + 'px'

    // Canvas 2D 컨텍스트인 경우 스케일 적용
    if (!this.isWebGL && this.ctx) {
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
   * 이미지 로드 (캐싱 지원)
   * @param {string} url - 이미지 URL
   * @returns {Promise<HTMLImageElement>} 로드된 이미지
   */
  loadImage(url) {
    // 캐시된 이미지 반환
    if (this.imageCache.has(url)) {
      return Promise.resolve(this.imageCache.get(url))
    }

    // 이미 로딩 중인 경우 기존 Promise 반환
    if (this.loadingImages.has(url)) {
      return this.loadingImages.get(url)
    }

    // 새 이미지 로드
    const loadPromise = new Promise((resolve, reject) => {
      const img = new Image()
      
      // CORS 설정 (IE11+ 지원)
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        this.imageCache.set(url, img)
        this.loadingImages.delete(url)
        resolve(img)
      }

      img.onerror = () => {
        this.loadingImages.delete(url)
        console.error('[GameRenderer] Failed to load image:', url)
        reject(new Error('Failed to load image: ' + url))
      }

      img.src = url
    })

    this.loadingImages.set(url, loadPromise)
    return loadPromise
  }

  /**
   * 캔버스 클리어
   * @param {string} [color='#000000'] - 배경색
   */
  clear(color) {
    if (!this.ctx) return

    if (this.isWebGL) {
      // WebGL 클리어
      const r = 0, g = 0, b = 0, a = 1
      this.ctx.clearColor(r, g, b, a)
      this.ctx.clear(this.ctx.COLOR_BUFFER_BIT)
    } else {
      // Canvas 2D 클리어
      if (color) {
        this.ctx.fillStyle = color
        this.ctx.fillRect(0, 0, this.width, this.height)
      } else {
        this.ctx.clearRect(0, 0, this.width, this.height)
      }
    }
  }

  /**
   * 배경 렌더링
   * @param {string} imageUrl - 배경 이미지 URL
   * @param {string} [fallbackColor='#1a1a2e'] - 폴백 배경색
   * @returns {Promise<void>}
   */
  async renderBackground(imageUrl, fallbackColor) {
    if (!this.ctx || this.isWebGL) return

    try {
      if (imageUrl) {
        const img = await this.loadImage(imageUrl)
        this.ctx.drawImage(img, 0, 0, this.width, this.height)
      } else {
        // 폴백 배경색
        this.clear(fallbackColor || '#1a1a2e')
      }
    } catch (error) {
      console.warn('[GameRenderer] Failed to render background, using fallback color')
      this.clear(fallbackColor || '#1a1a2e')
    }
  }

  /**
   * 캐릭터/엔티티 렌더링
   * @param {GameEntity} entity - 렌더링할 엔티티
   * @returns {Promise<void>}
   */
  async renderEntity(entity) {
    if (!this.ctx || this.isWebGL) return

    try {
      if (entity.imageUrl) {
        const img = await this.loadImage(entity.imageUrl)
        const width = entity.width || img.width
        const height = entity.height || img.height
        
        this.ctx.drawImage(img, entity.x, entity.y, width, height)
      } else {
        // 이미지가 없는 경우 플레이스홀더 렌더링
        this.ctx.fillStyle = '#3b82f6'
        this.ctx.fillRect(
          entity.x, 
          entity.y, 
          entity.width || 50, 
          entity.height || 50
        )
      }
    } catch (error) {
      console.warn('[GameRenderer] Failed to render entity:', error)
    }
  }

  /**
   * 텍스트 렌더링
   * @param {string} text - 렌더링할 텍스트
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @param {Object} [options] - 텍스트 옵션
   * @param {string} [options.font='16px sans-serif'] - 폰트
   * @param {string} [options.color='#ffffff'] - 텍스트 색상
   * @param {string} [options.align='left'] - 정렬 (left, center, right)
   * @param {string} [options.baseline='top'] - 베이스라인 (top, middle, bottom)
   */
  renderText(text, x, y, options) {
    if (!this.ctx || this.isWebGL) return

    const opts = options || {}
    
    this.ctx.font = opts.font || '16px sans-serif'
    this.ctx.fillStyle = opts.color || '#ffffff'
    this.ctx.textAlign = opts.align || 'left'
    this.ctx.textBaseline = opts.baseline || 'top'

    this.ctx.fillText(text, x, y)
  }

  /**
   * 프레임 렌더링 (requestAnimationFrame 사용)
   * @param {Function} renderCallback - 프레임마다 호출될 렌더링 콜백
   */
  startRenderLoop(renderCallback) {
    if (this.isRendering) {
      console.warn('[GameRenderer] Render loop already running')
      return
    }

    this.isRendering = true

    const render = (timestamp) => {
      if (!this.isRendering) return

      // 렌더링 콜백 실행
      if (typeof renderCallback === 'function') {
        renderCallback(timestamp, this)
      }

      // 다음 프레임 예약 (IE11+ 호환)
      this.animationFrameId = (
        window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function(callback) { return setTimeout(callback, 1000 / 60) }
      )(render)
    }

    // 첫 프레임 시작
    this.animationFrameId = (
      window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      function(callback) { return setTimeout(callback, 1000 / 60) }
    )(render)
  }

  /**
   * 렌더링 루프 정지
   */
  stopRenderLoop() {
    this.isRendering = false

    if (this.animationFrameId !== null) {
      // IE11+ 호환 cancelAnimationFrame
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
   * 렌더러 정리 (메모리 누수 방지)
   */
  cleanup() {
    // 렌더링 루프 정지
    this.stopRenderLoop()

    // 이벤트 리스너 제거
    if (this.autoResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize)
    }

    // 이미지 캐시 정리
    this.imageCache.clear()
    this.loadingImages.clear()

    // 렌더링 큐 정리
    this.renderQueue = []

    // 컨텍스트 정리
    if (this.ctx && !this.isWebGL) {
      // Canvas 2D 컨텍스트는 별도 정리 불필요
      // 캔버스만 클리어
      this.clear()
    }

    this.ctx = null
    this.canvas = null
    this.isInitialized = false

    console.log('[GameRenderer] Cleanup completed')
  }

  /**
   * 렌더러 상태 정보 반환
   * @returns {Object} 렌더러 상태
   */
  getInfo() {
    return {
      isInitialized: this.isInitialized,
      isRendering: this.isRendering,
      context: this.isWebGL ? 'WebGL' : 'Canvas 2D',
      size: { width: this.width, height: this.height },
      pixelRatio: this.pixelRatio,
      cachedImages: this.imageCache.size,
      loadingImages: this.loadingImages.size
    }
  }
}

export default GameRenderer
