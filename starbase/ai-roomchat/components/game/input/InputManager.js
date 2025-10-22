/**
 * 🎯 Input Manager
 * 
 * Unified input management system that coordinates keyboard, touch, and gamepad input.
 * Provides a single interface for all input handling with event routing and compatibility.
 * 
 * 🔧 Features:
 * - Unified interface for all input types
 * - Event routing and prioritization
 * - Cross-browser compatibility
 * - Integration with MobileOptimizationManager
 * - Memory leak prevention
 * - Input recording and replay support
 * 
 * @version 1.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

import { KeyboardHandler } from './KeyboardHandler';
import { TouchHandler } from './TouchHandler';
import { GamepadHandler } from './GamepadHandler';
import { compatibilityManager } from '../../../utils/compatibilityManager';

/**
 * InputManager class
 * Manages all input handlers and provides unified event routing
 */
export class InputManager {
  /**
   * Constructor
   * @param {Object} options - Configuration options
   * @param {HTMLElement} [options.element] - Target element for input events
   * @param {boolean} [options.enableKeyboard=true] - Enable keyboard input
   * @param {boolean} [options.enableTouch=true] - Enable touch/pointer input
   * @param {boolean} [options.enableGamepad=false] - Enable gamepad input
   * @param {boolean} [options.enableRecording=false] - Enable input recording
   * @param {Object} [options.keyboardOptions] - Options for KeyboardHandler
   * @param {Object} [options.touchOptions] - Options for TouchHandler
   * @param {Object} [options.gamepadOptions] - Options for GamepadHandler
   * @param {Function} [options.onInput] - Global input callback
   */
  constructor(options = {}) {
    this.element = options.element || null;
    this.enableKeyboard = options.enableKeyboard !== false;
    this.enableTouch = options.enableTouch !== false;
    this.enableGamepad = options.enableGamepad || false;
    this.enableRecording = options.enableRecording || false;
    
    // Global input callback
    this.onInput = options.onInput || null;
    
    // Handlers
    this.keyboardHandler = null;
    this.touchHandler = null;
    this.gamepadHandler = null;
    
    // Handler options
    this.keyboardOptions = options.keyboardOptions || {};
    this.touchOptions = options.touchOptions || {};
    this.gamepadOptions = options.gamepadOptions || {};
    
    // Input event listeners
    this.inputListeners = new Map();
    
    // Input recording
    this.recording = [];
    this.isRecording = false;
    this.recordingStartTime = 0;
    
    // Input state
    this.inputState = {
      keyboard: new Set(),
      touch: { active: false, x: 0, y: 0 },
      gamepad: new Map()
    };
    
    // Compatibility info
    this.compatibilityInfo = null;
    this.isInitialized = false;
    
    // Bind methods
    this.handleKeyboardInput = this.handleKeyboardInput.bind(this);
    this.handleTouchInput = this.handleTouchInput.bind(this);
    this.handleGamepadInput = this.handleGamepadInput.bind(this);
  }
  
  /**
   * Initialize input manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('[InputManager] Already initialized');
      return;
    }
    
    try {
      // Get compatibility info
      this.compatibilityInfo = compatibilityManager.getCompatibilityInfo();
      
      console.log('[InputManager] Initializing with options:', {
        keyboard: this.enableKeyboard,
        touch: this.enableTouch,
        gamepad: this.enableGamepad
      });
      
      // Initialize keyboard handler
      if (this.enableKeyboard) {
        await this.initializeKeyboard();
      }
      
      // Initialize touch handler
      if (this.enableTouch) {
        await this.initializeTouch();
      }
      
      // Initialize gamepad handler
      if (this.enableGamepad) {
        await this.initializeGamepad();
      }
      
      this.isInitialized = true;
      console.log('[InputManager] Initialized successfully');
      
    } catch (error) {
      console.error('[InputManager] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Initialize keyboard handler
   * @private
   */
  async initializeKeyboard() {
    this.keyboardHandler = new KeyboardHandler({
      element: this.element,
      onKeyDown: this.handleKeyboardInput,
      onKeyUp: this.handleKeyboardInput,
      ...this.keyboardOptions
    });
    
    await this.keyboardHandler.initialize();
  }
  
  /**
   * Initialize touch handler
   * @private
   */
  async initializeTouch() {
    this.touchHandler = new TouchHandler({
      element: this.element,
      onTouchStart: this.handleTouchInput,
      onTouchMove: this.handleTouchInput,
      onTouchEnd: this.handleTouchInput,
      onTap: this.handleTouchInput,
      onSwipe: this.handleTouchInput,
      onPinch: this.handleTouchInput,
      onLongPress: this.handleTouchInput,
      ...this.touchOptions
    });
    
    await this.touchHandler.initialize();
  }
  
  /**
   * Initialize gamepad handler
   * @private
   */
  async initializeGamepad() {
    this.gamepadHandler = new GamepadHandler({
      onButtonPress: this.handleGamepadInput,
      onButtonRelease: this.handleGamepadInput,
      onAxisMove: this.handleGamepadInput,
      ...this.gamepadOptions
    });
    
    await this.gamepadHandler.initialize();
  }
  
