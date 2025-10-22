/**
 * 👆 Touch Handler
 * 
 * Handles touch, pointer, and mouse events with unified interface.
 * Optimized for mobile devices with gesture recognition.
 * Integrates with MobileOptimizationManager for best performance.
 * 
 * 🔧 Features:
 * - Touch/Pointer/Mouse event unification
 * - Gesture recognition (tap, swipe, pinch, long-press)
 * - Passive event listeners for performance
 * - Cross-browser compatibility (IE11+ with Pointer Events)
 * - Memory leak prevention
 * - Mobile optimization integration
 * 
 * @version 1.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

import { compatibilityManager } from '../../../utils/compatibilityManager';

/**
 * TouchHandler class
 * Manages touch and pointer input with gesture recognition
 */
export class TouchHandler {
  /**
   * Constructor
   * @param {Object} options - Configuration options
   * @param {HTMLElement} [options.element] - Target element for touch events
   * @param {boolean} [options.enableGestures=true] - Enable gesture recognition
   * @param {boolean} [options.preventDefaultTouch=false] - Prevent default touch behavior
   * @param {number} [options.tapThreshold=10] - Maximum movement for tap (pixels)
   * @param {number} [options.swipeThreshold=100] - Minimum distance for swipe (pixels)
   * @param {number} [options.longPressDuration=500] - Long press duration (ms)
   * @param {Function} [options.onTap] - Tap gesture callback
   * @param {Function} [options.onSwipe] - Swipe gesture callback
   * @param {Function} [options.onPinch] - Pinch gesture callback
   * @param {Function} [options.onLongPress] - Long press callback
   * @param {Function} [options.onTouchStart] - Touch start callback
   * @param {Function} [options.onTouchMove] - Touch move callback
   * @param {Function} [options.onTouchEnd] - Touch end callback
   */
  constructor(options = {}) {
    this.element = options.element || null;
    this.enableGestures = options.enableGestures !== false;
    this.preventDefaultTouch = options.preventDefaultTouch || false;
    this.tapThreshold = options.tapThreshold || 10;
    this.swipeThreshold = options.swipeThreshold || 100;
    this.longPressDuration = options.longPressDuration || 500;
    
    // Callbacks
    this.onTap = options.onTap || null;
    this.onSwipe = options.onSwipe || null;
    this.onPinch = options.onPinch || null;
    this.onLongPress = options.onLongPress || null;
    this.onTouchStart = options.onTouchStart || null;
    this.onTouchMove = options.onTouchMove || null;
    this.onTouchEnd = options.onTouchEnd || null;
    
    // Touch state
    this.touchState = {
      isActive: false,
      startTime: 0,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      startDistance: 0,
      currentDistance: 0,
      touchCount: 0,
      moved: false
    };
    
    // Timers
    this.longPressTimer = null;
    
    // Event listeners registry
    this.listeners = [];
    
    // Compatibility info
    this.compatibilityInfo = null;
    this.supportsTouchEvents = false;
    this.supportsPointerEvents = false;
    this.supportsPassiveListeners = false;
    this.isInitialized = false;
    
    // Bind methods
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleTouchCancel = this.handleTouchCancel.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }
  
  /**
   * Initialize touch handler
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('[TouchHandler] Already initialized');
      return;
    }
    
    if (!this.element) {
      console.warn('[TouchHandler] No element provided, skipping initialization');
      return;
    }
    
    try {
      // Get compatibility info
      this.compatibilityInfo = compatibilityManager.getCompatibilityInfo();
      
      // Detect feature support
      this.detectFeatureSupport();
      
      // Register appropriate event listeners based on browser support
      this.registerEventListeners();
      
      // Apply CSS optimizations
      this.applyCSSOptimizations();
      
      this.isInitialized = true;
      console.log('[TouchHandler] Initialized', {
        touchSupport: this.supportsTouchEvents,
        pointerSupport: this.supportsPointerEvents,
        passiveSupport: this.supportsPassiveListeners
      });
      
    } catch (error) {
      console.error('[TouchHandler] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Detect feature support
   * @private
   */
  detectFeatureSupport() {
    // Touch events support
    this.supportsTouchEvents = (
      typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
       (navigator && navigator.maxTouchPoints > 0) ||
       (navigator && navigator.msMaxTouchPoints > 0))
    );
    
