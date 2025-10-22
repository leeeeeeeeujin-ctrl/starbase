/**
 * PhysicsEngine - 물리 엔진 모듈
 * 충돌 감지, 이동, 중력 등 물리 계산 처리
 */
export default class PhysicsEngine {
  constructor(options = {}) {
    this.options = {
      gravity: 9.8,
      enableCollisions: true,
      worldWidth: 800,
      worldHeight: 600,
      ...options,
    }
    this.entities = []
    this.isInitialized = false
  }

  /**
   * 물리 엔진 초기화
   */
  async initialize() {
    try {
      this.entities = []
      this.isInitialized = true
      return true
    } catch (error) {
      console.error('[PhysicsEngine] 초기화 실패:', error)
      return false
    }
  }

  /**
   * 물리 업데이트
   */
  update(deltaTime, entities) {
    if (!this.isInitialized) return

    this.entities = entities || this.entities

    // 각 엔티티의 물리 업데이트
    this.entities.forEach(entity => {
      if (entity.physics) {
        this.updateEntityPhysics(entity, deltaTime)
      }
    })

    // 충돌 감지
    if (this.options.enableCollisions) {
      this.detectCollisions()
    }
  }

  /**
   * 엔티티 물리 업데이트
   */
  updateEntityPhysics(entity, deltaTime) {
    const physics = entity.physics

    // 중력 적용
    if (physics.useGravity) {
      physics.vy += this.options.gravity * deltaTime
    }

    // 속도 적용
    entity.x += physics.vx * deltaTime
    entity.y += physics.vy * deltaTime

    // 마찰 적용
    if (physics.friction) {
      physics.vx *= (1 - physics.friction * deltaTime)
      physics.vy *= (1 - physics.friction * deltaTime)
    }

    // 경계 체크
    this.checkBoundaries(entity)
  }

  /**
   * 경계 체크
   */
  checkBoundaries(entity) {
    const { worldWidth, worldHeight } = this.options

    // 좌우 경계
    if (entity.x < 0) {
      entity.x = 0
      entity.physics.vx = 0
    } else if (entity.x + (entity.width || 0) > worldWidth) {
      entity.x = worldWidth - (entity.width || 0)
      entity.physics.vx = 0
    }

    // 상하 경계
    if (entity.y < 0) {
      entity.y = 0
      entity.physics.vy = 0
    } else if (entity.y + (entity.height || 0) > worldHeight) {
      entity.y = worldHeight - (entity.height || 0)
      entity.physics.vy = 0
    }
  }

  /**
   * 충돌 감지
   */
  detectCollisions() {
    const collisions = []

    for (let i = 0; i < this.entities.length; i++) {
      for (let j = i + 1; j < this.entities.length; j++) {
        const entityA = this.entities[i]
        const entityB = this.entities[j]

        if (this.checkCollision(entityA, entityB)) {
          collisions.push({ entityA, entityB })
          this.resolveCollision(entityA, entityB)
        }
      }
    }

    return collisions
  }

  /**
   * AABB 충돌 체크
   */
  checkCollision(entityA, entityB) {
    if (!entityA.physics || !entityB.physics) return false

    const aLeft = entityA.x
    const aRight = entityA.x + (entityA.width || 0)
    const aTop = entityA.y
    const aBottom = entityA.y + (entityA.height || 0)

    const bLeft = entityB.x
    const bRight = entityB.x + (entityB.width || 0)
    const bTop = entityB.y
    const bBottom = entityB.y + (entityB.height || 0)

    return aLeft < bRight &&
           aRight > bLeft &&
           aTop < bBottom &&
           aBottom > bTop
  }

  /**
   * 충돌 해결
   */
  resolveCollision(entityA, entityB) {
    // 간단한 탄성 충돌
    const tempVx = entityA.physics.vx
    const tempVy = entityA.physics.vy

    entityA.physics.vx = entityB.physics.vx
    entityA.physics.vy = entityB.physics.vy

    entityB.physics.vx = tempVx
    entityB.physics.vy = tempVy

    // 충돌 이벤트 발생
    if (entityA.onCollision) {
      entityA.onCollision(entityB)
    }
    if (entityB.onCollision) {
      entityB.onCollision(entityA)
    }
  }

  /**
   * 엔티티에 힘 적용
   */
  applyForce(entity, fx, fy) {
    if (!entity.physics) return

    entity.physics.vx += fx
    entity.physics.vy += fy
  }

  /**
   * 엔티티에 충격 적용
   */
  applyImpulse(entity, impulseX, impulseY) {
    if (!entity.physics) return

    const mass = entity.physics.mass || 1
    entity.physics.vx += impulseX / mass
    entity.physics.vy += impulseY / mass
  }

  /**
   * 레이캐스트
   */
  raycast(startX, startY, endX, endY) {
    const hits = []

    this.entities.forEach(entity => {
      if (this.checkLineIntersection(startX, startY, endX, endY, entity)) {
        hits.push(entity)
      }
    })

    return hits
  }

  /**
   * 선-사각형 교차 체크
   */
  checkLineIntersection(x1, y1, x2, y2, entity) {
    // 간단한 구현 - 더 정확한 알고리즘 필요
    const entityCenterX = entity.x + (entity.width || 0) / 2
    const entityCenterY = entity.y + (entity.height || 0) / 2

    const dist = this.pointToLineDistance(entityCenterX, entityCenterY, x1, y1, x2, y2)
    const entityRadius = Math.max(entity.width || 0, entity.height || 0) / 2

    return dist < entityRadius
  }

  /**
   * 점과 선 사이의 거리
   */
  pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1
    const B = py - y1
    const C = x2 - x1
    const D = y2 - y1

    const dot = A * C + B * D
    const lenSq = C * C + D * D
    const param = lenSq !== 0 ? dot / lenSq : -1

    let xx, yy

    if (param < 0) {
      xx = x1
      yy = y1
    } else if (param > 1) {
      xx = x2
      yy = y2
    } else {
      xx = x1 + param * C
      yy = y1 + param * D
    }

    const dx = px - xx
    const dy = py - yy

    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    this.entities = []
    this.isInitialized = false
  }
}