  /**
   * Handle keyboard input
   * @param {Object} event - Normalized keyboard event
   * @private
   */
  handleKeyboardInput(event) {
    const inputEvent = {
      type: 'keyboard',
      source: 'keyboard',
      key: event.key,
      code: event.code,
      modifiers: {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey
      },
      timestamp: Date.now(),
      originalEvent: event
    };
    
    // Update state
    if (event.originalEvent.type === 'keydown') {
      this.inputState.keyboard.add(event.key);
    } else if (event.originalEvent.type === 'keyup') {
      this.inputState.keyboard.delete(event.key);
    }
    
    // Record if enabled
    if (this.isRecording) {
      this.recordInput(inputEvent);
    }
    
    // Route event
    this.routeInput(inputEvent);
  }
  
  /**
   * Handle touch input
   * @param {Object} event - Normalized touch event or gesture data
   * @private
   */
  handleTouchInput(event) {
    const inputEvent = {
      type: 'touch',
      source: event.type || 'touch',
      x: event.x || 0,
      y: event.y || 0,
      gesture: event.direction || event.type || null,
      timestamp: Date.now(),
      originalEvent: event
    };
    
    // Update state
    this.inputState.touch = {
      active: event.type !== 'touchend',
      x: event.x || 0,
      y: event.y || 0
    };
    
    // Record if enabled
    if (this.isRecording) {
      this.recordInput(inputEvent);
    }
    
    // Route event
    this.routeInput(inputEvent);
  }
  
  /**
   * Handle gamepad input
   * @param {Object} event - Gamepad event data
   * @private
   */
  handleGamepadInput(event) {
    const inputEvent = {
      type: 'gamepad',
      source: 'gamepad',
      gamepadIndex: event.gamepadIndex,
      button: event.buttonName,
      axis: event.axisName,
      value: event.value,
      timestamp: Date.now(),
      originalEvent: event
    };
    
    // Update state
    if (event.buttonName) {
      if (!this.inputState.gamepad.has(event.gamepadIndex)) {
        this.inputState.gamepad.set(event.gamepadIndex, new Set());
      }
      
      const buttons = this.inputState.gamepad.get(event.gamepadIndex);
      if (event.value > 0) {
        buttons.add(event.buttonName);
      } else {
        buttons.delete(event.buttonName);
      }
    }
    
    // Record if enabled
    if (this.isRecording) {
      this.recordInput(inputEvent);
    }
    
    // Route event
    this.routeInput(inputEvent);
  }
  
