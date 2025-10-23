/**
 * @jest-environment jsdom
 */

import UIRenderer from '@/components/game/renderers/UIRenderer'

// Mock canvas context
const mockContext = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left',
  textBaseline: 'top',
  globalAlpha: 1,
  scale: jest.fn(),
  clearRect: jest.fn(),
  fillRect: jest.fn(),
  strokeRect: jest.fn(),
  fillText: jest.fn(),
  drawImage: jest.fn(),
  beginPath: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
}

// Mock HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = jest.fn((contextId) => {
  if (contextId === '2d') {
    return mockContext
  }
  return null
})

describe('UIRenderer', () => {
  let canvas
  let renderer

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()
    
    // Create mock canvas element
    canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    document.body.appendChild(canvas)
  })

  afterEach(() => {
    // Cleanup
    if (renderer) {
      renderer.cleanup()
      renderer = null
    }
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas)
    }
  })

  describe('초기화', () => {
    it('캔버스 요소 없이 생성 시 에러 발생', () => {
      expect(() => {
        new UIRenderer({})
      }).toThrow('[UIRenderer] Canvas element is required')
    })

    it('정상적으로 초기화됨', () => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })

      expect(renderer.isInitialized).toBe(true)
      expect(renderer.canvas).toBe(canvas)
      expect(renderer.width).toBe(800)
      expect(renderer.height).toBe(600)
    })

    it('Canvas 2D 컨텍스트 사용', () => {
      renderer = new UIRenderer({
        canvas,
      })

      expect(renderer.ctx).toBeTruthy()
    })
  })

  describe('UI 레이아웃', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('초기 레이아웃 설정', () => {
      expect(renderer.layout).toHaveProperty('statsBar')
      expect(renderer.layout).toHaveProperty('inventory')
      expect(renderer.layout).toHaveProperty('miniMap')
    })

    it('반응형 레이아웃 (작은 화면)', () => {
      renderer.resize(500, 400)
      
      expect(renderer.layout.statsBar.width).toBe(480) // width - 20
      expect(renderer.layout.inventory.width).toBe(480)
      expect(renderer.layout.miniMap.width).toBe(150)
    })
  })

  describe('스탯 바 렌더링', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('플레이어 스탯 렌더링', () => {
      const stats = {
        name: 'TestPlayer',
        hp: 80,
        maxHp: 100,
        mp: 30,
        maxMp: 50,
        level: 5,
        exp: 150,
        maxExp: 200,
      }

      renderer.renderStatsBar(stats)

      expect(mockContext.fillRect).toHaveBeenCalled()
      expect(mockContext.fillText).toHaveBeenCalledWith(
        'TestPlayer',
        expect.any(Number),
        expect.any(Number)
      )
    })

    it('HP/MP 바 렌더링', () => {
      const stats = {
        name: 'Player',
        hp: 50,
        maxHp: 100,
        mp: 25,
        maxMp: 50,
        level: 1,
      }

      // Should not throw
      expect(() => {
        renderer.renderStatsBar(stats)
      }).not.toThrow()
    })
  })

  describe('인벤토리 렌더링', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('빈 인벤토리 렌더링', () => {
      expect(() => {
        renderer.renderInventory([], 12)
      }).not.toThrow()
    })

    it('아이템이 있는 인벤토리 렌더링', () => {
      const items = [
        { id: '1', name: 'Sword', count: 1 },
        { id: '2', name: 'Potion', count: 5 },
      ]

      expect(() => {
        renderer.renderInventory(items, 12)
      }).not.toThrow()
    })
  })

  describe('미니맵 렌더링', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('미니맵 렌더링', () => {
      const mapData = {}
      const playerPos = { x: 100, y: 100 }

      expect(() => {
        renderer.renderMiniMap(mapData, playerPos)
      }).not.toThrow()
    })
  })

  describe('메시지 박스 렌더링', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('info 메시지 렌더링', () => {
      renderer.renderMessage('Test message', { type: 'info' })
      
      // Should not throw
      expect(renderer.ctx).toBeTruthy()
    })

    it('error 메시지 렌더링', () => {
      renderer.renderMessage('Error occurred', { type: 'error' })
      
      expect(renderer.ctx).toBeTruthy()
    })

    it('success 메시지 렌더링', () => {
      renderer.renderMessage('Success!', { type: 'success' })
      
      expect(renderer.ctx).toBeTruthy()
    })
  })

  describe('전체 UI 렌더링', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('모든 UI 요소 렌더링', () => {
      const uiData = {
        stats: {
          name: 'Player',
          hp: 80,
          maxHp: 100,
          mp: 30,
          maxMp: 50,
          level: 5,
        },
        inventory: [
          { id: '1', name: 'Item1', count: 1 },
        ],
        mapData: {},
        playerPos: { x: 100, y: 100 },
        message: 'Test message',
        messageOptions: { type: 'info' },
      }

      expect(() => {
        renderer.render(uiData)
      }).not.toThrow()
      
      expect(renderer.lastRenderTime).toBeGreaterThan(0)
    })
  })

  describe('캔버스 클리어', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('캔버스 클리어', () => {
      renderer.clear()
      
      expect(mockContext.clearRect).toHaveBeenCalledWith(0, 0, 800, 600)
    })
  })

  describe('리사이즈', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('캔버스 크기 변경', () => {
      renderer.resize(1024, 768)
      
      expect(renderer.width).toBe(1024)
      expect(renderer.height).toBe(768)
      expect(canvas.style.width).toBe('1024px')
      expect(canvas.style.height).toBe('768px')
    })
  })

  describe('정리', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('cleanup 호출 시 모든 리소스 정리', () => {
      renderer.cleanup()
      
      expect(renderer.isInitialized).toBe(false)
      expect(renderer.ctx).toBeNull()
      expect(renderer.canvas).toBeNull()
      expect(renderer.iconCache.size).toBe(0)
    })
  })

  describe('렌더러 상태 정보', () => {
    beforeEach(() => {
      renderer = new UIRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('getInfo 메서드 정상 동작', () => {
      const info = renderer.getInfo()
      
      expect(info).toHaveProperty('isInitialized')
      expect(info).toHaveProperty('size')
      expect(info).toHaveProperty('pixelRatio')
      expect(info).toHaveProperty('lastRenderTime')
      expect(info).toHaveProperty('layout')
      expect(info.isInitialized).toBe(true)
      expect(info.size).toEqual({ width: 800, height: 600 })
    })
  })
})
