/**
 * 🎮 Input Handler Module Tests
 * 
 * Tests for KeyboardHandler, TouchHandler, GamepadHandler, and InputManager
 * Validates cross-browser compatibility, event handling, and memory leak prevention
 */

// Mock browser environment
const mockWindow = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
};

const mockDocument = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
  documentElement: {
    classList: {
      add: jest.fn(),
      remove: jest.fn()
    }
  }
};

const mockNavigator = {
  maxTouchPoints: 0,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
  getGamepads: jest.fn(() => [])
};

// Mock compatibility manager
jest.mock('../../../utils/compatibilityManager', () => ({
  compatibilityManager: {
    getCompatibilityInfo: jest.fn(() => ({
      browser: { name: 'chrome', version: '91' },
      features: {
        touchDevice: false,
        fetch: true,
        abortController: true,
        cssCustomProperties: true
      },
      level: 5,
      device: { mobile: false }
    })),
    initialize: jest.fn()
  }
}));

describe('KeyboardHandler', () => {
  let KeyboardHandler;
  let handler;

  beforeAll(() => {
    global.window = mockWindow;
    global.document = mockDocument;
    global.navigator = mockNavigator;
    
    // Import after mocks are set up
    KeyboardHandler = require('../../../components/game/input/KeyboardHandler').KeyboardHandler;
  });

  beforeEach(() => {
    handler = new KeyboardHandler({
      element: mockDocument,
      debounceDelay: 50,
      throttleDelay: 25
    });
    
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (handler) {
      handler.cleanup();
    }
  });

  test('should initialize correctly', async () => {
    await handler.initialize();
    
    expect(handler.isInitialized).toBe(true);
    expect(mockDocument.addEventListener).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
      false
    );
    expect(mockDocument.addEventListener).toHaveBeenCalledWith(
      'keyup',
      expect.any(Function),
      false
    );
  });

  test('should handle keydown events', async () => {
    const onKeyDown = jest.fn();
    handler = new KeyboardHandler({
      element: mockDocument,
      onKeyDown
    });
    
    await handler.initialize();
    
    const event = new KeyboardEvent('keydown', { key: 'a' });
    handler.handleKeyDown(event);
    
    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(onKeyDown).toHaveBeenCalled();
  });

  test('should prevent duplicate key down events', async () => {
    const onKeyDown = jest.fn();
    handler = new KeyboardHandler({
      element: mockDocument,
      onKeyDown
    });
    
    await handler.initialize();
    
    const event = new KeyboardEvent('keydown', { key: 'a' });
    handler.handleKeyDown(event);
    handler.handleKeyDown(event); // Duplicate
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Should only be called once due to duplicate prevention
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  test('should normalize keyboard events for cross-browser compatibility', async () => {
    await handler.initialize();
    
    const event = {
      key: 'Enter',
      keyCode: 13,
      ctrlKey: true,
      shiftKey: false,
      preventDefault: jest.fn()
    };
    
    const normalized = handler.normalizeKeyboardEvent(event);
    
    expect(normalized.key).toBe('Enter');
    expect(normalized.keyCode).toBe(13);
    expect(normalized.ctrlKey).toBe(true);
    expect(normalized.shiftKey).toBe(false);
    expect(typeof normalized.preventDefault).toBe('function');
  });

  test('should cleanup event listeners', async () => {
    await handler.initialize();
    
    handler.cleanup();
    
    expect(handler.isInitialized).toBe(false);
    expect(mockDocument.removeEventListener).toHaveBeenCalled();
    expect(handler.listeners).toEqual([]);
  });

  test('should track pressed keys', async () => {
    await handler.initialize();
    
    const event = new KeyboardEvent('keydown', { key: 'a' });
    handler.handleKeyDown(event);
    
    expect(handler.isKeyPressed('a')).toBe(true);
    
    const upEvent = new KeyboardEvent('keyup', { key: 'a' });
    handler.handleKeyUp(upEvent);
    
    expect(handler.isKeyPressed('a')).toBe(false);
  });
});

describe('TouchHandler', () => {
  let TouchHandler;
  let handler;

  beforeAll(() => {
    global.window = mockWindow;
    global.document = mockDocument;
    global.navigator = { ...mockNavigator, maxTouchPoints: 5 };
    
    TouchHandler = require('../../../components/game/input/TouchHandler').TouchHandler;
  });

  beforeEach(() => {
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      style: {}
    };
    
    handler = new TouchHandler({
      element: mockElement,
      enableGestures: true,
      tapThreshold: 10,
      swipeThreshold: 100
    });
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (handler) {
      handler.cleanup();
    }
  });

  test('should initialize with touch event support detection', async () => {
    await handler.initialize();
    
    expect(handler.isInitialized).toBe(true);
    expect(handler.supportsTouchEvents).toBeDefined();
  });

  test('should handle tap gesture', async () => {
    const onTap = jest.fn();
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      style: {}
    };
    
    handler = new TouchHandler({
      element: mockElement,
      enableGestures: true,
      onTap
    });
    
    await handler.initialize();
    
    // Simulate tap (touch start and end at same position)
    handler.startTouch(100, 100, 1);
    handler.endTouch();
    
    expect(onTap).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 100,
        y: 100
      })
    );
  });

  test('should detect swipe gestures', async () => {
    const onSwipe = jest.fn();
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      style: {}
    };
    
    handler = new TouchHandler({
      element: mockElement,
      enableGestures: true,
      swipeThreshold: 50,
      onSwipe
    });
    
    await handler.initialize();
    
    // Simulate swipe right
    handler.startTouch(100, 100, 1);
    handler.moveTouch(200, 100);
    handler.endTouch();
    
    expect(onSwipe).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'right',
        distance: expect.any(Number)
      })
    );
  });

  test('should handle long press', async () => {
    jest.useFakeTimers();
    
    const onLongPress = jest.fn();
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      style: {}
    };
    
    handler = new TouchHandler({
      element: mockElement,
      enableGestures: true,
      longPressDuration: 500,
      onLongPress
    });
    
    await handler.initialize();
    
    handler.startTouch(100, 100, 1);
    
    // Fast-forward time
    jest.advanceTimersByTime(500);
    
    expect(onLongPress).toHaveBeenCalled();
    
    jest.useRealTimers();
  });

  test('should cleanup event listeners and timers', async () => {
    await handler.initialize();
    
    // Start a touch to create timer
    handler.startTouch(100, 100, 1);
    
    handler.cleanup();
    
    expect(handler.isInitialized).toBe(false);
    expect(handler.longPressTimer).toBeNull();
    expect(handler.listeners).toEqual([]);
  });

  test('should apply CSS optimizations for touch', async () => {
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      style: {}
    };
    
    handler = new TouchHandler({ element: mockElement });
    await handler.initialize();
    
    expect(mockElement.style.webkitUserSelect).toBe('none');
    expect(mockElement.style.webkitTapHighlightColor).toBe('transparent');
  });
});

