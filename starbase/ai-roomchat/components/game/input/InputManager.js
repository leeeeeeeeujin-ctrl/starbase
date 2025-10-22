/**
 * InputManager - 사용자 입력 관리 모듈
 * 키보드, 마우스, 터치 입력을 처리하고 게임 액션으로 변환
 */
export default class InputManager {
  constructor(options = {}) {
    this.options = {
      enableKeyboard: true,
      enableMouse: true,
      enableTouch: true,
      ...options,
    }
    this.listeners = []
    this.inputQueue = []
    this.isInitialized = false
    this.eventHandlers = {}
  }

  /**
   * 입력 관리자 초기화
   */
  async initialize(targetElement) {
    try {
      if (!targetElement) {
        throw new Error('Target element is required')
      }

      this.targetElement = targetElement

      // 키보드 이벤트 설정
      if (this.options.enableKeyboard) {
        this.setupKeyboardEvents()
      }

      // 마우스 이벤트 설정
      if (this.options.enableMouse) {
        this.setupMouseEvents()
      }

      // 터치 이벤트 설정
      if (this.options.enableTouch) {
        this.setupTouchEvents()
      }

      this.isInitialized = true
      return true
    } catch (error) {
      console.error('[InputManager] 초기화 실패:', error)
      return false
    }
  }

  /**
   * 키보드 이벤트 설정
   */
  setupKeyboardEvents() {
    const keyDownHandler = (e) => {
      this.handleKeyDown(e)
    }

    const keyUpHandler = (e) => {
      this.handleKeyUp(e)
    }

    document.addEventListener('keydown', keyDownHandler)
    document.addEventListener('keyup', keyUpHandler)

    this.eventHandlers.keydown = keyDownHandler
    this.eventHandlers.keyup = keyUpHandler
  }

  /**
   * 마우스 이벤트 설정
   */
  setupMouseEvents() {
    const clickHandler = (e) => {
      this.handleClick(e)
    }

    const moveHandler = (e) => {
      this.handleMouseMove(e)
    }

    this.targetElement.addEventListener('click', clickHandler)
    this.targetElement.addEventListener('mousemove', moveHandler)

    this.eventHandlers.click = clickHandler
    this.eventHandlers.mousemove = moveHandler
  }

  /**
   * 터치 이벤트 설정
   */
  setupTouchEvents() {
    const touchStartHandler = (e) => {
      this.handleTouchStart(e)
    }

    const touchEndHandler = (e) => {
      this.handleTouchEnd(e)
    }

    this.targetElement.addEventListener('touchstart', touchStartHandler)
    this.targetElement.addEventListener('touchend', touchEndHandler)

    this.eventHandlers.touchstart = touchStartHandler
    this.eventHandlers.touchend = touchEndHandler
  }

  /**
   * 키보드 입력 처리
   */
  handleKeyDown(e) {
    const action = this.mapKeyToAction(e.key)
    if (action) {
      this.queueInput({
        type: 'keyboard',
        action: action,
        key: e.key,
        timestamp: Date.now(),
      })
      this.notifyListeners(action)
    }
  }

  /**
   * 키 업 처리
   */
  handleKeyUp(e) {
    // 필요 시 구현
  }

  /**
   * 클릭 처리
   */
  handleClick(e) {
    const rect = this.targetElement.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    this.queueInput({
      type: 'click',
      action: 'select',
      x: x,
      y: y,
      timestamp: Date.now(),
    })
    this.notifyListeners('select', { x, y })
  }

  /**
   * 마우스 이동 처리
   */
  handleMouseMove(e) {
    const rect = this.targetElement.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    this.notifyListeners('move', { x, y })
  }

  /**
   * 터치 시작 처리
   */
  handleTouchStart(e) {
    if (e.touches.length > 0) {
      const touch = e.touches[0]
      const rect = this.targetElement.getBoundingClientRect()
      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top

      this.queueInput({
        type: 'touch',
        action: 'tap',
        x: x,
        y: y,
        timestamp: Date.now(),
      })
      this.notifyListeners('tap', { x, y })
    }
  }

  /**
   * 터치 종료 처리
   */
  handleTouchEnd(e) {
    // 필요 시 구현
  }

  /**
   * 키를 액션으로 매핑
   */
  mapKeyToAction(key) {
    const keyMap = {
      'ArrowUp': 'move_up',
      'w': 'move_up',
      'W': 'move_up',
      'ArrowDown': 'move_down',
      's': 'move_down',
      'S': 'move_down',
      'ArrowLeft': 'move_left',
      'a': 'move_left',
      'A': 'move_left',
      'ArrowRight': 'move_right',
      'd': 'move_right',
      'D': 'move_right',
      ' ': 'action',
      'Enter': 'confirm',
      'Escape': 'cancel',
      '1': 'action1',
      '2': 'action2',
      '3': 'action3',
      '4': 'action4',
    }

    return keyMap[key] || null
  }

  /**
   * 입력 큐에 추가
   */
  queueInput(input) {
    this.inputQueue.push(input)
    // 큐 크기 제한
    if (this.inputQueue.length > 100) {
      this.inputQueue.shift()
    }
  }

  /**
   * 입력 큐에서 가져오기
   */
  getQueuedInputs() {
    const inputs = [...this.inputQueue]
    this.inputQueue = []
    return inputs
  }

  /**
   * 이벤트 리스너 등록
   */
  on(action, callback) {
    this.listeners.push({ action, callback })
  }

  /**
   * 이벤트 리스너 제거
   */
  off(action, callback) {
    this.listeners = this.listeners.filter(
      l => l.action !== action || l.callback !== callback
    )
  }

  /**
   * 리스너에게 알림
   */
  notifyListeners(action, data = {}) {
    this.listeners
      .filter(l => l.action === action || l.action === '*')
      .forEach(l => {
        try {
          l.callback({ action, data })
        } catch (error) {
          console.error('[InputManager] 리스너 실행 오류:', error)
        }
      })
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    // 키보드 이벤트 제거
    if (this.eventHandlers.keydown) {
      document.removeEventListener('keydown', this.eventHandlers.keydown)
    }
    if (this.eventHandlers.keyup) {
      document.removeEventListener('keyup', this.eventHandlers.keyup)
    }

    // 마우스 이벤트 제거
    if (this.eventHandlers.click && this.targetElement) {
      this.targetElement.removeEventListener('click', this.eventHandlers.click)
    }
    if (this.eventHandlers.mousemove && this.targetElement) {
      this.targetElement.removeEventListener('mousemove', this.eventHandlers.mousemove)
    }

    // 터치 이벤트 제거
    if (this.eventHandlers.touchstart && this.targetElement) {
      this.targetElement.removeEventListener('touchstart', this.eventHandlers.touchstart)
    }
    if (this.eventHandlers.touchend && this.targetElement) {
      this.targetElement.removeEventListener('touchend', this.eventHandlers.touchend)
    }

    this.eventHandlers = {}
    this.listeners = []
    this.inputQueue = []
    this.isInitialized = false
  }
}
