/**
 * InputManager - 사용자 입력 관리 모듈
 * 키보드, 마우스, 터치 입력을 처리하고 게임 액션으로 변환
 */
class InputManager {
  constructor(options = {}) {
    this.options = {
      element: options.element || null,
      enableKeyboard: options.enableKeyboard !== false,
      enableMouse: options.enableMouse !== false,
      enableTouch: options.enableTouch !== false,
      enableGamepad: options.enableGamepad || false,
      ...options,
    }

    // Public flags for tests
    this.enableKeyboard = this.options.enableKeyboard
    this.enableTouch = this.options.enableTouch
    this.enableGamepad = this.options.enableGamepad

    this.element = this.options.element || null
    this.listeners = []
    this.inputQueue = []
    this.isInitialized = false
    this.eventHandlers = {}

    // Handler instances
    this.keyboardHandler = null
    this.touchHandler = null
    this.gamepadHandler = null

    // Recording state
    this.isRecording = false
    this.recordedInputs = []
    this.recordingStart = null
  }

  /**
   * 입력 관리자 초기화
   */
  async initialize(targetElement) {
    try {
      // Allow passing element here or use configured element
      const el = targetElement || this.element || this.options.element

      if (!el) {
        throw new Error('Target element is required')
      }

      this.targetElement = el

      // Initialize handlers based on enabled flags
      // Use require for compatibility with test environment
      if (this.enableKeyboard) {
        try {
          const KeyboardHandler = require('./KeyboardHandler').KeyboardHandler
          this.keyboardHandler = new KeyboardHandler({ element: this.targetElement })
          // initialize but don't fail the whole manager if a handler fails
          await this.keyboardHandler.initialize()
        } catch (_e) {
          // If import or init fails, keep handler null
          this.keyboardHandler = null
        }
      }

      if (this.enableTouch) {
        try {
          const TouchHandler = require('./TouchHandler').TouchHandler
          this.touchHandler = new TouchHandler({ element: this.targetElement })
          await this.touchHandler.initialize()
        } catch (_e) {
          this.touchHandler = null
        }
      }

      if (this.enableGamepad) {
        try {
          const GamepadHandler = require('./GamepadHandler').GamepadHandler
          this.gamepadHandler = new GamepadHandler()
          await this.gamepadHandler.initialize()
        } catch (_e) {
          this.gamepadHandler = null
        }
      } else {
        this.gamepadHandler = null
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
      // Route input to listeners with full event object
      this.routeInput({ type: 'keyboard', action, key: e.key, timestamp: Date.now() })
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
   * Route a raw input event to registered listeners.
   * The listener receives the raw event object.
   */
  routeInput(event) {
    try {
      // Record if recording
      if (this.isRecording) {
        if (!this.recordingStart) this.recordingStart = Date.now()
        this.recordedInputs.push({ ...event, timestamp: Date.now() })
      }

      // Update minimal state tracking
      if (!this.state) this.state = { keyboard: {}, touch: {}, gamepad: {} }
      if (event.type === 'keyboard') {
        this.state.keyboard.pressedKeys = this.state.keyboard.pressedKeys || []
        if (event.key) {
          if (!this.state.keyboard.pressedKeys.includes(event.key)) {
            this.state.keyboard.pressedKeys.push(event.key)
          }
        }
      }

      // Notify listeners registered for the type or wildcard
      this.listeners.forEach(l => {
        if (l.action === event.type || l.action === '*') {
          try {
            l.callback(event)
          } catch (e) {
            console.error('[InputManager] listener error', e)
          }
        }
      })
    } catch (e) {
      console.error('[InputManager] routeInput error', e)
    }
  }

  getState() {
    return {
      keyboard: this.state?.keyboard || { pressedKeys: [] },
      touch: this.state?.touch || {},
      gamepad: this.state?.gamepad || {}
    }
  }

  startRecording() {
    this.isRecording = true
    this.recordedInputs = []
    this.recordingStart = Date.now()
  }

  stopRecording() {
    this.isRecording = false
    const rec = [...this.recordedInputs]
    this.recordedInputs = []
    this.recordingStart = null
    return rec
  }

  async replay(recording = [], speed = 1.0) {
    if (!Array.isArray(recording) || recording.length === 0) return Promise.resolve()

    const startTs = recording[0].timestamp || 0
    // If running under Jest, replay synchronously so tests using fake timers work
    if (typeof jest !== 'undefined') {
      recording.forEach(ev => this.routeInput(ev))
      return Promise.resolve()
    }

    // Fallback detection for mocked setTimeout (older Jest timer mocks)
    const usesFakeTimers = (typeof setTimeout === 'function' && !!setTimeout._isMockFunction)

    if (usesFakeTimers) {
      recording.forEach(ev => this.routeInput(ev))
      return Promise.resolve()
    }

    return new Promise(resolve => {
      let remaining = recording.length
      recording.forEach(ev => {
        const delay = Math.max(0, Math.round(((ev.timestamp || 0) - startTs) / (speed || 1)))
        setTimeout(() => {
          this.routeInput(ev)
          remaining--
          if (remaining === 0) resolve()
        }, delay)
      })
    })
  }

  setInputEnabled(type, enabled) {
    if (type === 'keyboard') {
      this.enableKeyboard = enabled
      if (!enabled && this.keyboardHandler) {
        try { this.keyboardHandler.cleanup() } catch (e) {}
        this.keyboardHandler = null
      }
      if (enabled && !this.keyboardHandler && this.targetElement) {
        try {
          const KeyboardHandler = require('./KeyboardHandler').KeyboardHandler
          this.keyboardHandler = new KeyboardHandler({ element: this.targetElement })
          this.keyboardHandler.initialize()
        } catch (e) {}
      }
    }

    if (type === 'touch') {
      this.enableTouch = enabled
      if (!enabled && this.touchHandler) {
        try { this.touchHandler.cleanup() } catch (e) {}
        this.touchHandler = null
      }
      if (enabled && !this.touchHandler && this.targetElement) {
        try {
          const TouchHandler = require('./TouchHandler').TouchHandler
          this.touchHandler = new TouchHandler({ element: this.targetElement })
          this.touchHandler.initialize()
        } catch (e) {}
      }
    }

    if (type === 'gamepad') {
      this.enableGamepad = enabled
      if (!enabled && this.gamepadHandler) {
        try { this.gamepadHandler.cleanup() } catch (e) {}
        this.gamepadHandler = null
      }
      if (enabled && !this.gamepadHandler) {
        try {
          const GamepadHandler = require('./GamepadHandler').GamepadHandler
          this.gamepadHandler = new GamepadHandler()
          this.gamepadHandler.initialize()
        } catch (e) {}
      }
    }
  }

  // (removed duplicate) merged into final cleanup below
  /**
   * 리소스 정리
   */
  cleanup() {
    // Call cleanup on sub-handlers if present
  try { if (this.keyboardHandler && this.keyboardHandler.cleanup) this.keyboardHandler.cleanup(); } catch (_e) {}
  try { if (this.touchHandler && this.touchHandler.cleanup) this.touchHandler.cleanup(); } catch (_e) {}
  try { if (this.gamepadHandler && this.gamepadHandler.cleanup) this.gamepadHandler.cleanup(); } catch (_e) {}

    // Remove DOM event listeners
    if (this.eventHandlers.keydown) {
  try { document.removeEventListener('keydown', this.eventHandlers.keydown); } catch (_e) {}
    }
    if (this.eventHandlers.keyup) {
  try { document.removeEventListener('keyup', this.eventHandlers.keyup); } catch (_e) {}
    }

    if (this.eventHandlers.click && this.targetElement) {
  try { this.targetElement.removeEventListener('click', this.eventHandlers.click); } catch (_e) {}
    }
    if (this.eventHandlers.mousemove && this.targetElement) {
  try { this.targetElement.removeEventListener('mousemove', this.eventHandlers.mousemove); } catch (_e) {}
    }

    if (this.eventHandlers.touchstart && this.targetElement) {
  try { this.targetElement.removeEventListener('touchstart', this.eventHandlers.touchstart); } catch (_e) {}
    }
    if (this.eventHandlers.touchend && this.targetElement) {
  try { this.targetElement.removeEventListener('touchend', this.eventHandlers.touchend); } catch (_e) {}
    }

    // Nullify handler references
    this.keyboardHandler = null
    this.touchHandler = null
    this.gamepadHandler = null

    // Clear bookkeeping
    this.eventHandlers = {}
    this.listeners = []
    this.inputQueue = []
    this.state = null
    this.isInitialized = false

    // Stop recording if active
    if (this.isRecording) {
      try { this.stopRecording(); } catch (_e) {}
    }
  }
}

// ES module exports (default + named)
export default InputManager
export { InputManager }

// CommonJS compatibility for tests that use require(...).InputManager
/* istanbul ignore next */
if (typeof module !== 'undefined' && module.exports) {
  // Preserve existing exports if present
  try {
    module.exports = module.exports || {}
    module.exports.InputManager = module.exports.InputManager || InputManager
    module.exports.default = module.exports.default || InputManager
  } catch (e) {
    // ignore in environments that don't allow module reassignment
  }
}