    // Pointer events support (IE11+, modern browsers)
    this.supportsPointerEvents = typeof window !== 'undefined' && 'onpointerdown' in window;
    
    // Passive listeners support
    this.supportsPassiveListeners = (() => {
      let supportsPassive = false;
      try {
        const opts = Object.defineProperty({}, 'passive', {
          get() {
            supportsPassive = true;
            return false;
          }
        });
        if (typeof window !== 'undefined') {
          window.addEventListener('testPassive', null, opts);
          window.removeEventListener('testPassive', null, opts);
        }
      } catch (e) {}
      return supportsPassive;
    })();
  }
  
  /**
   * Register event listeners based on browser support
   * @private
   */
  registerEventListeners() {
    // Determine listener options
    const listenerOptions = this.getListenerOptions();
    
    if (this.supportsPointerEvents) {
      // Use Pointer Events (IE11+, modern browsers)
      this.addListener('pointerdown', this.handlePointerDown, listenerOptions);
      this.addListener('pointermove', this.handlePointerMove, listenerOptions);
      this.addListener('pointerup', this.handlePointerUp, false);
      this.addListener('pointercancel', this.handlePointerCancel, false);
      
    } else if (this.supportsTouchEvents) {
      // Use Touch Events (mobile browsers)
      this.addListener('touchstart', this.handleTouchStart, listenerOptions);
      this.addListener('touchmove', this.handleTouchMove, listenerOptions);
      this.addListener('touchend', this.handleTouchEnd, false);
      this.addListener('touchcancel', this.handleTouchCancel, false);
      
      // Also add mouse events as fallback
      this.addListener('mousedown', this.handleMouseDown, false);
      this.addListener('mousemove', this.handleMouseMove, false);
      this.addListener('mouseup', this.handleMouseUp, false);
      
    } else {
      // Fallback to Mouse Events only
      this.addListener('mousedown', this.handleMouseDown, false);
      this.addListener('mousemove', this.handleMouseMove, false);
      this.addListener('mouseup', this.handleMouseUp, false);
    }
  }
  
  /**
   * Get listener options for passive support
   * @returns {Object|boolean} Listener options
   * @private
   */
  getListenerOptions() {
    if (!this.supportsPassiveListeners) {
      return false;
    }
    
    return {
      passive: !this.preventDefaultTouch,
      capture: false
    };
  }
  
  /**
   * Add event listener
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   * @param {Object|boolean} options - Listener options
   * @private
   */
  addListener(eventType, handler, options) {
    if (!this.element) return;
    
    if (this.element.addEventListener) {
      this.element.addEventListener(eventType, handler, options);
    } else if (this.element.attachEvent) {
      // IE8 fallback (though our target is IE11+)
      const wrappedHandler = (e) => handler.call(this.element, e || window.event);
      this.element.attachEvent(`on${eventType}`, wrappedHandler);
      handler._ieWrapper = wrappedHandler;
    }
    
    // Store for cleanup
    this.listeners.push({ eventType, handler, options });
  }
  
  /**
   * Remove event listener
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   * @param {Object|boolean} options - Listener options
   * @private
   */
  removeListener(eventType, handler, options) {
    if (!this.element) return;
    
    if (this.element.removeEventListener) {
      this.element.removeEventListener(eventType, handler, options);
    } else if (this.element.detachEvent) {
      // IE8 fallback
      const wrappedHandler = handler._ieWrapper || handler;
      this.element.detachEvent(`on${eventType}`, wrappedHandler);
    }
  }
  
  /**
   * Apply CSS optimizations for touch
   * @private
   */
  applyCSSOptimizations() {
    if (!this.element || !this.element.style) return;
    
    const style = this.element.style;
    
    // Touch action (IE11+)
    if ('touchAction' in style) {
      style.touchAction = 'manipulation';
    } else if ('msTouchAction' in style) {
      // IE10 prefix
      style.msTouchAction = 'manipulation';
    }
    
    // Prevent text selection during touch
    style.webkitUserSelect = 'none';
    style.mozUserSelect = 'none';
    style.msUserSelect = 'none';
    style.userSelect = 'none';
    
    // Prevent tap highlight (mobile Safari)
    style.webkitTapHighlightColor = 'transparent';
    
    // Prevent text size adjust (iOS)
    style.webkitTextSizeAdjust = '100%';
  }
  
  /**
   * Handle touch start
   * @param {TouchEvent} event - Touch event
   * @private
   */
  handleTouchStart(event) {
    const touch = event.touches[0];
    this.startTouch(touch.clientX, touch.clientY, event.touches.length);
    
    if (this.onTouchStart) {
      this.onTouchStart(this.normalizeTouchEvent(event));
    }
    
    if (this.preventDefaultTouch && !this.supportsPassiveListeners) {
      event.preventDefault();
    }
  }
  
  /**
   * Handle touch move
   * @param {TouchEvent} event - Touch event
   * @private
   */
  handleTouchMove(event) {
    if (!this.touchState.isActive) return;
    
    const touch = event.touches[0];
    this.moveTouch(touch.clientX, touch.clientY);
    
    // Handle pinch gesture for multi-touch
    if (event.touches.length === 2 && this.enableGestures) {
      this.handlePinchGesture(event);
    }
    
    if (this.onTouchMove) {
      this.onTouchMove(this.normalizeTouchEvent(event));
    }
    
    if (this.preventDefaultTouch && !this.supportsPassiveListeners) {
      event.preventDefault();
    }
  }
  
  /**
   * Handle touch end
   * @param {TouchEvent} event - Touch event
   * @private
   */
  handleTouchEnd(event) {
    if (!this.touchState.isActive) return;
    
    this.endTouch();
    
    if (this.onTouchEnd) {
      this.onTouchEnd(this.normalizeTouchEvent(event));
    }
  }
  
  /**
   * Handle touch cancel
   * @param {TouchEvent} event - Touch event
   * @private
   */
  handleTouchCancel(event) {
    this.cancelTouch();
    
    if (this.onTouchEnd) {
      this.onTouchEnd(this.normalizeTouchEvent(event));
    }
  }
  
  /**
   * Handle pointer down (IE11+)
   * @param {PointerEvent} event - Pointer event
   * @private
   */
  handlePointerDown(event) {
    this.startTouch(event.clientX, event.clientY, 1);
    
    if (this.onTouchStart) {
      this.onTouchStart(this.normalizePointerEvent(event));
    }
    
    if (this.preventDefaultTouch) {
      event.preventDefault();
    }
  }
  
  /**
   * Handle pointer move
   * @param {PointerEvent} event - Pointer event
   * @private
   */
  handlePointerMove(event) {
    if (!this.touchState.isActive) return;
    
    this.moveTouch(event.clientX, event.clientY);
    
    if (this.onTouchMove) {
      this.onTouchMove(this.normalizePointerEvent(event));
    }
    
    if (this.preventDefaultTouch) {
      event.preventDefault();
    }
  }
  
  /**
   * Handle pointer up
   * @param {PointerEvent} event - Pointer event
   * @private
   */
  handlePointerUp(event) {
    if (!this.touchState.isActive) return;
    
    this.endTouch();
    
    if (this.onTouchEnd) {
      this.onTouchEnd(this.normalizePointerEvent(event));
    }
  }
  
  /**
   * Handle pointer cancel
   * @param {PointerEvent} event - Pointer event
   * @private
   */
  handlePointerCancel(event) {
    this.cancelTouch();
    
    if (this.onTouchEnd) {
      this.onTouchEnd(this.normalizePointerEvent(event));
    }
  }
  
  /**
   * Handle mouse down (fallback)
   * @param {MouseEvent} event - Mouse event
   * @private
   */
  handleMouseDown(event) {
    // Prevent if touch already handled
    if (this.touchState.isActive) return;
    
    this.startTouch(event.clientX, event.clientY, 1);
    
    if (this.onTouchStart) {
      this.onTouchStart(this.normalizeMouseEvent(event));
    }
  }
  
  /**
   * Handle mouse move (fallback)
   * @param {MouseEvent} event - Mouse event
   * @private
   */
  handleMouseMove(event) {
    if (!this.touchState.isActive) return;
    
    this.moveTouch(event.clientX, event.clientY);
    
    if (this.onTouchMove) {
      this.onTouchMove(this.normalizeMouseEvent(event));
    }
  }
  
  /**
   * Handle mouse up (fallback)
   * @param {MouseEvent} event - Mouse event
   * @private
   */
  handleMouseUp(event) {
    if (!this.touchState.isActive) return;
    
    this.endTouch();
    
    if (this.onTouchEnd) {
      this.onTouchEnd(this.normalizeMouseEvent(event));
    }
  }
  
  /**
   * Start touch tracking
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} touchCount - Number of touches
   * @private
   */
  startTouch(x, y, touchCount) {
    this.touchState = {
      isActive: true,
      startTime: Date.now(),
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      startDistance: 0,
      currentDistance: 0,
      touchCount: touchCount,
      moved: false
    };
    
    // Start long press timer if gestures enabled
    if (this.enableGestures && this.onLongPress) {
      this.longPressTimer = setTimeout(() => {
        if (this.touchState.isActive && !this.touchState.moved) {
          this.handleLongPress();
        }
      }, this.longPressDuration);
    }
  }
  
  /**
   * Update touch position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @private
   */
  moveTouch(x, y) {
    this.touchState.currentX = x;
    this.touchState.currentY = y;
    
    // Calculate movement distance
    const deltaX = x - this.touchState.startX;
    const deltaY = y - this.touchState.startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Mark as moved if exceeds tap threshold
    if (distance > this.tapThreshold) {
      this.touchState.moved = true;
      
      // Cancel long press
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }
  }
  
  /**
   * End touch tracking and detect gesture
   * @private
   */
  endTouch() {
    const duration = Date.now() - this.touchState.startTime;
    const deltaX = this.touchState.currentX - this.touchState.startX;
    const deltaY = this.touchState.currentY - this.touchState.startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Cancel long press timer
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    
    // Detect gesture if enabled
    if (this.enableGestures) {
      if (!this.touchState.moved && distance < this.tapThreshold) {
        // Tap gesture
        this.handleTap();
      } else if (distance > this.swipeThreshold) {
        // Swipe gesture
        this.handleSwipe(deltaX, deltaY, distance);
      }
    }
    
    // Reset state
    this.touchState.isActive = false;
  }
  
  /**
   * Cancel touch tracking
   * @private
   */
  cancelTouch() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    
    this.touchState.isActive = false;
  }
  
  /**
   * Handle tap gesture
   * @private
   */
  handleTap() {
    if (this.onTap) {
      this.onTap({
        x: this.touchState.startX,
        y: this.touchState.startY,
        timestamp: Date.now()
      });
    }
    
    this.dispatchGestureEvent('tap');
  }
  
  /**
   * Handle swipe gesture
   * @param {number} deltaX - X displacement
   * @param {number} deltaY - Y displacement
   * @param {number} distance - Total distance
   * @private
   */
  handleSwipe(deltaX, deltaY, distance) {
    // Determine swipe direction
    let direction;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }
    
    const swipeData = {
      direction: direction,
      deltaX: deltaX,
      deltaY: deltaY,
      distance: distance,
      velocity: distance / (Date.now() - this.touchState.startTime)
    };
    
    if (this.onSwipe) {
      this.onSwipe(swipeData);
    }
    
    this.dispatchGestureEvent('swipe', swipeData);
  }
  
  /**
   * Handle long press gesture
   * @private
   */
  handleLongPress() {
    if (this.onLongPress) {
      this.onLongPress({
        x: this.touchState.startX,
        y: this.touchState.startY,
        duration: this.longPressDuration
      });
    }
    
    this.dispatchGestureEvent('longPress');
  }
  
  /**
   * Handle pinch gesture (multi-touch)
   * @param {TouchEvent} event - Touch event
   * @private
   */
  handlePinchGesture(event) {
    const touch1 = event.touches[0];
    const touch2 = event.touches[1];
    
    const currentDistance = Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
      Math.pow(touch2.clientY - touch1.clientY, 2)
    );
    
    if (this.touchState.startDistance === 0) {
      this.touchState.startDistance = currentDistance;
    }
    
    this.touchState.currentDistance = currentDistance;
    
    const scale = currentDistance / this.touchState.startDistance;
    
    if (this.onPinch) {
      this.onPinch({
        scale: scale,
        distance: currentDistance,
        centerX: (touch1.clientX + touch2.clientX) / 2,
        centerY: (touch1.clientY + touch2.clientY) / 2
      });
    }
    
    this.dispatchGestureEvent('pinch', { scale });
  }
  
  /**
   * Dispatch custom gesture event
   * @param {string} gestureType - Type of gesture
   * @param {Object} detail - Event detail
   * @private
   */
  dispatchGestureEvent(gestureType, detail = {}) {
    if (!this.element || typeof CustomEvent === 'undefined') return;
    
    const event = new CustomEvent('gesture', {
      detail: {
        type: gestureType,
        ...detail,
        timestamp: Date.now()
      },
      bubbles: true,
      cancelable: true
    });
    
    this.element.dispatchEvent(event);
  }
  
  /**
   * Normalize touch event
   * @param {TouchEvent} event - Original touch event
   * @returns {Object} Normalized event
   * @private
   */
  normalizeTouchEvent(event) {
    const touch = event.touches[0] || event.changedTouches[0];
    
    return {
      type: 'touch',
      x: touch ? touch.clientX : 0,
      y: touch ? touch.clientY : 0,
      touchCount: event.touches.length,
      originalEvent: event
    };
  }
  
  /**
   * Normalize pointer event
   * @param {PointerEvent} event - Original pointer event
   * @returns {Object} Normalized event
   * @private
   */
  normalizePointerEvent(event) {
    return {
      type: 'pointer',
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      pressure: event.pressure,
      originalEvent: event
    };
  }
  
  /**
   * Normalize mouse event
   * @param {MouseEvent} event - Original mouse event
   * @returns {Object} Normalized event
   * @private
   */
  normalizeMouseEvent(event) {
    return {
      type: 'mouse',
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      originalEvent: event
    };
  }
  
  /**
   * Cleanup and remove all event listeners
   * Prevents memory leaks
   */
  cleanup() {
    if (!this.isInitialized) return;
    
    // Cancel pending timers
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    
    // Remove all event listeners
    this.listeners.forEach(({ eventType, handler, options }) => {
      this.removeListener(eventType, handler, options);
    });
    this.listeners = [];
    
    // Reset state
    this.touchState = {
      isActive: false,
      startTime: 0,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      startDistance: 0,
      currentDistance: 0,
      touchCount: 0,
      moved: false
    };
    
    this.isInitialized = false;
    this.element = null;
    
    console.log('[TouchHandler] Cleanup complete');
  }
}

export default TouchHandler;