describe('GamepadHandler', () => {
  let GamepadHandler;
  let handler;

  beforeAll(() => {
    global.window = mockWindow;
    global.navigator = {
      ...mockNavigator,
      getGamepads: jest.fn(() => [])
    };
    
    GamepadHandler = require('../../../components/game/input/GamepadHandler').GamepadHandler;
  });

  beforeEach(() => {
    handler = new GamepadHandler({
      pollInterval: 16,
      deadzone: 0.15
    });
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (handler) {
      handler.cleanup();
    }
  });

  test('should initialize with gamepad API detection', async () => {
    await handler.initialize();
    
    expect(handler.supportsGamepad).toBeDefined();
  });

  test('should handle gamepad connection', async () => {
    const onGamepadConnect = jest.fn();
    handler = new GamepadHandler({ onGamepadConnect });
    
    await handler.initialize();
    
    const mockGamepad = {
      index: 0,
      id: 'Xbox Controller',
      mapping: 'standard',
      buttons: Array(17).fill({ pressed: false, value: 0 }),
      axes: [0, 0, 0, 0]
    };
    
    const event = { gamepad: mockGamepad };
    handler.handleGamepadConnected(event);
    
    expect(onGamepadConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        id: 'Xbox Controller'
      })
    );
  });

  test('should apply deadzone to axis values', async () => {
    await handler.initialize();
    
    // Value within deadzone should return 0
    expect(handler.applyDeadzone(0.1)).toBe(0);
    
    // Value outside deadzone should be scaled
    expect(handler.applyDeadzone(0.5)).toBeGreaterThan(0);
  });

  test('should cleanup polling and event listeners', async () => {
    await handler.initialize();
    
    handler.cleanup();
    
    expect(handler.isInitialized).toBe(false);
    expect(handler.isPolling).toBe(false);
    expect(mockWindow.removeEventListener).toHaveBeenCalled();
  });

  test('should map button indices to button names', async () => {
    await handler.initialize();
    
    expect(handler.buttonMapping[0]).toBe('A');
    expect(handler.buttonMapping[1]).toBe('B');
    expect(handler.buttonMapping[12]).toBe('UP');
  });
});

