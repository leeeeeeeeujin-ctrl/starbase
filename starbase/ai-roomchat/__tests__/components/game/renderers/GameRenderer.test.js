/**
 * @jest-environment jsdom
 */

import { GameRenderer } from '@/components/game/renderers/GameRenderer'

// Mock canvas context
const mockContext = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left',
  textBaseline: 'top',
  globalAlpha: 1,
  imageSmoothingEnabled: true,
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

describe('GameRenderer', () => {
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
        new GameRenderer({})
      }).toThrow('[GameRenderer] Canvas element is required')
    })

    it('정상적으로 초기화됨', () => {
      renderer = new GameRenderer({
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
      renderer = new GameRenderer({
        canvas,
        enableWebGL: false,
      })

      expect(renderer.ctx).toBeTruthy()
      expect(renderer.isWebGL).toBe(false)
    })

    it('devicePixelRatio 적용', () => {
      const originalPixelRatio = window.devicePixelRatio
      Object.defineProperty(window, 'devicePixelRatio', {
        writable: true,
        value: 2,
      })

      renderer = new GameRenderer({
        canvas,
        width: 800,
        height: 600,
      })

      expect(renderer.pixelRatio).toBe(2)

      // Restore
      Object.defineProperty(window, 'devicePixelRatio', {
        writable: true,
        value: originalPixelRatio,
      })
    })
  })

  describe('렌더링 기능', () => {
    beforeEach(() => {
      renderer = new GameRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('캔버스 클리어', () => {
      renderer.clear()
      
      expect(mockContext.clearRect).toHaveBeenCalledWith(0, 0, 800, 600)
    })

    it('배경색으로 클리어', () => {
      renderer.clear('#ff0000')
      
      expect(mockContext.fillStyle).toBe('#ff0000')
      expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 800, 600)
    })

    it('텍스트 렌더링', () => {
      renderer.renderText('Test', 10, 20, {
        font: '16px sans-serif',
        color: '#ffffff',
      })
      
      expect(mockContext.font).toBe('16px sans-serif')
      expect(mockContext.fillStyle).toBe('#ffffff')
      expect(mockContext.fillText).toHaveBeenCalledWith('Test', 10, 20)
    })
  })

  describe('이미지 로딩', () => {
    beforeEach(() => {
      renderer = new GameRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('이미지 캐싱', async () => {
      const imageUrl = 'https://example.com/image.png'
      
      // Mock Image
      const mockImg = { complete: true, src: '' }
      global.Image = jest.fn(() => mockImg)

      const promise = renderer.loadImage(imageUrl)
      
      // Simulate load
      setTimeout(() => {
        mockImg.onload && mockImg.onload()
      }, 0)

      const img = await promise
      
      expect(renderer.imageCache.has(imageUrl)).toBe(true)
      expect(renderer.imageCache.get(imageUrl)).toBe(mockImg)
    })
  })

  describe('리사이즈', () => {
    beforeEach(() => {
      renderer = new GameRenderer({
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

  describe('렌더링 루프', () => {
    beforeEach(() => {
      renderer = new GameRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('렌더링 루프 시작', () => {
      const callback = jest.fn()
      
      renderer.startRenderLoop(callback)
      
      expect(renderer.isRendering).toBe(true)
      expect(renderer.animationFrameId).not.toBeNull()
    })

    it('렌더링 루프 정지', () => {
      const callback = jest.fn()
      
      renderer.startRenderLoop(callback)
      renderer.stopRenderLoop()
      
      expect(renderer.isRendering).toBe(false)
      expect(renderer.animationFrameId).toBeNull()
    })
  })

  describe('정리', () => {
    beforeEach(() => {
      renderer = new GameRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('cleanup 호출 시 모든 리소스 정리', () => {
      const callback = jest.fn()
      renderer.startRenderLoop(callback)
      
      renderer.cleanup()
      
      expect(renderer.isInitialized).toBe(false)
      expect(renderer.isRendering).toBe(false)
      expect(renderer.ctx).toBeNull()
      expect(renderer.canvas).toBeNull()
      expect(renderer.imageCache.size).toBe(0)
    })
  })

  describe('렌더러 상태 정보', () => {
    beforeEach(() => {
      renderer = new GameRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('getInfo 메서드 정상 동작', () => {
      const info = renderer.getInfo()
      
      expect(info).toHaveProperty('isInitialized')
      expect(info).toHaveProperty('isRendering')
      expect(info).toHaveProperty('context')
      expect(info).toHaveProperty('size')
      expect(info).toHaveProperty('pixelRatio')
      expect(info.isInitialized).toBe(true)
      expect(info.context).toBe('Canvas 2D')
      expect(info.size).toEqual({ width: 800, height: 600 })
    })
  })
})
