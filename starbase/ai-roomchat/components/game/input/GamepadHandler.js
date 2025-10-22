/**
 * 🎮 Gamepad Handler
 * 
 * Handles gamepad input with cross-browser compatibility.
 * Supports multiple gamepads and button/axis mapping.
 * 
 * 🔧 Features:
 * - Gamepad API support (Chrome, Firefox, Edge)
 * - Multiple gamepad support
 * - Button and axis input handling
 * - Polling-based input (Gamepad API requirement)
 * - Cross-browser compatibility
 * - Memory leak prevention
 * 
 * @version 1.0.0
 * @compatibility Chrome 21+, Firefox 29+, Edge 12+, Safari 10.1+
 */

import { compatibilityManager } from '../../../utils/compatibilityManager';

/**
 * GamepadHandler class
 * Manages gamepad input with polling mechanism
 */
export class GamepadHandler {
  /**
   * Constructor
   * @param {Object} options - Configuration options
   * @param {number} [options.pollInterval=16] - Polling interval in milliseconds (~60fps)
   * @param {number} [options.deadzone=0.15] - Analog stick deadzone (0-1)
   * @param {Function} [options.onButtonPress] - Button press callback
   * @param {Function} [options.onButtonRelease] - Button release callback
   * @param {Function} [options.onAxisMove] - Axis movement callback
   * @param {Function} [options.onGamepadConnect] - Gamepad connected callback
   * @param {Function} [options.onGamepadDisconnect] - Gamepad disconnected callback
   */
  constructor(options = {}) {
    this.pollInterval = options.pollInterval || 16; // ~60fps
    this.deadzone = options.deadzone || 0.15;
    
    // Callbacks
    this.onButtonPress = options.onButtonPress || null;
    this.onButtonRelease = options.onButtonRelease || null;
    this.onAxisMove = options.onAxisMove || null;
    this.onGamepadConnect = options.onGamepadConnect || null;
    this.onGamepadDisconnect = options.onGamepadDisconnect || null;
    
    // Gamepad state
    this.gamepads = new Map();
    this.previousStates = new Map();
    
    // Polling
    this.pollTimer = null;
    this.isPolling = false;
    
    // Feature support
    this.supportsGamepad = false;
    this.compatibilityInfo = null;
    this.isInitialized = false;
    
    // Standard button mapping (Xbox/PlayStation layout)
    this.buttonMapping = {
      0: 'A',        // Cross (PS)
      1: 'B',        // Circle (PS)
      2: 'X',        // Square (PS)
      3: 'Y',        // Triangle (PS)
      4: 'LB',       // L1
      5: 'RB',       // R1
      6: 'LT',       // L2
      7: 'RT',       // R2
      8: 'SELECT',   // Share
      9: 'START',    // Options
      10: 'LS',      // L3
      11: 'RS',      // R3
      12: 'UP',      // D-pad Up
      13: 'DOWN',    // D-pad Down
      14: 'LEFT',    // D-pad Left
      15: 'RIGHT',   // D-pad Right
      16: 'HOME'     // PS/Xbox button
    };
    
    // Standard axis mapping
    this.axisMapping = {
      0: 'LEFT_STICK_X',
      1: 'LEFT_STICK_Y',
      2: 'RIGHT_STICK_X',
      3: 'RIGHT_STICK_Y'
    };
    
    // Bind methods
    this.handleGamepadConnected = this.handleGamepadConnected.bind(this);
    this.handleGamepadDisconnected = this.handleGamepadDisconnected.bind(this);
    this.poll = this.poll.bind(this);
  }
  
