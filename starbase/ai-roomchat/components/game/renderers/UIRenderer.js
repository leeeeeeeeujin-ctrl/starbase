/**
 * 🎯 UIRenderer - UI 오버레이 렌더링
 * 
 * @description
 * 게임 UI 오버레이를 렌더링하는 모듈
 * - 점수, HP, MP 바 렌더링
 * - 인벤토리 UI 렌더링
 * - 미니맵, 퀘스트 트래커 등
 * - Canvas 2D API 기반 고성능 렌더링
 * 
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 * @version 1.0.0
 */

/**
 * @typedef {Object} UIRendererConfig
 * @property {HTMLCanvasElement} canvas - UI 렌더링용 캔버스 (오버레이)
 * @property {number} [width=800] - 캔버스 너비
 * @property {number} [height=600] - 캔버스 높이
 * @property {number} [pixelRatio] - 디바이스 픽셀 비율
 */

/**
 * @typedef {Object} PlayerStats
 * @property {string} name - 플레이어 이름
 * @property {number} hp - 현재 HP
 * @property {number} maxHp - 최대 HP
 * @property {number} mp - 현재 MP
 * @property {number} maxMp - 최대 MP
 * @property {number} level - 레벨
 * @property {number} exp - 현재 경험치
 * @property {number} maxExp - 다음 레벨까지 필요 경험치
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string} id - 아이템 ID
 * @property {string} name - 아이템 이름
 * @property {string} [iconUrl] - 아이콘 이미지 URL
 * @property {number} [count] - 개수
 */