describe('InputManager', () => {
  let InputManager;
  let manager;

  beforeAll(() => {
    global.window = mockWindow;
    global.document = mockDocument;
    global.navigator = mockNavigator;
    
    InputManager = require('../../../components/game/input/InputManager').InputManager;
  });

  beforeEach(() => {
    manager = new InputManager({
      element: mockDocument,
      enableKeyboard: true,
      enableTouch: true,
      enableGamepad: false
    });
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
  });

  test('should initialize all enabled handlers', async () => {
    await manager.initialize();
    
    expect(manager.isInitialized).toBe(true);
    expect(manager.keyboardHandler).toBeDefined();
    expect(manager.touchHandler).toBeDefined();
    expect(manager.gamepadHandler).toBeNull(); // Disabled
  });

  test('should route input events to listeners', async () => {
    await manager.initialize();
    
    const listener = jest.fn();
    manager.on('keyboard', listener);
    
    const event = {
      type: 'keyboard',
      key: 'a',
      timestamp: Date.now()
    };
    
    manager.routeInput(event);
    
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboard' })
    );
  });

  test('should support wildcard listeners', async () => {
    await manager.initialize();
    
    const wildcardListener = jest.fn();
    manager.on('*', wildcardListener);
    
    manager.routeInput({ type: 'keyboard', key: 'a', timestamp: Date.now() });
    manager.routeInput({ type: 'touch', x: 100, y: 100, timestamp: Date.now() });
    
    expect(wildcardListener).toHaveBeenCalledTimes(2);
  });

  test('should track input state', async () => {
    await manager.initialize();
    
    const state = manager.getState();
    
    expect(state).toHaveProperty('keyboard');
    expect(state).toHaveProperty('touch');
    expect(state).toHaveProperty('gamepad');
  });

  test('should record and replay input', async () => {
    jest.useFakeTimers();
    
    await manager.initialize();
    
    const listener = jest.fn();
    manager.on('*', listener);
    
    manager.startRecording();
    
    // Simulate some inputs
    manager.routeInput({ type: 'keyboard', key: 'a', timestamp: Date.now() });
    jest.advanceTimersByTime(100);
    manager.routeInput({ type: 'keyboard', key: 'b', timestamp: Date.now() });
    
    const recording = manager.stopRecording();
    
    expect(recording.length).toBe(2);
    
    listener.mockClear();
    
    // Replay
    await manager.replay(recording, 2.0); // 2x speed
    
    expect(listener).toHaveBeenCalledTimes(2);
    
    jest.useRealTimers();
  });

  test('should cleanup all handlers', async () => {
    await manager.initialize();
    
    manager.cleanup();
    
    expect(manager.isInitialized).toBe(false);
    expect(manager.keyboardHandler).toBeNull();
    expect(manager.touchHandler).toBeNull();
  });

  test('should enable/disable input types dynamically', async () => {
    await manager.initialize();
    
    // Disable keyboard
    manager.setInputEnabled('keyboard', false);
    expect(manager.enableKeyboard).toBe(false);
    
    // Re-enable keyboard
    manager.setInputEnabled('keyboard', true);
    expect(manager.enableKeyboard).toBe(true);
  });

  test('should remove event listeners correctly', async () => {
    await manager.initialize();
    
    const listener = jest.fn();
    manager.on('keyboard', listener);
    
    manager.routeInput({ type: 'keyboard', key: 'a', timestamp: Date.now() });
    expect(listener).toHaveBeenCalledTimes(1);
    
    manager.off('keyboard', listener);
    
    manager.routeInput({ type: 'keyboard', key: 'b', timestamp: Date.now() });
    expect(listener).toHaveBeenCalledTimes(1); // Should not increase
  });
});

describe('Memory Leak Prevention', () => {
  test('KeyboardHandler should not leak event listeners', async () => {
    const KeyboardHandler = require('../../../components/game/input/KeyboardHandler').KeyboardHandler;
    
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    
    const handler = new KeyboardHandler({ element: mockElement });
    await handler.initialize();
    
    const addCount = mockElement.addEventListener.mock.calls.length;
    
    handler.cleanup();
    
    expect(mockElement.removeEventListener).toHaveBeenCalledTimes(addCount);
  });

  test('TouchHandler should cleanup timers', async () => {
    const TouchHandler = require('../../../components/game/input/TouchHandler').TouchHandler;
    
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      style: {}
    };
    
    const handler = new TouchHandler({ element: mockElement });
    await handler.initialize();
    
    handler.startTouch(100, 100, 1);
    expect(handler.longPressTimer).not.toBeNull();
    
    handler.cleanup();
    expect(handler.longPressTimer).toBeNull();
  });

  test('GamepadHandler should stop polling on cleanup', async () => {
    const GamepadHandler = require('../../../components/game/input/GamepadHandler').GamepadHandler;
    
    const handler = new GamepadHandler();
    await handler.initialize();
    
    expect(handler.isPolling).toBe(true);
    
    handler.cleanup();
    
    expect(handler.isPolling).toBe(false);
    expect(handler.pollTimer).toBeNull();
  });
});

console.log('✅ Input Handler tests completed');
