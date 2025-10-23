/**
 * ⌨️ Keyboard Handler
 *
 * Handles keyboard input events with cross-browser compatibility.
 * Provides debounce/throttle for key input to prevent duplicate events.
 *
 * 🔧 Features:
 * - Cross-browser keyboard event handling
 * - Key press debouncing and throttling
 * - Keyboard shortcut support (Ctrl+Key, etc.)
 * - Accessibility keyboard navigation
 * - Memory leak prevention with cleanup
 *
 * @version 1.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

import { compatibilityManager } from '../../../utils/compatibilityManager';

/**
 * KeyboardHandler class
 * Manages keyboard input events with compatibility and optimization
 */
export class KeyboardHandler {
  /**
   * Constructor
   * @param {Object} options - Configuration options
   * @param {HTMLElement} [options.element=document] - Target element for keyboard events
   * @param {number} [options.debounceDelay=100] - Debounce delay in milliseconds
   * @param {number} [options.throttleDelay=50] - Throttle delay in milliseconds
   * @param {boolean} [options.enableShortcuts=true] - Enable keyboard shortcuts
   * @param {Function} [options.onKeyDown] - Key down callback
   * @param {Function} [options.onKeyUp] - Key up callback
   * @param {Function} [options.onKeyPress] - Key press callback
   */
  constructor(options = {}) {
    this.element = options.element || (typeof document !== 'undefined' ? document : null);
    this.debounceDelay = options.debounceDelay || 100;
    this.throttleDelay = options.throttleDelay || 50;
    this.enableShortcuts = options.enableShortcuts !== false;

    // Callbacks
    this.onKeyDown = options.onKeyDown || null;
    this.onKeyUp = options.onKeyUp || null;
    this.onKeyPress = options.onKeyPress || null;

    // Internal state
    this.keysPressed = new Set();
    this.lastKeyTime = new Map();
    this.debounceTimers = new Map();
    this.throttleTimers = new Map();
    this.listeners = [];

    // Compatibility info
    this.compatibilityInfo = null;
    this.isInitialized = false;

    // Bind methods
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleKeyPress = this.handleKeyPress.bind(this);
  }

  /**
   * Initialize keyboard handler
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('[KeyboardHandler] Already initialized');
      return;
    }

    if (!this.element) {
      console.warn('[KeyboardHandler] No element provided, skipping initialization');
      return;
    }

    try {
      // Get compatibility info
      this.compatibilityInfo = compatibilityManager.getCompatibilityInfo();

      // Add event listeners with cross-browser compatibility
      this.addListener('keydown', this.handleKeyDown);
      this.addListener('keyup', this.handleKeyUp);

      // keypress is deprecated but still needed for IE11
      if (this.compatibilityInfo?.browser?.name === 'ie') {
        this.addListener('keypress', this.handleKeyPress);
      }

      this.isInitialized = true;
      console.log('[KeyboardHandler] Initialized');
    } catch (error) {
      console.error('[KeyboardHandler] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Add event listener with compatibility
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   * @private
   */
  addListener(eventType, handler) {
    // Use addEventListener if available (IE9+)
    if (this.element.addEventListener) {
      this.element.addEventListener(eventType, handler, false);
    } else if (this.element.attachEvent) {
      // IE8 fallback (though our target is IE11+)
      const wrappedHandler = e => handler.call(this.element, e || window.event);
      this.element.attachEvent(`on${eventType}`, wrappedHandler);
      handler._ieWrapper = wrappedHandler;
    }

    // Store for cleanup
    this.listeners.push({ eventType, handler });
  }

  /**
   * Remove event listener
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   * @private
   */
  removeListener(eventType, handler) {
    if (this.element.removeEventListener) {
      this.element.removeEventListener(eventType, handler, false);
    } else if (this.element.detachEvent) {
      // IE8 fallback
      const wrappedHandler = handler._ieWrapper || handler;
      this.element.detachEvent(`on${eventType}`, wrappedHandler);
    }
  }

  /**
   * Handle keydown event
   * @param {KeyboardEvent} event - Keyboard event
   * @private
   */
  handleKeyDown(event) {
    const normalizedEvent = this.normalizeKeyboardEvent(event);
    const key = normalizedEvent.key;

    // Prevent duplicate key down events (key repeat)
    if (this.keysPressed.has(key)) {
      return;
    }

    this.keysPressed.add(key);

    // Apply throttle
    if (this.shouldThrottle(key)) {
      return;
    }

    // Handle keyboard shortcuts
    if (this.enableShortcuts && this.isShortcutKey(normalizedEvent)) {
      this.handleShortcut(normalizedEvent);
      return;
    }

    // Call callback with debounce
    if (this.onKeyDown) {
      this.debounceCallback('keydown', key, () => {
        this.onKeyDown(normalizedEvent);
      });
    }
  }

