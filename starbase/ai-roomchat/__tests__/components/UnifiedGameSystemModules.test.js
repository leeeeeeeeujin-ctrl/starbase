/**
 * UnifiedGameSystem 모듈 테스트
 */

import GameRenderer from '../../components/game/renderers/GameRenderer'
import UIRenderer from '../../components/game/renderers/UIRenderer'
import EffectsRenderer from '../../components/game/renderers/EffectsRenderer'
import InputManager from '../../components/game/input/InputManager'
import GameEngine from '../../components/game/logic/GameEngine'
import PhysicsEngine from '../../components/game/logic/PhysicsEngine'
import EntityManager from '../../components/game/logic/EntityManager'
import ScoreManager from '../../components/game/logic/ScoreManager'

describe('UnifiedGameSystem Modules', () => {
  describe('GameEngine', () => {
    let gameEngine

    beforeEach(async () => {
      gameEngine = new GameEngine()
      await gameEngine.initialize()
    })

    afterEach(() => {
      gameEngine.cleanup()
    })

    test('should initialize correctly', () => {
      expect(gameEngine.isInitialized).toBe(true)
    })

    test('should start game', () => {
      const result = gameEngine.start()
      expect(result).toBe(true)
      expect(gameEngine.isGameRunning()).toBe(true)
    })

    test('should pause and resume game', () => {
      gameEngine.start()
      gameEngine.pause()
      expect(gameEngine.isGameRunning()).toBe(false)
      
      gameEngine.resume()
      expect(gameEngine.isGameRunning()).toBe(true)
    })

    test('should increment turn', () => {
      gameEngine.start()
      const turn = gameEngine.nextTurn()
      expect(turn).toBe(1)
    })
  })

  describe('EntityManager', () => {
    let entityManager

    beforeEach(async () => {
      entityManager = new EntityManager()
      await entityManager.initialize()
    })

    afterEach(() => {
      entityManager.cleanup()
    })

    test('should create entity', () => {
      const entity = entityManager.createEntity('player', { x: 100, y: 100 })
      expect(entity).toBeTruthy()
      expect(entity.type).toBe('player')
      expect(entity.x).toBe(100)
    })

    test('should get entity by id', () => {
      const entity = entityManager.createEntity('player')
      const retrieved = entityManager.getEntity(entity.id)
      expect(retrieved).toEqual(entity)
    })

    test('should get entities by type', () => {
      entityManager.createEntity('player')
      entityManager.createEntity('enemy')
      entityManager.createEntity('enemy')
      
      const enemies = entityManager.getEntitiesByType('enemy')
      expect(enemies.length).toBe(2)
    })

    test('should remove entity', () => {
      const entity = entityManager.createEntity('player')
      const result = entityManager.removeEntity(entity.id)
      expect(result).toBe(true)
      expect(entityManager.getEntity(entity.id)).toBeUndefined()
    })
  })

  describe('PhysicsEngine', () => {
    let physicsEngine

    beforeEach(async () => {
      physicsEngine = new PhysicsEngine()
      await physicsEngine.initialize()
    })

    afterEach(() => {
      physicsEngine.cleanup()
    })

    test('should initialize correctly', () => {
      expect(physicsEngine.isInitialized).toBe(true)
    })

    test('should detect collision', () => {
      const entityA = {
        x: 0, y: 0, width: 50, height: 50,
        physics: { vx: 0, vy: 0 }
      }
      const entityB = {
        x: 25, y: 25, width: 50, height: 50,
        physics: { vx: 0, vy: 0 }
      }
      
      const collision = physicsEngine.checkCollision(entityA, entityB)
      expect(collision).toBe(true)
    })

    test('should not detect collision for separate entities', () => {
      const entityA = {
        x: 0, y: 0, width: 50, height: 50,
        physics: { vx: 0, vy: 0 }
      }
      const entityB = {
        x: 100, y: 100, width: 50, height: 50,
        physics: { vx: 0, vy: 0 }
      }
      
      const collision = physicsEngine.checkCollision(entityA, entityB)
      expect(collision).toBe(false)
    })
  })

  describe('ScoreManager', () => {
    let scoreManager

    beforeEach(async () => {
      scoreManager = new ScoreManager()
      await scoreManager.initialize()
    })

    afterEach(() => {
      scoreManager.cleanup()
    })

    test('should add score', () => {
      scoreManager.addScore(100)
      expect(scoreManager.getScore()).toBe(100)
    })

    test('should update high score', () => {
      scoreManager.addScore(100)
      scoreManager.resetScore()
      scoreManager.addScore(50)
      
      expect(scoreManager.getScore()).toBe(50)
      expect(scoreManager.getHighScore()).toBe(100)
    })

    test('should record stats', () => {
      scoreManager.recordStat('kills', 5)
      scoreManager.recordStat('kills', 3)
      
      expect(scoreManager.getStat('kills')).toBe(8)
    })

    test('should register and unlock achievement', () => {
      scoreManager.registerAchievement({
        id: 'first_kill',
        name: 'First Blood',
        description: 'Get your first kill',
        condition: (manager) => manager.getStat('kills') >= 1
      })
      
      scoreManager.recordStat('kills', 1)
      scoreManager.checkAchievements()
      
      const achievements = scoreManager.getUnlockedAchievements()
      expect(achievements.length).toBe(1)
      expect(achievements[0].id).toBe('first_kill')
    })
  })

  describe('InputManager', () => {
    let inputManager
    let container

    beforeEach(async () => {
      container = document.createElement('div')
      document.body.appendChild(container)
      
      inputManager = new InputManager()
      await inputManager.initialize(container)
    })

    afterEach(() => {
      inputManager.cleanup()
      document.body.removeChild(container)
    })

    test('should initialize correctly', () => {
      expect(inputManager.isInitialized).toBe(true)
    })

    test('should map key to action', () => {
      const action = inputManager.mapKeyToAction('w')
      expect(action).toBe('move_up')
    })

    test('should queue input', () => {
      inputManager.queueInput({ type: 'keyboard', action: 'move_up' })
      const inputs = inputManager.getQueuedInputs()
      expect(inputs.length).toBe(1)
      expect(inputs[0].action).toBe('move_up')
    })

    test('should notify listeners', (done) => {
      inputManager.on('test_action', (data) => {
        expect(data.action).toBe('test_action')
        done()
      })
      
      inputManager.notifyListeners('test_action')
    })
  })

  describe('GameRenderer', () => {
    let gameRenderer
    let container

    beforeEach(async () => {
      container = document.createElement('div')
      container.style.width = '800px'
      container.style.height = '600px'
      document.body.appendChild(container)
      
      gameRenderer = new GameRenderer()
      await gameRenderer.initialize(container)
    })

    afterEach(() => {
      gameRenderer.cleanup()
      document.body.removeChild(container)
    })

    test('should initialize correctly', () => {
      expect(gameRenderer.isInitialized).toBe(true)
      expect(gameRenderer.canvas).toBeTruthy()
      // ctx may be null in test environment without canvas support
    })

    test('should render without errors', () => {
      const gameState = {
        characterData: { name: 'Test Hero' },
        gameState: { entities: [] }
      }
      
      expect(() => {
        gameRenderer.render(gameState)
      }).not.toThrow()
    })
  })

  describe('UIRenderer', () => {
    let uiRenderer
    let container

    beforeEach(async () => {
      container = document.createElement('div')
      document.body.appendChild(container)
      
      uiRenderer = new UIRenderer()
      await uiRenderer.initialize(container)
    })

    afterEach(() => {
      uiRenderer.cleanup()
      document.body.removeChild(container)
    })

    test('should initialize correctly', () => {
      expect(uiRenderer.isInitialized).toBe(true)
      expect(uiRenderer.container).toBeTruthy()
    })

    test('should render without errors', () => {
      const gameState = {
        characterData: { name: 'Test Hero' },
        variables: { '{{캐릭터.HP}}': 100 }
      }
      const executionState = {
        currentTurn: 1,
        gamePhase: 'playing',
        lastResponse: 'Test response'
      }
      
      expect(() => {
        uiRenderer.render(gameState, executionState)
      }).not.toThrow()
    })
  })

  describe('EffectsRenderer', () => {
    let effectsRenderer
    let container

    beforeEach(async () => {
      container = document.createElement('div')
      container.style.width = '800px'
      container.style.height = '600px'
      document.body.appendChild(container)
      
      effectsRenderer = new EffectsRenderer()
      await effectsRenderer.initialize(container)
    })

    afterEach(() => {
      effectsRenderer.cleanup()
      document.body.removeChild(container)
    })

    test('should initialize correctly', () => {
      expect(effectsRenderer.isInitialized).toBe(true)
      expect(effectsRenderer.canvas).toBeTruthy()
    })

    test('should add effect', () => {
      effectsRenderer.addEffect('particle', { x: 100, y: 100 })
      expect(effectsRenderer.effects.length).toBe(1)
    })

    test('should clear effects', () => {
      effectsRenderer.addEffect('particle', { x: 100, y: 100 })
      effectsRenderer.clearEffects()
      expect(effectsRenderer.effects.length).toBe(0)
    })
  })
})