  /**
   * Initialize gamepad handler
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('[GamepadHandler] Already initialized');
      return;
    }
    
    try {
      // Get compatibility info
      this.compatibilityInfo = compatibilityManager.getCompatibilityInfo();
      
      // Check Gamepad API support
      this.supportsGamepad = typeof navigator !== 'undefined' && 
                             ('getGamepads' in navigator || 
                              'webkitGetGamepads' in navigator);
      
      if (!this.supportsGamepad) {
        console.warn('[GamepadHandler] Gamepad API not supported');
        return;
      }
      
      // Add connection event listeners
      if (typeof window !== 'undefined') {
        window.addEventListener('gamepadconnected', this.handleGamepadConnected);
        window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
      }
      
      // Check for already connected gamepads (Firefox compatibility)
      this.scanForGamepads();
      
      // Start polling
      this.startPolling();
      
      this.isInitialized = true;
      console.log('[GamepadHandler] Initialized');
      
    } catch (error) {
      console.error('[GamepadHandler] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Scan for already-connected gamepads (Firefox workaround)
   * @private
   */
  scanForGamepads() {
    if (!this.supportsGamepad || typeof navigator === 'undefined') return;
    
    const gamepads = this.getGamepads();
    
    gamepads.forEach((gamepad, index) => {
      if (gamepad && !this.gamepads.has(gamepad.index)) {
        this.addGamepad(gamepad);
      }
    });
  }
  
  /**
   * Get gamepads with cross-browser compatibility
   * @returns {Array} Array of gamepads
   * @private
   */
  getGamepads() {
    if (typeof navigator === 'undefined') return [];
    
    // Standard API
    if (navigator.getGamepads) {
      return Array.from(navigator.getGamepads()).filter(gp => gp !== null);
    }
    
    // Webkit prefix fallback
    if (navigator.webkitGetGamepads) {
      return Array.from(navigator.webkitGetGamepads()).filter(gp => gp !== null);
    }
    
    return [];
  }
  
  /**
   * Handle gamepad connected event
   * @param {GamepadEvent} event - Gamepad event
   * @private
   */
  handleGamepadConnected(event) {
    const gamepad = event.gamepad;
    console.log('[GamepadHandler] Gamepad connected:', gamepad.id);
    
    this.addGamepad(gamepad);
    
    if (this.onGamepadConnect) {
      this.onGamepadConnect({
        index: gamepad.index,
        id: gamepad.id,
        mapping: gamepad.mapping,
        buttons: gamepad.buttons.length,
        axes: gamepad.axes.length
      });
    }
  }
  
  /**
   * Handle gamepad disconnected event
   * @param {GamepadEvent} event - Gamepad event
   * @private
   */
  handleGamepadDisconnected(event) {
    const gamepad = event.gamepad;
    console.log('[GamepadHandler] Gamepad disconnected:', gamepad.id);
    
    this.removeGamepad(gamepad.index);
    
    if (this.onGamepadDisconnect) {
      this.onGamepadDisconnect({
        index: gamepad.index,
        id: gamepad.id
      });
    }
  }
  
  /**
   * Add gamepad to tracking
   * @param {Gamepad} gamepad - Gamepad object
   * @private
   */
  addGamepad(gamepad) {
    this.gamepads.set(gamepad.index, gamepad);
    
    // Initialize previous state
    this.previousStates.set(gamepad.index, {
      buttons: gamepad.buttons.map(btn => btn.pressed),
      axes: [...gamepad.axes]
    });
  }
  
  /**
   * Remove gamepad from tracking
   * @param {number} index - Gamepad index
   * @private
   */
  removeGamepad(index) {
    this.gamepads.delete(index);
    this.previousStates.delete(index);
  }
  
  /**
   * Start polling for gamepad input
   * @private
   */
  startPolling() {
    if (this.isPolling) return;
    
    this.isPolling = true;
    this.poll();
  }
  