  /**
   * Route input event to appropriate listeners
   * @param {Object} inputEvent - Normalized input event
   * @private
   */
  routeInput(inputEvent) {
    // Call global callback
    if (this.onInput) {
      this.onInput(inputEvent);
    }
    
    // Call type-specific listeners
    const typeListeners = this.inputListeners.get(inputEvent.type);
    if (typeListeners) {
      typeListeners.forEach(listener => {
        try {
          listener(inputEvent);
        } catch (error) {
          console.error('[InputManager] Listener error:', error);
        }
      });
    }
    
    // Call wildcard listeners
    const wildcardListeners = this.inputListeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(listener => {
        try {
          listener(inputEvent);
        } catch (error) {
          console.error('[InputManager] Wildcard listener error:', error);
        }
      });
    }
  }
  
  /**
   * Add input event listener
   * @param {string} type - Input type ('keyboard', 'touch', 'gamepad', or '*' for all)
   * @param {Function} callback - Event callback
   */
  on(type, callback) {
    if (!this.inputListeners.has(type)) {
      this.inputListeners.set(type, new Set());
    }
    
    this.inputListeners.get(type).add(callback);
  }
  
  /**
   * Remove input event listener
   * @param {string} type - Input type
   * @param {Function} callback - Event callback
   */
  off(type, callback) {
    const listeners = this.inputListeners.get(type);
    if (listeners) {
      listeners.delete(callback);
    }
  }
  
  /**
   * Start recording input
   */
  startRecording() {
    if (this.isRecording) {
      console.warn('[InputManager] Already recording');
      return;
    }
    
    this.recording = [];
    this.recordingStartTime = Date.now();
    this.isRecording = true;
    
    console.log('[InputManager] Recording started');
  }
  
  /**
   * Stop recording input
   * @returns {Array} Recorded input events
   */
  stopRecording() {
    if (!this.isRecording) {
      console.warn('[InputManager] Not recording');
      return [];
    }
    
    this.isRecording = false;
    const recorded = [...this.recording];
    
    console.log('[InputManager] Recording stopped:', recorded.length, 'events');
    
    return recorded;
  }
  
  /**
   * Record input event
   * @param {Object} inputEvent - Input event to record
   * @private
   */
  recordInput(inputEvent) {
    const recordEntry = {
      ...inputEvent,
      relativeTime: Date.now() - this.recordingStartTime
    };
    
    this.recording.push(recordEntry);
  }
  
  /**
   * Replay recorded input
   * @param {Array} recording - Recorded input events
   * @param {number} speed - Playback speed multiplier (default: 1.0)
   * @returns {Promise<void>}
   */
  async replay(recording, speed = 1.0) {
    if (!recording || recording.length === 0) {
      console.warn('[InputManager] No recording to replay');
      return;
    }
    
    console.log('[InputManager] Replaying', recording.length, 'events');
    
    for (let i = 0; i < recording.length; i++) {
      const event = recording[i];
      const nextEvent = recording[i + 1];
      
      // Route the event
      this.routeInput(event);
      
      // Wait for next event delay
      if (nextEvent) {
        const delay = (nextEvent.relativeTime - event.relativeTime) / speed;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log('[InputManager] Replay complete');
  }
  
  /**
   * Get current input state
   * @returns {Object} Current state of all inputs
   */
  getState() {
    return {
      keyboard: {
        pressed: Array.from(this.inputState.keyboard)
      },
      touch: {
        ...this.inputState.touch
      },
      gamepad: {
        connected: this.gamepadHandler ? 
                   this.gamepadHandler.getAllGamepads().map(gp => gp.index) : 
                   []
      }
    };
  }
  
  /**
   * Check if specific key is pressed
   * @param {string} key - Key to check
   * @returns {boolean} True if pressed
   */
  isKeyPressed(key) {
    return this.inputState.keyboard.has(key);
  }
  
  /**
   * Check if touch is active
   * @returns {boolean} True if touch active
   */
  isTouchActive() {
    return this.inputState.touch.active;
  }
  
  /**
   * Get touch position
   * @returns {Object} Touch position {x, y}
   */
  getTouchPosition() {
    return {
      x: this.inputState.touch.x,
      y: this.inputState.touch.y
    };
  }
  
  /**
   * Check if gamepad button is pressed
   * @param {number} gamepadIndex - Gamepad index
   * @param {string} button - Button name
   * @returns {boolean} True if pressed
   */
  isGamepadButtonPressed(gamepadIndex, button) {
    const buttons = this.inputState.gamepad.get(gamepadIndex);
    return buttons ? buttons.has(button) : false;
  }
  
  /**
   * Set element for input handlers
   * @param {HTMLElement} element - New target element
   */
  setElement(element) {
    this.element = element;
    
    // Update handlers if initialized
    if (this.isInitialized) {
      if (this.keyboardHandler) {
        this.keyboardHandler.cleanup();
        this.keyboardHandler = null;
        if (this.enableKeyboard) {
          this.initializeKeyboard().catch(console.error);
        }
      }
      
      if (this.touchHandler) {
        this.touchHandler.cleanup();
        this.touchHandler = null;
        if (this.enableTouch) {
          this.initializeTouch().catch(console.error);
        }
      }
    }
  }
  
  /**
   * Enable or disable specific input type
   * @param {string} type - Input type ('keyboard', 'touch', 'gamepad')
   * @param {boolean} enabled - Enable or disable
   */
  setInputEnabled(type, enabled) {
    switch (type) {
      case 'keyboard':
        this.enableKeyboard = enabled;
        if (enabled && !this.keyboardHandler && this.isInitialized) {
          this.initializeKeyboard().catch(console.error);
        } else if (!enabled && this.keyboardHandler) {
          this.keyboardHandler.cleanup();
          this.keyboardHandler = null;
        }
        break;
        
      case 'touch':
        this.enableTouch = enabled;
        if (enabled && !this.touchHandler && this.isInitialized) {
          this.initializeTouch().catch(console.error);
        } else if (!enabled && this.touchHandler) {
          this.touchHandler.cleanup();
          this.touchHandler = null;
        }
        break;
        
      case 'gamepad':
        this.enableGamepad = enabled;
        if (enabled && !this.gamepadHandler && this.isInitialized) {
          this.initializeGamepad().catch(console.error);
        } else if (!enabled && this.gamepadHandler) {
          this.gamepadHandler.cleanup();
          this.gamepadHandler = null;
        }
        break;
        
      default:
        console.warn('[InputManager] Unknown input type:', type);
    }
  }
  
  /**
   * Cleanup and remove all event listeners
   * Prevents memory leaks
   */
  cleanup() {
    if (!this.isInitialized) return;
    
    console.log('[InputManager] Cleaning up...');
    
    // Stop recording
    if (this.isRecording) {
      this.stopRecording();
    }
    
    // Cleanup handlers
    if (this.keyboardHandler) {
      this.keyboardHandler.cleanup();
      this.keyboardHandler = null;
    }
    
    if (this.touchHandler) {
      this.touchHandler.cleanup();
      this.touchHandler = null;
    }
    
    if (this.gamepadHandler) {
      this.gamepadHandler.cleanup();
      this.gamepadHandler = null;
    }
    
    // Clear listeners
    this.inputListeners.clear();
    
    // Clear state
    this.inputState.keyboard.clear();
    this.inputState.gamepad.clear();
    
    this.isInitialized = false;
    this.element = null;
    
    console.log('[InputManager] Cleanup complete');
  }
}

export default InputManager;