  /**
   * Handle keyup event
   * @param {KeyboardEvent} event - Keyboard event
   * @private
   */
  handleKeyUp(event) {
    const normalizedEvent = this.normalizeKeyboardEvent(event);
    const key = normalizedEvent.key;

    this.keysPressed.delete(key);
    this.lastKeyTime.delete(key);

    // Clear debounce timer
    if (this.debounceTimers.has(`keyup-${key}`)) {
      clearTimeout(this.debounceTimers.get(`keyup-${key}`));
      this.debounceTimers.delete(`keyup-${key}`);
    }

    // Call callback
    if (this.onKeyUp) {
      this.onKeyUp(normalizedEvent);
    }
  }

  /**
   * Handle keypress event (legacy, for IE11)
   * @param {KeyboardEvent} event - Keyboard event
   * @private
   */
  handleKeyPress(event) {
    const normalizedEvent = this.normalizeKeyboardEvent(event);

    if (this.onKeyPress) {
      this.onKeyPress(normalizedEvent);
    }
  }

  /**
   * Normalize keyboard event for cross-browser compatibility
   * @param {KeyboardEvent} event - Original keyboard event
   * @returns {Object} Normalized event object
   * @private
   */
  normalizeKeyboardEvent(event) {
    // IE11 compatibility: use which or keyCode fallback
    const key =
      event.key || event.keyIdentifier || String.fromCharCode(event.which || event.keyCode);

    const code = event.code || event.keyCode;

    return {
      key: key,
      code: code,
      keyCode: event.keyCode || event.which,
      ctrlKey: event.ctrlKey || false,
      shiftKey: event.shiftKey || false,
      altKey: event.altKey || false,
      metaKey: event.metaKey || false,
      repeat: event.repeat || false,
      originalEvent: event,
      preventDefault: () => {
        if (event.preventDefault) {
          event.preventDefault();
        } else {
          event.returnValue = false; // IE8 fallback
        }
      },
      stopPropagation: () => {
        if (event.stopPropagation) {
          event.stopPropagation();
        } else {
          event.cancelBubble = true; // IE8 fallback
        }
      },
    };
  }

  /**
   * Check if event is a keyboard shortcut
   * @param {Object} event - Normalized event
   * @returns {boolean} True if shortcut key
   * @private
   */
  isShortcutKey(event) {
    return event.ctrlKey || event.metaKey || event.altKey;
  }

  /**
   * Handle keyboard shortcut
   * @param {Object} event - Normalized event
   * @private
   */
  handleShortcut(event) {
    const shortcutKey = this.getShortcutString(event);

    // Dispatch custom shortcut event
    if (typeof CustomEvent !== 'undefined') {
      const shortcutEvent = new CustomEvent('keyboardShortcut', {
        detail: {
          key: event.key,
          shortcut: shortcutKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
        },
        bubbles: true,
        cancelable: true,
      });

      this.element.dispatchEvent(shortcutEvent);
    }
  }

  /**
   * Get shortcut string representation
   * @param {Object} event - Normalized event
   * @returns {string} Shortcut string (e.g., "Ctrl+S")
   * @private
   */
  getShortcutString(event) {
    const parts = [];

    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');

    parts.push(event.key);

    return parts.join('+');
  }

  /**
   * Check if key should be throttled
   * @param {string} key - Key identifier
   * @returns {boolean} True if should throttle
   * @private
   */
  shouldThrottle(key) {
    const now = Date.now();
    const lastTime = this.lastKeyTime.get(key) || 0;

    if (now - lastTime < this.throttleDelay) {
      return true;
    }

    this.lastKeyTime.set(key, now);
    return false;
  }

  /**
   * Debounce callback execution
   * @param {string} type - Event type
   * @param {string} key - Key identifier
   * @param {Function} callback - Callback function
   * @private
   */
  debounceCallback(type, key, callback) {
    const timerKey = `${type}-${key}`;

    // Clear existing timer
    if (this.debounceTimers.has(timerKey)) {
      clearTimeout(this.debounceTimers.get(timerKey));
    }

    // Set new timer
    const timer = setTimeout(() => {
      callback();
      this.debounceTimers.delete(timerKey);
    }, this.debounceDelay);

    this.debounceTimers.set(timerKey, timer);
  }

  /**
   * Check if key is currently pressed
   * @param {string} key - Key to check
   * @returns {boolean} True if pressed
   */
  isKeyPressed(key) {
    return this.keysPressed.has(key);
  }

  /**
   * Get all currently pressed keys
   * @returns {Array<string>} Array of pressed keys
   */
  getPressedKeys() {
    return Array.from(this.keysPressed);
  }

  /**
   * Cleanup and remove all event listeners
   * Prevents memory leaks
   */
  cleanup() {
    if (!this.isInitialized) return;

    // Remove all event listeners
    this.listeners.forEach(({ eventType, handler }) => {
      this.removeListener(eventType, handler);
    });
    this.listeners = [];

    // Clear all timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.clear();

    // Clear state
    this.keysPressed.clear();
    this.lastKeyTime.clear();

    this.isInitialized = false;
    this.element = null;

    console.log('[KeyboardHandler] Cleanup complete');
  }
}

export default KeyboardHandler;