export class UIRenderer {
  /**
   * UIRenderer 생성자
   * @param {UIRendererConfig} config - 렌더러 설정
   */
  constructor(config) {
    if (!config || !config.canvas) {
      throw new Error('[UIRenderer] Canvas element is required')
    }

    this.canvas = config.canvas
    this.width = config.width || 800
    this.height = config.height || 600
    this.pixelRatio = config.pixelRatio || (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1

    // 렌더링 컨텍스트
    this.ctx = null

    // UI 상태
    this.isInitialized = false
    this.lastRenderTime = 0

    // UI 요소 위치 (반응형 대응)
    this.layout = {
      statsBar: { x: 10, y: 10, width: 300, height: 80 },
      inventory: { x: 10, y: 100, width: 200, height: 400 },
      miniMap: { x: this.width - 210, y: 10, width: 200, height: 200 },
    }

    // 이미지 캐시
    this.iconCache = new Map()

    // 바인딩
    this.handleResize = this.handleResize.bind(this)

    // 초기화
    this.initialize()
  }

  /**
   * UIRenderer 초기화
   * @returns {boolean} 초기화 성공 여부
   */
  initialize() {
    if (this.isInitialized) {
      console.warn('[UIRenderer] Already initialized')
      return true
    }

    try {
      // Canvas 2D 컨텍스트 획득
      this.ctx = this.canvas.getContext('2d')
      if (!this.ctx) {
        throw new Error('[UIRenderer] Failed to get 2D context')
      }

      // 캔버스 크기 설정
      this.resize(this.width, this.height)

      // 리사이즈 이벤트 리스너 (자동 레이아웃 조정)
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', this.handleResize)
      }

      this.isInitialized = true
      console.log('[UIRenderer] Initialized successfully')

      return true
    } catch (error) {
      console.error('[UIRenderer] Initialization failed:', error)
      return false
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

    // 디바이스 픽셀 비율 적용
    const scaledWidth = Math.floor(width * this.pixelRatio)
    const scaledHeight = Math.floor(height * this.pixelRatio)

    this.canvas.width = scaledWidth
    this.canvas.height = scaledHeight

    this.canvas.style.width = width + 'px'
    this.canvas.style.height = height + 'px'

    if (this.ctx) {
      this.ctx.scale(this.pixelRatio, this.pixelRatio)
    }

    // 레이아웃 재계산
    this.updateLayout()
  }

  /**
   * UI 레이아웃 업데이트
   * @private
   */
  updateLayout() {
    // 미니맵 위치 조정 (오른쪽 상단 고정)
    this.layout.miniMap.x = this.width - 210

    // 반응형 크기 조정 (작은 화면 대응)
    if (this.width < 600) {
      this.layout.statsBar.width = this.width - 20
      this.layout.inventory.width = this.width - 20
      this.layout.miniMap.width = 150
      this.layout.miniMap.height = 150
      this.layout.miniMap.x = this.width - 160
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
   * 플레이어 스탯 바 렌더링
   * @param {PlayerStats} stats - 플레이어 스탯
   */
  renderStatsBar(stats) {
    if (!this.ctx) return

    const layout = this.layout.statsBar
    const ctx = this.ctx

    // 배경 (반투명)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(layout.x, layout.y, layout.width, layout.height)

    // 테두리
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'
    ctx.lineWidth = 2
    ctx.strokeRect(layout.x, layout.y, layout.width, layout.height)

    // 플레이어 이름
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(stats.name || 'Player', layout.x + 10, layout.y + 20)

    // 레벨
    ctx.fillStyle = '#fbbf24'
    ctx.font = '12px sans-serif'
    ctx.fillText('Lv.' + (stats.level || 1), layout.x + 10, layout.y + 38)

    // HP 바
    const hpBarWidth = layout.width - 80
    const hpBarX = layout.x + 70
    const hpBarY = layout.y + 15

    this.renderBar(
      hpBarX, hpBarY, hpBarWidth, 12,
      stats.hp || 0, stats.maxHp || 100,
      '#ef4444', '#991b1b',
      'HP'
    )

    // MP 바
    const mpBarY = layout.y + 32

    this.renderBar(
      hpBarX, mpBarY, hpBarWidth, 12,
      stats.mp || 0, stats.maxMp || 50,
      '#3b82f6', '#1e40af',
      'MP'
    )

    // EXP 바
    if (stats.exp !== undefined && stats.maxExp !== undefined) {
      const expBarY = layout.y + 49

      this.renderBar(
        hpBarX, expBarY, hpBarWidth, 12,
        stats.exp, stats.maxExp,
        '#22c55e', '#15803d',
        'EXP'
      )
    }
  }

  /**
   * 프로그레스 바 렌더링 (범용)
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @param {number} width - 바 너비
   * @param {number} height - 바 높이
   * @param {number} current - 현재 값
   * @param {number} max - 최대 값
   * @param {string} fillColor - 채움 색상
   * @param {string} bgColor - 배경 색상
   * @param {string} [label] - 레이블 텍스트
   * @private
   */
  renderBar(x, y, width, height, current, max, fillColor, bgColor, label) {
    const ctx = this.ctx
    if (!ctx) return

    // 안전한 값 계산 (0으로 나누기 방지)
    const percentage = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0
    const fillWidth = Math.floor(width * percentage)

    // 배경
    ctx.fillStyle = bgColor
    ctx.fillRect(x, y, width, height)

    // 채움
    ctx.fillStyle = fillColor
    ctx.fillRect(x, y, fillWidth, height)

    // 테두리
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, width, height)

    // 레이블 및 수치
    if (label) {
      ctx.fillStyle = '#ffffff'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(
        label + ': ' + Math.floor(current) + '/' + Math.floor(max),
        x + 4,
        y + height - 2
      )
    }
  }

  /**
   * 인벤토리 렌더링
   * @param {InventoryItem[]} items - 인벤토리 아이템 배열
   * @param {number} [maxSlots=12] - 최대 슬롯 개수
   */
  renderInventory(items, maxSlots) {
    if (!this.ctx) return

    const layout = this.layout.inventory
    const ctx = this.ctx
    const slots = maxSlots || 12
    const cols = 4
    const rows = Math.ceil(slots / cols)
    const slotSize = 40
    const padding = 5

    // 배경
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(layout.x, layout.y, layout.width, layout.height)

    // 제목
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('Inventory', layout.x + 10, layout.y + 20)

    // 슬롯 렌더링
    for (let i = 0; i < slots; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const slotX = layout.x + 10 + col * (slotSize + padding)
      const slotY = layout.y + 30 + row * (slotSize + padding)

      // 슬롯 배경
      ctx.fillStyle = 'rgba(30, 41, 59, 0.8)'
      ctx.fillRect(slotX, slotY, slotSize, slotSize)

      // 슬롯 테두리
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.8)'
      ctx.lineWidth = 1
      ctx.strokeRect(slotX, slotY, slotSize, slotSize)

      // 아이템 렌더링
      if (items && items[i]) {
        const item = items[i]

        // 아이템 아이콘 (이미지 또는 플레이스홀더)
        if (item.iconUrl) {
          // 비동기 이미지 로딩은 별도 처리 필요
          // 여기서는 플레이스홀더 사용
          ctx.fillStyle = '#3b82f6'
          ctx.fillRect(slotX + 5, slotY + 5, slotSize - 10, slotSize - 10)
        } else {
          // 기본 아이콘
          ctx.fillStyle = '#64748b'
          ctx.fillRect(slotX + 5, slotY + 5, slotSize - 10, slotSize - 10)
        }

        // 아이템 개수
        if (item.count && item.count > 1) {
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 10px sans-serif'
          ctx.textAlign = 'right'
          ctx.fillText(item.count.toString(), slotX + slotSize - 4, slotY + slotSize - 4)
        }
      }
    }
  }

  /**
   * 미니맵 렌더링
   * @param {Object} mapData - 맵 데이터
   * @param {Object} playerPos - 플레이어 위치 {x, y}
   */
  renderMiniMap(mapData, playerPos) {
    if (!this.ctx) return

    const layout = this.layout.miniMap
    const ctx = this.ctx

    // 배경
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(layout.x, layout.y, layout.width, layout.height)

    // 테두리
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'
    ctx.lineWidth = 2
    ctx.strokeRect(layout.x, layout.y, layout.width, layout.height)

    // 제목
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText('Map', layout.x + 10, layout.y + 20)

    // 맵 그리드 (간단한 예시)
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)'
    ctx.lineWidth = 1
    const gridSize = 20

    for (let i = 0; i <= layout.width / gridSize; i++) {
      const x = layout.x + i * gridSize
      ctx.beginPath()
      ctx.moveTo(x, layout.y + 30)
      ctx.lineTo(x, layout.y + layout.height - 10)
      ctx.stroke()
    }

    for (let i = 0; i <= (layout.height - 40) / gridSize; i++) {
      const y = layout.y + 30 + i * gridSize
      ctx.beginPath()
      ctx.moveTo(layout.x + 10, y)
      ctx.lineTo(layout.x + layout.width - 10, y)
      ctx.stroke()
    }

    // 플레이어 위치 표시
    if (playerPos) {
      const centerX = layout.x + layout.width / 2
      const centerY = layout.y + 30 + (layout.height - 40) / 2

      ctx.fillStyle = '#3b82f6'
      ctx.beginPath()
      ctx.arc(centerX, centerY, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /**
   * 메시지 박스 렌더링
   * @param {string} message - 메시지 텍스트
   * @param {Object} [options] - 옵션
   * @param {string} [options.type='info'] - 메시지 타입 (info, warning, error, success)
   * @param {number} [options.duration=3000] - 표시 시간 (ms)
   */
  renderMessage(message, options) {
    if (!this.ctx || !message) return

    const opts = options || {}
    const type = opts.type || 'info'
    
    // 메시지 박스 위치 (중앙 하단)
    const boxWidth = Math.min(400, this.width - 40)
    const boxHeight = 60
    const boxX = (this.width - boxWidth) / 2
    const boxY = this.height - boxHeight - 20

    const ctx = this.ctx

    // 타입별 색상
    const colors = {
      info: { bg: 'rgba(59, 130, 246, 0.9)', border: '#3b82f6' },
      warning: { bg: 'rgba(251, 191, 36, 0.9)', border: '#fbbf24' },
      error: { bg: 'rgba(239, 68, 68, 0.9)', border: '#ef4444' },
      success: { bg: 'rgba(34, 197, 94, 0.9)', border: '#22c55e' }
    }

    const color = colors[type] || colors.info

    // 배경
    ctx.fillStyle = color.bg
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight)

    // 테두리
    ctx.strokeStyle = color.border
    ctx.lineWidth = 2
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)

    // 메시지 텍스트
    ctx.fillStyle = '#ffffff'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(message, boxX + boxWidth / 2, boxY + boxHeight / 2)
  }

  /**
   * 전체 UI 렌더링
   * @param {Object} uiData - UI 데이터
   * @param {PlayerStats} uiData.stats - 플레이어 스탯
   * @param {InventoryItem[]} uiData.inventory - 인벤토리 아이템
   * @param {Object} uiData.mapData - 맵 데이터
   * @param {Object} uiData.playerPos - 플레이어 위치
   * @param {string} uiData.message - 메시지
   */
  render(uiData) {
    if (!this.ctx) return

    // 캔버스 클리어
    this.clear()

    // 각 UI 요소 렌더링
    if (uiData.stats) {
      this.renderStatsBar(uiData.stats)
    }

    if (uiData.inventory) {
      this.renderInventory(uiData.inventory)
    }

    if (uiData.mapData && uiData.playerPos) {
      this.renderMiniMap(uiData.mapData, uiData.playerPos)
    }

    if (uiData.message) {
      this.renderMessage(uiData.message, uiData.messageOptions)
    }

    this.lastRenderTime = Date.now()
  }

  /**
   * 정리 작업 (메모리 누수 방지)
   */
  cleanup() {
    // 이벤트 리스너 제거
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize)
    }

    // 이미지 캐시 정리
    this.iconCache.clear()

    // 컨텍스트 정리
    if (this.ctx) {
      this.clear()
    }

    this.ctx = null
    this.canvas = null
    this.isInitialized = false

    console.log('[UIRenderer] Cleanup completed')
  }

  /**
   * 렌더러 상태 정보 반환
   * @returns {Object} 렌더러 상태
   */
  getInfo() {
    return {
      isInitialized: this.isInitialized,
      size: { width: this.width, height: this.height },
      pixelRatio: this.pixelRatio,
      lastRenderTime: this.lastRenderTime,
      layout: this.layout
    }
  }
}

export default UIRenderer
