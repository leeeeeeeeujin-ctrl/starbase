/**
 * @jest-environment jsdom
 */

import EffectsRenderer from '@/components/game/renderers/EffectsRenderer'

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

describe('EffectsRenderer', () => {
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
        new EffectsRenderer({})
      }).toThrow('[EffectsRenderer] Canvas element is required')
    })

    it('정상적으로 초기화됨', () => {
      renderer = new EffectsRenderer({
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
      renderer = new EffectsRenderer({
        canvas,
      })

      expect(renderer.ctx).toBeTruthy()
    })

    it('파티클 풀 초기화', () => {
      renderer = new EffectsRenderer({
        canvas,
        maxParticles: 100,
      })

      expect(renderer.particles.length).toBe(100)
      expect(renderer.activeParticles.length).toBe(0)
    })
  })

  describe('파티클 이미터', () => {
    beforeEach(() => {
      renderer = new EffectsRenderer({
        canvas,
        width: 800,
        height: 600,
        maxParticles: 500,
      })
    })

    it('폭발 효과 생성', () => {
      renderer.emitExplosion(400, 300, {
        count: 20,
        color: '#ff6b35',
        speed: 5,
      })

      expect(renderer.activeParticles.length).toBe(20)
    })

    it('스트림 효과 생성', () => {
      renderer.emitStream(100, 100, Math.PI / 4, {
        color: '#4ade80',
        speed: 3,
      })

      expect(renderer.activeParticles.length).toBe(1)
    })

    it('파티클 최대 개수 제한', () => {
      const smallRenderer = new EffectsRenderer({
        canvas,
        maxParticles: 10,
      })

      smallRenderer.emitExplosion(400, 300, {
        count: 20,
      })

      // Should not exceed maxParticles
      expect(smallRenderer.activeParticles.length).toBeLessThanOrEqual(10)
      
      smallRenderer.cleanup()
    })
  })

  describe('파티클 업데이트', () => {
    beforeEach(() => {
      renderer = new EffectsRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('파티클 수명 감소', () => {
      renderer.emitExplosion(400, 300, { count: 5 })
      
      const initialLife = renderer.activeParticles[0].life
      
      renderer.updateParticles(0.1) // 0.1초 경과
      
      expect(renderer.activeParticles[0].life).toBeLessThan(initialLife)
    })

    it('수명이 다한 파티클 제거', () => {
      renderer.emitExplosion(400, 300, {
        count: 5,
        life: 0.01, // 매우 짧은 수명
      })

      renderer.updateParticles(1) // 1초 경과
      
      // 모든 파티클 제거되어야 함
      expect(renderer.activeParticles.length).toBe(0)
    })

    it('파티클 위치 업데이트', () => {
      renderer.emitExplosion(400, 300, { count: 1 })
      
      const particle = renderer.activeParticles[0]
      const initialX = particle.x
      const initialY = particle.y
      
      renderer.updateParticles(1) // 1초 경과 (중력 영향 증가)
      
      // 위치가 변경되어야 함 (중력으로 인해 Y는 증가)
      // X는 속도에 따라 변경되고, Y는 중력으로 증가
      const xChanged = Math.abs(particle.x - initialX) > 0.01
      const yChanged = Math.abs(particle.y - initialY) > 0.01
      expect(xChanged || yChanged).toBe(true)
    })
  })

  describe('화면 효과', () => {
    beforeEach(() => {
      renderer = new EffectsRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('화면 흔들림 효과', () => {
      renderer.shakeScreen(10, 0.5)
      
      expect(renderer.screenEffects.shake.active).toBe(true)
      expect(renderer.screenEffects.shake.intensity).toBe(10)
    })

    it('화면 페이드 효과', () => {
      renderer.fadeScreen(0.5, 1)
      
      expect(renderer.screenEffects.fade.active).toBe(true)
      expect(renderer.screenEffects.fade.target).toBe(0.5)
    })

    it('화면 플래시 효과', () => {
      renderer.flashScreen('#ffffff', 0.3)
      
      expect(renderer.screenEffects.flash.active).toBe(true)
      expect(renderer.screenEffects.flash.color).toBe('#ffffff')
    })
  })

  describe('애니메이션 루프', () => {
    beforeEach(() => {
      renderer = new EffectsRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('애니메이션 시작', () => {
      renderer.startAnimation()
      
      expect(renderer.isAnimating).toBe(true)
      expect(renderer.animationFrameId).not.toBeNull()
    })

    it('애니메이션 정지', () => {
      renderer.startAnimation()
      renderer.stopAnimation()
      
      expect(renderer.isAnimating).toBe(false)
      expect(renderer.animationFrameId).toBeNull()
    })

    it('중복 시작 방지', () => {
      renderer.startAnimation()
      const firstId = renderer.animationFrameId
      
      renderer.startAnimation()
      
      // ID가 변경되지 않아야 함
      expect(renderer.animationFrameId).toBe(firstId)
    })
  })

  describe('효과 제거', () => {
    beforeEach(() => {
      renderer = new EffectsRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('모든 효과 제거', () => {
      renderer.emitExplosion(400, 300, { count: 10 })
      renderer.shakeScreen(10, 0.5)
      renderer.fadeScreen(0.5, 1)
      
      renderer.clearAllEffects()
      
      expect(renderer.activeParticles.length).toBe(0)
      expect(renderer.screenEffects.shake.active).toBe(false)
      expect(renderer.screenEffects.fade.active).toBe(false)
      expect(renderer.screenEffects.flash.active).toBe(false)
    })
  })

  describe('캔버스 클리어', () => {
    beforeEach(() => {
      renderer = new EffectsRenderer({
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
      renderer = new EffectsRenderer({
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
      renderer = new EffectsRenderer({
        canvas,
        width: 800,
        height: 600,
      })
    })

    it('cleanup 호출 시 모든 리소스 정리', () => {
      renderer.emitExplosion(400, 300, { count: 10 })
      renderer.startAnimation()
      
      renderer.cleanup()
      
      expect(renderer.isInitialized).toBe(false)
      expect(renderer.isAnimating).toBe(false)
      expect(renderer.ctx).toBeNull()
      expect(renderer.canvas).toBeNull()
      expect(renderer.particles.length).toBe(0)
      expect(renderer.activeParticles.length).toBe(0)
    })
  })

  describe('렌더러 상태 정보', () => {
    beforeEach(() => {
      renderer = new EffectsRenderer({
        canvas,
        width: 800,
        height: 600,
        maxParticles: 500,
      })
    })

    it('getInfo 메서드 정상 동작', () => {
      renderer.emitExplosion(400, 300, { count: 10 })
      renderer.shakeScreen(10, 0.5)
      
      const info = renderer.getInfo()
      
      expect(info).toHaveProperty('isInitialized')
      expect(info).toHaveProperty('isAnimating')
      expect(info).toHaveProperty('size')
      expect(info).toHaveProperty('pixelRatio')
      expect(info).toHaveProperty('activeParticles')
      expect(info).toHaveProperty('maxParticles')
      expect(info).toHaveProperty('screenEffects')
      expect(info.isInitialized).toBe(true)
      expect(info.size).toEqual({ width: 800, height: 600 })
      expect(info.activeParticles).toBe(10)
      expect(info.maxParticles).toBe(500)
      expect(info.screenEffects.shake).toBe(true)
    })
  })
})
