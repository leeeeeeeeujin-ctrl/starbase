# UnifiedGameSystem Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UnifiedGameSystem.js                         │
│                    (Orchestration Layer)                            │
│                                                                      │
│  - Props: initialCharacter, gameTemplateId, onGameEnd               │
│  - Lifecycle: initialize(), update(), cleanup()                     │
│  - Event Bus: pub/sub communication                                 │
│  - State Sync: React state ↔ Module state                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
        ┌───────────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
        │  Rendering Layer │ │Input Layer │ │Logic Layer │
        └──────────────────┘ └────────────┘ └────────────┘
                │                   │               │
    ┌───────────┼───────┐           │      ┌────────┼────────┬────────┐
    │           │       │           │      │        │        │        │
┌───▼───┐  ┌───▼───┐ ┌─▼───────┐ ┌─▼──────▼──┐ ┌──▼──────┐ │  ┌─────▼────┐
│ Game  │  │  UI   │ │ Effects │ │  Input   │ │  Game   │ │  │ Physics  │
│Render │  │Render │ │ Render  │ │ Manager  │ │ Engine  │ │  │ Engine   │
└───────┘  └───────┘ └─────────┘ └──────────┘ └─────────┘ │  └──────────┘
                                                            │
                                                  ┌─────────┼─────────┐
                                                  │         │         │
                                              ┌───▼───┐ ┌──▼──────┐ │
                                              │Entity │ │ Score   │ │
                                              │Manager│ │ Manager │ │
                                              └───────┘ └─────────┘ │
                                                                    │
                                                                    └──────┐
                                                                           │
┌──────────────────────────────────────────────────────────────────────────┘
│
│  EVENT BUS (Module Communication)
│  ═══════════════════════════════════
│
│  ┌─────────────────────────────────────────────────────────────┐
│  │ Events:                                                      │
│  │  • node:start        → Node execution begins                │
│  │  • node:complete     → Node execution finished              │
│  │  • node:error        → Node execution failed                │
│  │  • input:required    → User input needed                    │
│  │  • input:action      → User action received                 │
│  │  • game:end          → Game finished                        │
│  └─────────────────────────────────────────────────────────────┘
│
└────────────────────────────────────────────────────────────────────


MODULE DETAILS
══════════════

Rendering Layer
───────────────
┌─────────────────────────────────────────────────────────────────┐
│ GameRenderer.js                                                  │
│  • Canvas-based rendering                                       │
│  • Renders: background, entities, character                     │
│  • Methods: initialize(), render(), cleanup()                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ UIRenderer.js                                                    │
│  • DOM-based UI overlay                                         │
│  • Renders: HUD, dialogue, menus                                │
│  • Methods: initialize(), render(), cleanup()                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ EffectsRenderer.js                                               │
│  • Visual effects system                                        │
│  • Effects: particles, flash, shake                             │
│  • Methods: initialize(), render(), addEffect(), cleanup()      │
└─────────────────────────────────────────────────────────────────┘


Input Layer
───────────
┌─────────────────────────────────────────────────────────────────┐
│ InputManager.js                                                  │
│  • Handles: keyboard, mouse, touch                              │
│  • Input queue management                                       │
│  • Action mapping (keys → game actions)                         │
│  • Methods: initialize(), on(), off(), cleanup()                │
└─────────────────────────────────────────────────────────────────┘


Logic Layer
───────────
┌─────────────────────────────────────────────────────────────────┐
│ GameEngine.js                                                    │
│  • Core game loop                                               │
│  • State management (phase, turn, time)                         │
│  • Controls: start(), pause(), resume(), stop()                 │
│  • Methods: initialize(), update(), cleanup()                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PhysicsEngine.js                                                 │
│  • Physics calculations                                         │
│  • Collision detection (AABB)                                   │
│  • Forces: gravity, velocity, friction                          │
│  • Methods: initialize(), update(), applyForce(), cleanup()     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ EntityManager.js                                                 │
│  • Entity lifecycle (create, update, destroy)                   │
│  • Entity queries (by type, position, distance)                 │
│  • Max entities: 1000 (configurable)                            │
│  • Methods: createEntity(), getEntity(), removeEntity()         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ ScoreManager.js                                                  │
│  • Score tracking & high scores                                 │
│  • Statistics recording                                         │
│  • Achievement system                                           │
│  • Methods: addScore(), recordStat(), checkAchievements()       │
└─────────────────────────────────────────────────────────────────┘


DATA FLOW
═════════

1. Initialize
   UnifiedGameSystem.js
   └─→ Initialize all modules in order
       └─→ Setup event listeners
           └─→ Register character variables

2. Game Loop (requestAnimationFrame)
   UnifiedGameSystem.updateGameLoop()
   ├─→ GameEngine.update() → deltaTime
   ├─→ EntityManager.updateAll(deltaTime)
   ├─→ PhysicsEngine.update(deltaTime, entities)
   ├─→ GameRenderer.render(gameData)
   ├─→ UIRenderer.render(gameData, executionState)
   └─→ EffectsRenderer.render(deltaTime)

3. User Input
   InputManager detects input
   └─→ Emit 'input:action' event
       └─→ UnifiedGameSystem handles action
           └─→ Update game state
               └─→ Execute next node

4. Node Execution
   executeNode(nodeId)
   ├─→ Emit 'node:start' event
   ├─→ Compile template with variables
   ├─→ Generate AI response
   ├─→ Update game history
   ├─→ GameEngine.nextTurn()
   ├─→ ScoreManager.recordStat()
   ├─→ Emit 'node:complete' event
   └─→ Execute next node or end game

5. Cleanup
   UnifiedGameSystem cleanup
   └─→ Stop game loop (cancelAnimationFrame)
       └─→ Cleanup all modules
           └─→ Remove event listeners
               └─→ Clear resources
```
