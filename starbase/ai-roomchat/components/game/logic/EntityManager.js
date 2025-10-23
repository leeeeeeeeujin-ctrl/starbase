/**
 * EntityManager - 엔티티 관리 모듈
 * 게임 내 모든 엔티티(캐릭터, NPC, 아이템 등)의 생성, 업데이트, 제거 관리
 */
export default class EntityManager {
  constructor(options = {}) {
    this.options = {
      maxEntities: 1000,
      ...options,
    };
    this.entities = new Map();
    this.entityIdCounter = 0;
    this.isInitialized = false;
  }

  /**
   * 엔티티 관리자 초기화
   */
  async initialize() {
    try {
      this.entities.clear();
      this.entityIdCounter = 0;
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[EntityManager] 초기화 실패:', error);
      return false;
    }
  }

  /**
   * 엔티티 생성
   */
  createEntity(type, properties = {}) {
    if (this.entities.size >= this.options.maxEntities) {
      console.warn('[EntityManager] 최대 엔티티 수 도달');
      return null;
    }

    const id = this.generateEntityId();
    const entity = {
      id,
      type,
      active: true,
      createdAt: Date.now(),
      ...properties,
    };

    this.entities.set(id, entity);
    console.log(`[EntityManager] 엔티티 생성: ${type} (ID: ${id})`);
    return entity;
  }

  /**
   * 엔티티 ID 생성
   */
  generateEntityId() {
    return `entity_${++this.entityIdCounter}_${Date.now()}`;
  }

  /**
   * 엔티티 가져오기
   */
  getEntity(id) {
    return this.entities.get(id);
  }

  /**
   * 모든 엔티티 가져오기
   */
  getAllEntities() {
    return Array.from(this.entities.values());
  }

  /**
   * 타입별 엔티티 가져오기
   */
  getEntitiesByType(type) {
    return Array.from(this.entities.values()).filter(e => e.type === type);
  }

  /**
   * 활성 엔티티만 가져오기
   */
  getActiveEntities() {
    return Array.from(this.entities.values()).filter(e => e.active);
  }

  /**
   * 엔티티 업데이트
   */
  updateEntity(id, updates) {
    const entity = this.entities.get(id);
    if (!entity) {
      console.warn(`[EntityManager] 엔티티를 찾을 수 없음: ${id}`);
      return false;
    }

    Object.assign(entity, updates);
    return true;
  }

  /**
   * 엔티티 제거
   */
  removeEntity(id) {
    const entity = this.entities.get(id);
    if (!entity) {
      return false;
    }

    // 정리 콜백 호출
    if (entity.onDestroy) {
      try {
        entity.onDestroy();
      } catch (error) {
        console.error(`[EntityManager] 엔티티 제거 콜백 오류 (${id}):`, error);
      }
    }

    this.entities.delete(id);
    console.log(`[EntityManager] 엔티티 제거: ${id}`);
    return true;
  }

  /**
   * 조건에 맞는 엔티티 제거
   */
  removeEntitiesWhere(predicate) {
    const toRemove = [];

    this.entities.forEach((entity, id) => {
      if (predicate(entity)) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => this.removeEntity(id));
    return toRemove.length;
  }

  /**
   * 모든 엔티티 업데이트
   */
  updateAll(deltaTime) {
    this.entities.forEach(entity => {
      if (!entity.active) return;

      // 엔티티의 업데이트 함수 호출
      if (entity.update) {
        try {
          entity.update(deltaTime);
        } catch (error) {
          console.error(`[EntityManager] 엔티티 업데이트 오류 (${entity.id}):`, error);
        }
      }
    });
  }

  /**
   * 특정 위치 근처의 엔티티 찾기
   */
  findEntitiesNear(x, y, radius) {
    return Array.from(this.entities.values()).filter(entity => {
      if (!entity.x || !entity.y) return false;

      const dx = entity.x - x;
      const dy = entity.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      return distance <= radius;
    });
  }

  /**
   * 엔티티 간 거리 계산
   */
  getDistance(entityA, entityB) {
    if (!entityA || !entityB) return Infinity;
    if (!entityA.x || !entityA.y || !entityB.x || !entityB.y) return Infinity;

    const dx = entityB.x - entityA.x;
    const dy = entityB.y - entityA.y;

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 가장 가까운 엔티티 찾기
   */
  findNearestEntity(x, y, type = null) {
    let nearest = null;
    let minDistance = Infinity;

    this.entities.forEach(entity => {
      if (type && entity.type !== type) return;
      if (!entity.active) return;
      if (!entity.x || !entity.y) return;

      const dx = entity.x - x;
      const dy = entity.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearest = entity;
      }
    });

    return nearest;
  }

  /**
   * 엔티티 수 가져오기
   */
  getEntityCount(type = null) {
    if (type) {
      return this.getEntitiesByType(type).length;
    }
    return this.entities.size;
  }

  /**
   * 모든 엔티티 제거
   */
  clearAll() {
    this.entities.forEach((entity, id) => {
      if (entity.onDestroy) {
        try {
          entity.onDestroy();
        } catch (error) {
          console.error(`[EntityManager] 엔티티 정리 오류 (${id}):`, error);
        }
      }
    });

    this.entities.clear();
    console.log('[EntityManager] 모든 엔티티 제거');
  }

  /**
   * 엔티티 존재 여부 확인
   */
  hasEntity(id) {
    return this.entities.has(id);
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    this.clearAll();
    this.entityIdCounter = 0;
    this.isInitialized = false;
  }
}
