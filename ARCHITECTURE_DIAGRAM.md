# Input Handler Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UnifiedGameSystem                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Input Integration                          │  │
│  │  • Initializes InputManager with document element             │  │
│  │  • Configures keyboard, touch handlers based on device        │  │
│  │  • Routes input events to handleGameInput()                   │  │
│  │  • Maps inputs to game actions (attack, defend, etc.)         │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          InputManager                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Unified Input Coordinator                                     │  │
│  │  • Event routing and listener management                       │  │
│  │  • Input recording and replay system                           │  │
│  │  • State tracking (keyboard keys, touch, gamepad buttons)      │  │
│  │  • Dynamic handler enable/disable                              │  │
│  │  • Wildcard and type-specific listeners                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         ↓                    ↓                           ↓
┌─────────────────┐  ┌─────────────────┐      ┌─────────────────────┐
│ KeyboardHandler │  │  TouchHandler   │      │  GamepadHandler     │
├─────────────────┤  ├─────────────────┤      ├─────────────────────┤
│ • keydown       │  │ • touchstart    │      │ • gamepadconnected  │
│ • keyup         │  │ • touchmove     │      │ • gamepaddisconnect │
│ • keypress      │  │ • touchend      │      │ • Polling (60fps)   │
│                 │  │ • pointerdown   │      │                     │
│ Features:       │  │ • pointermove   │      │ Features:           │
│ • Debounce      │  │ • pointerup     │      │ • Button mapping    │
│ • Throttle      │  │ • mousedown     │      │ • Axis deadzone     │
│ • Shortcuts     │  │ • mousemove     │      │ • Multi-gamepad     │
│ • Key tracking  │  │ • mouseup       │      │ • Standard layout   │
│                 │  │                 │      │                     │
│ Cross-browser:  │  │ Features:       │      │ Mapping:            │
│ • IE11+         │  │ • Tap           │      │ • Xbox controller   │
│ • Event normal  │  │ • Swipe         │      │ • PlayStation       │
│                 │  │ • Pinch         │      │ • Generic           │
│                 │  │ • Long-press    │      │                     │
│                 │  │ • Passive       │      │                     │
│                 │  │                 │      │                     │
│                 │  │ Mobile:         │      │                     │
│                 │  │ • CSS touch-    │      │                     │
│                 │  │   action        │      │                     │
│                 │  │ • Gesture       │      │                     │
│                 │  │   recognition   │      │                     │
└─────────────────┘  └─────────────────┘      └─────────────────────┘
         ↓                    ↓                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Browser Event System                              │
│  • addEventListener / removeEventListener                            │
│  • Event bubbling and capturing                                      │
│  • Compatibility layers (IE11 attachEvent)                           │
└─────────────────────────────────────────────────────────────────────┘
         ↓                    ↓                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Integration Points                                │
├─────────────────────────────────────────────────────────────────────┤
│  CompatibilityManager          MobileOptimizationManager             │
│  • Feature detection           • Touch optimization                  │
│  • Browser info               • Device detection                     │
│  • Polyfill loading           • Performance tuning                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Event Flow Example: Keyboard Input

```
User presses 'A' key
        ↓
Browser fires 'keydown' event
        ↓
KeyboardHandler.handleKeyDown()
    • Normalize event (cross-browser)
    • Check if already pressed (prevent duplicate)
    • Add to keysPressed Set
    • Apply throttle check
    • Apply debounce
        ↓
InputManager.handleKeyboardInput()
    • Create normalized input event
    • Update inputState.keyboard
    • Record if recording enabled
        ↓
InputManager.routeInput()
    • Call global onInput callback
    • Call 'keyboard' type listeners
    • Call '*' wildcard listeners
        ↓
UnifiedGameSystem.handleGameInput()
    • Check if in game mode
    • Check if awaiting user input
    • Map key to action (1 → attack)
        ↓
UnifiedGameSystem.handleUserAction()
    • Update game state
    • Execute next node
```

## Event Flow Example: Touch Gesture