  /**
   * Stop polling
   * @private
   */
  stopPolling() {
    if (!this.isPolling) return;
    
    this.isPolling = false;
    
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
  
  /**
   * Poll gamepad state
   * @private
   */
  poll() {
    if (!this.isPolling) return;
    
    // Get current gamepad states
    const gamepads = this.getGamepads();
    
    gamepads.forEach(gamepad => {
      if (!gamepad) return;
      
      // Update gamepad reference
      this.gamepads.set(gamepad.index, gamepad);
      
      // Get previous state
      const prevState = this.previousStates.get(gamepad.index);
      
      if (!prevState) {
        // New gamepad, initialize state
        this.addGamepad(gamepad);
        return;
      }
      
      // Check button changes
      this.checkButtonChanges(gamepad, prevState);
      
      // Check axis changes
      this.checkAxisChanges(gamepad, prevState);
      
      // Update previous state
      prevState.buttons = gamepad.buttons.map(btn => btn.pressed);
      prevState.axes = [...gamepad.axes];
    });
    
    // Schedule next poll
    this.pollTimer = setTimeout(this.poll, this.pollInterval);
  }
  
  /**
   * Check for button state changes
   * @param {Gamepad} gamepad - Current gamepad state
   * @param {Object} prevState - Previous gamepad state
   * @private
   */
  checkButtonChanges(gamepad, prevState) {
    gamepad.buttons.forEach((button, index) => {
      const isPressed = button.pressed;
      const wasPressed = prevState.buttons[index];
      
      // Button press event
      if (isPressed && !wasPressed) {
        this.handleButtonPress(gamepad.index, index, button.value);
      }
      
      // Button release event
      if (!isPressed && wasPressed) {
        this.handleButtonRelease(gamepad.index, index);
      }
    });
  }
  
  /**
   * Check for axis value changes
   * @param {Gamepad} gamepad - Current gamepad state
   * @param {Object} prevState - Previous gamepad state
   * @private
   */
  checkAxisChanges(gamepad, prevState) {
    gamepad.axes.forEach((value, index) => {
      const prevValue = prevState.axes[index];
      
      // Apply deadzone
      const normalizedValue = this.applyDeadzone(value);
      const normalizedPrevValue = this.applyDeadzone(prevValue);
      
      // Check for significant change
      if (Math.abs(normalizedValue - normalizedPrevValue) > 0.01) {
        this.handleAxisMove(gamepad.index, index, normalizedValue);
      }
    });
  }
  
  /**
   * Apply deadzone to axis value
   * @param {number} value - Raw axis value
   * @returns {number} Adjusted value
   * @private
   */
  applyDeadzone(value) {
    if (Math.abs(value) < this.deadzone) {
      return 0;
    }
    
    // Scale value to account for deadzone
    const sign = value > 0 ? 1 : -1;
    const adjustedValue = (Math.abs(value) - this.deadzone) / (1 - this.deadzone);
    
    return sign * adjustedValue;
  }
  
  /**
   * Handle button press
   * @param {number} gamepadIndex - Gamepad index
   * @param {number} buttonIndex - Button index
   * @param {number} value - Button pressure value
   * @private
   */
  handleButtonPress(gamepadIndex, buttonIndex, value) {
    const buttonName = this.buttonMapping[buttonIndex] || `BUTTON_${buttonIndex}`;
    
    if (this.onButtonPress) {
      this.onButtonPress({
        gamepadIndex: gamepadIndex,
        buttonIndex: buttonIndex,
        buttonName: buttonName,
        value: value
      });
    }
    
    this.dispatchGamepadEvent('buttonPress', {
      gamepadIndex,
      buttonIndex,
      buttonName,
      value
    });
  }
  
  /**
   * Handle button release
   * @param {number} gamepadIndex - Gamepad index
   * @param {number} buttonIndex - Button index
   * @private
   */
  handleButtonRelease(gamepadIndex, buttonIndex) {
    const buttonName = this.buttonMapping[buttonIndex] || `BUTTON_${buttonIndex}`;
    
    if (this.onButtonRelease) {
      this.onButtonRelease({
        gamepadIndex: gamepadIndex,
        buttonIndex: buttonIndex,
        buttonName: buttonName
      });
    }
    
    this.dispatchGamepadEvent('buttonRelease', {
      gamepadIndex,
      buttonIndex,
      buttonName
    });
  }
  
  /**
   * Handle axis movement
   * @param {number} gamepadIndex - Gamepad index
   * @param {number} axisIndex - Axis index
   * @param {number} value - Axis value
   * @private
   */
  handleAxisMove(gamepadIndex, axisIndex, value) {
    const axisName = this.axisMapping[axisIndex] || `AXIS_${axisIndex}`;
    
    if (this.onAxisMove) {
      this.onAxisMove({
        gamepadIndex: gamepadIndex,
        axisIndex: axisIndex,
        axisName: axisName,
        value: value
      });
    }
    
    this.dispatchGamepadEvent('axisMove', {
      gamepadIndex,
      axisIndex,
      axisName,
      value
    });
  }
  
  /**
   * Dispatch custom gamepad event
   * @param {string} eventType - Event type
   * @param {Object} detail - Event detail
   * @private
   */
  dispatchGamepadEvent(eventType, detail) {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    
    const event = new CustomEvent('gamepadInput', {
      detail: {
        type: eventType,
        ...detail,
        timestamp: Date.now()
      },
      bubbles: true,
      cancelable: true
    });
    
    window.dispatchEvent(event);
  }
  
  /**
   * Get current state of a specific gamepad
   * @param {number} index - Gamepad index
   * @returns {Object|null} Gamepad state or null
   */
  getGamepadState(index) {
    const gamepad = this.gamepads.get(index);
    
    if (!gamepad) return null;
    
    return {
      index: gamepad.index,
      id: gamepad.id,
      connected: gamepad.connected,
      mapping: gamepad.mapping,
      buttons: gamepad.buttons.map((btn, i) => ({
        index: i,
        name: this.buttonMapping[i] || `BUTTON_${i}`,
        pressed: btn.pressed,
        value: btn.value
      })),
      axes: gamepad.axes.map((value, i) => ({
        index: i,
        name: this.axisMapping[i] || `AXIS_${i}`,
        value: this.applyDeadzone(value)
      }))
    };
  }
  
  /**
   * Get all connected gamepads
   * @returns {Array<Object>} Array of gamepad states
   */
  getAllGamepads() {
    const states = [];
    
    this.gamepads.forEach((gamepad, index) => {
      const state = this.getGamepadState(index);
      if (state) {
        states.push(state);
      }
    });
    
    return states;
  }
  
  /**
   * Check if specific button is currently pressed
   * @param {number} gamepadIndex - Gamepad index
   * @param {number} buttonIndex - Button index
   * @returns {boolean} True if pressed
   */
  isButtonPressed(gamepadIndex, buttonIndex) {
    const gamepad = this.gamepads.get(gamepadIndex);
    
    if (!gamepad || !gamepad.buttons[buttonIndex]) {
      return false;
    }
    
    return gamepad.buttons[buttonIndex].pressed;
  }
  
  /**
   * Get current value of an axis
   * @param {number} gamepadIndex - Gamepad index
   * @param {number} axisIndex - Axis index
   * @returns {number} Axis value with deadzone applied
   */
  getAxisValue(gamepadIndex, axisIndex) {
    const gamepad = this.gamepads.get(gamepadIndex);
    
    if (!gamepad || gamepad.axes[axisIndex] === undefined) {
      return 0;
    }
    
    return this.applyDeadzone(gamepad.axes[axisIndex]);
  }
  
  /**
   * Cleanup and remove all event listeners
   * Prevents memory leaks
   */
  cleanup() {
    if (!this.isInitialized) return;
    
    // Stop polling
    this.stopPolling();
    
    // Remove event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    }
    
    // Clear state
    this.gamepads.clear();
    this.previousStates.clear();
    
    this.isInitialized = false;
    
    console.log('[GamepadHandler] Cleanup complete');
  }
}

export default GamepadHandler;