```
User swipes left on screen
        ↓
Browser fires touch events:
    1. touchstart (finger down)
    2. touchmove (finger moves)
    3. touchend (finger up)
        ↓
TouchHandler processes:
    • startTouch() - Record start position, time
    • moveTouch() - Track movement, update position
    • endTouch() - Calculate distance, direction
        ↓
TouchHandler detects swipe:
    • Distance > swipeThreshold (100px)
    • Direction: left (deltaX negative, |deltaX| > |deltaY|)
    • Calculate velocity
        ↓
TouchHandler.handleSwipe()
    • Create gesture data
    • Call onSwipe callback
    • Dispatch custom 'gesture' event
        ↓
InputManager.handleTouchInput()
    • Create normalized touch event
    • Update inputState.touch
    • Record if enabled
        ↓
InputManager.routeInput()
        ↓
UnifiedGameSystem.handleGameInput()
    • Detect gesture === 'swipe-left'
    • Map to action: 공격
        ↓
Game action executed
```

## Memory Management Flow

```
Component Mount
        ↓
Create InputManager
        ↓
Initialize handlers
    • KeyboardHandler
    • TouchHandler
    • GamepadHandler
        ↓
Add event listeners
    • addEventListener calls
    • Store in listeners array
        ↓
Start timers/polling
    • Debounce timers
    • Throttle timers
    • Gamepad polling
        ↓
... Application runs ...
        ↓
Component Unmount
        ↓
InputManager.cleanup()
    • Stop recording
    • Cleanup keyboard handler
    • Cleanup touch handler
    • Cleanup gamepad handler
    • Clear inputListeners Map
    • Clear state Sets/Maps
    • Nullify element reference
        ↓
Each Handler cleanup():
    • removeEventListener for all
    • clearTimeout for all timers
    • clearInterval for polling
    • Clear state collections
    • Nullify references
        ↓
Memory released
```

## Configuration Example

```javascript
const inputManager = new InputManager({
  // Target element
  element: document.body,
  
  // Enable/disable handlers
  enableKeyboard: true,
  enableTouch: true,
  enableGamepad: false,
  
  // Global callback
  onInput: (event) => {
    console.log(event.type, event);
  },
  
  // Handler-specific options
  keyboardOptions: {
    debounceDelay: 100,    // ms
    throttleDelay: 50,     // ms
    enableShortcuts: true
  },
  
  touchOptions: {
    enableGestures: true,
    preventDefaultTouch: false,
    tapThreshold: 10,      // pixels
    swipeThreshold: 100,   // pixels
    longPressDuration: 500 // ms
  },
  
  gamepadOptions: {
    pollInterval: 16,      // ms (~60fps)
    deadzone: 0.15        // 0-1
  }
});
```

## State Management

```
InputManager State:
├── inputState
│   ├── keyboard: Set<string>           // Currently pressed keys
│   ├── touch: { active, x, y }         // Touch state
│   └── gamepad: Map<index, Set<button>> // Gamepad buttons
│
├── inputListeners: Map<type, Set<callback>>
│   ├── 'keyboard' → Set of callbacks
│   ├── 'touch' → Set of callbacks
│   ├── 'gamepad' → Set of callbacks
│   └── '*' → Set of callbacks (wildcard)
│
└── recording: Array<inputEvent>
    └── When isRecording === true

KeyboardHandler State:
├── keysPressed: Set<string>
├── lastKeyTime: Map<key, timestamp>
├── debounceTimers: Map<key, timerId>
└── throttleTimers: Map<key, timerId>

TouchHandler State:
├── touchState: { isActive, startTime, positions, ... }
├── longPressTimer: timerId | null
└── listeners: Array<{ eventType, handler, options }>

GamepadHandler State:
├── gamepads: Map<index, gamepad>
├── previousStates: Map<index, { buttons, axes }>
├── pollTimer: timerId | null
└── isPolling: boolean
```

This architecture provides:
- ✅ Clear separation of concerns
- ✅ Reusable, testable components
- ✅ Efficient event handling
- ✅ Memory-safe cleanup
- ✅ Flexible configuration
- ✅ Easy integration
