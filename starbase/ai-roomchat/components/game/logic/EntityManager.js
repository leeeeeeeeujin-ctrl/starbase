/**
 * 🎭 EntityManager - 엔티티 생성/제거/업데이트
 * 
 * 게임 내 모든 엔티티(캐릭터, 적, 아이템 등)를 관리합니다.
 * 순수 함수 기반으로 불변성을 유지하며 효율적인 업데이트를 제공합니다.
 * 
 * @module EntityManager
 * @version 1.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

/**
 * 엔티티 타입 상수
 */
export const ENTITY_TYPES = {
  PLAYER: 'player',
  NPC: 'npc',
  ENEMY: 'enemy',
  ITEM: 'item',
  PROJECTILE: 'projectile',
  OBSTACLE: 'obstacle',
  EFFECT: 'effect',
};

/**
 * 엔티티 상태 상수
 */
export const ENTITY_STATES = {
  IDLE: 'idle',
  MOVING: 'moving',
  ATTACKING: 'attacking',
  DAMAGED: 'damaged',
  DEAD: 'dead',
  DISABLED: 'disabled',
};

/**
 * 엔티티 생성
 * 
 * @param {Object} options - 엔티티 옵션
 * @returns {Object} 엔티티 객체
 */
export function createEntity(options = {}) {
  const now = Date.now();
  
  return {
    id: options.id || `entity_${now}_${Math.random().toString(36).substr(2, 9)}`,
    type: options.type || ENTITY_TYPES.NPC,
    name: options.name || 'Unnamed Entity',
    
    // 위치 및 물리
    position: { x: options.x || 0, y: options.y || 0 },
    velocity: { x: 0, y: 0 },
    rotation: options.rotation || 0,
    
    // 시각적 속성
    sprite: options.sprite || null,
    width: options.width || 32,
    height: options.height || 32,
    scale: options.scale || 1,
    opacity: options.opacity || 1,
    visible: options.visible !== false,
    
    // 상태
    state: options.state || ENTITY_STATES.IDLE,
    health: options.health || 100,
    maxHealth: options.maxHealth || 100,
    mana: options.mana || 0,
    maxMana: options.maxMana || 0,
    
    // 속성
    attributes: {
      strength: options.strength || 10,
      defense: options.defense || 10,
      speed: options.speed || 5,
      intelligence: options.intelligence || 10,
      luck: options.luck || 5,
      ...options.attributes,
    },
    
    // 상태 효과
    statusEffects: [],
    
    // 인벤토리
    inventory: options.inventory || [],
    
    // AI 및 동작
    behavior: options.behavior || null,
    target: options.target || null,
    
    // 메타데이터
    tags: options.tags || [],
    data: options.data || {},
    
    // 타임스탬프
    createdAt: now,
    updatedAt: now,
    
    // 물리 설정
    physics: {
      enabled: options.physics !== false,
      mass: options.mass || 1,
      friction: options.friction || 0.95,
      elasticity: options.elasticity || 0.8,
      isStatic: options.isStatic || false,
    },
    
    // 충돌 설정
    collision: {
      enabled: options.collision !== false,
      layer: options.collisionLayer || 'default',
      mask: options.collisionMask || ['default'],
      radius: options.collisionRadius || Math.max(options.width || 32, options.height || 32) / 2,
    },
  };
}

/**
 * 엔티티 컨테이너 생성
 * 
 * @returns {Object} 엔티티 컨테이너
 */
export function createEntityContainer() {
  return {
    entities: new Map(),
    entitiesByType: new Map(),
    entitiesByTag: new Map(),
    nextEntityId: 1,
  };
}

/**
 * 엔티티 추가
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {Object} entity - 엔티티 객체
 * @returns {Object} 업데이트된 컨테이너
 */
export function addEntity(container, entity) {
  if (!entity || !entity.id) {
    console.error('[EntityManager] 유효하지 않은 엔티티:', entity);
    return container;
  }

  // 불변성 유지: 새 Map 생성
  const newEntities = new Map(container.entities);
  newEntities.set(entity.id, entity);

  // 타입별 인덱스 업데이트
  const newEntitiesByType = new Map(container.entitiesByType);
  if (!newEntitiesByType.has(entity.type)) {
    newEntitiesByType.set(entity.type, new Set());
  }
  const typeSet = new Set(newEntitiesByType.get(entity.type));
  typeSet.add(entity.id);
  newEntitiesByType.set(entity.type, typeSet);

  // 태그별 인덱스 업데이트
  const newEntitiesByTag = new Map(container.entitiesByTag);
  entity.tags.forEach(tag => {
    if (!newEntitiesByTag.has(tag)) {
      newEntitiesByTag.set(tag, new Set());
    }
    const tagSet = new Set(newEntitiesByTag.get(tag));
    tagSet.add(entity.id);
    newEntitiesByTag.set(tag, tagSet);
  });

  return {
    ...container,
    entities: newEntities,
    entitiesByType: newEntitiesByType,
    entitiesByTag: newEntitiesByTag,
  };
}

/**
 * 엔티티 제거
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} entityId - 엔티티 ID
 * @returns {Object} 업데이트된 컨테이너
 */
export function removeEntity(container, entityId) {
  const entity = container.entities.get(entityId);
  if (!entity) {
    return container;
  }

  // 불변성 유지: 새 Map 생성
  const newEntities = new Map(container.entities);
  newEntities.delete(entityId);

  // 타입별 인덱스에서 제거
  const newEntitiesByType = new Map(container.entitiesByType);
  if (newEntitiesByType.has(entity.type)) {
    const typeSet = new Set(newEntitiesByType.get(entity.type));
    typeSet.delete(entityId);
    if (typeSet.size === 0) {
      newEntitiesByType.delete(entity.type);
    } else {
      newEntitiesByType.set(entity.type, typeSet);
    }
  }

  // 태그별 인덱스에서 제거
  const newEntitiesByTag = new Map(container.entitiesByTag);
  entity.tags.forEach(tag => {
    if (newEntitiesByTag.has(tag)) {
      const tagSet = new Set(newEntitiesByTag.get(tag));
      tagSet.delete(entityId);
      if (tagSet.size === 0) {
        newEntitiesByTag.delete(tag);
      } else {
        newEntitiesByTag.set(tag, tagSet);
      }
    }
  });

  return {
    ...container,
    entities: newEntities,
    entitiesByType: newEntitiesByType,
    entitiesByTag: newEntitiesByTag,
  };
}

/**
 * 엔티티 업데이트
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} entityId - 엔티티 ID
 * @param {Object} updates - 업데이트 내용
 * @returns {Object} 업데이트된 컨테이너
 */
export function updateEntity(container, entityId, updates) {
  const entity = container.entities.get(entityId);
  if (!entity) {
    return container;
  }

  const updatedEntity = {
    ...entity,
    ...updates,
    updatedAt: Date.now(),
  };

  const newEntities = new Map(container.entities);
  newEntities.set(entityId, updatedEntity);

  return {
    ...container,
    entities: newEntities,
  };
}

/**
 * 엔티티 찾기
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} entityId - 엔티티 ID
 * @returns {Object|null} 엔티티 또는 null
 */
export function getEntity(container, entityId) {
  return container.entities.get(entityId) || null;
}

/**
 * 모든 엔티티 가져오기
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @returns {Array} 엔티티 배열
 */
export function getAllEntities(container) {
  return Array.from(container.entities.values());
}

/**
 * 타입별 엔티티 가져오기
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} type - 엔티티 타입
 * @returns {Array} 엔티티 배열
 */
export function getEntitiesByType(container, type) {
  const entityIds = container.entitiesByType.get(type);
  if (!entityIds) {
    return [];
  }

  return Array.from(entityIds)
    .map(id => container.entities.get(id))
    .filter(entity => entity != null);
}

/**
 * 태그별 엔티티 가져오기
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} tag - 태그
 * @returns {Array} 엔티티 배열
 */
export function getEntitiesByTag(container, tag) {
  const entityIds = container.entitiesByTag.get(tag);
  if (!entityIds) {
    return [];
  }

  return Array.from(entityIds)
    .map(id => container.entities.get(id))
    .filter(entity => entity != null);
}

/**
 * 엔티티 필터링
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {Function} predicate - 필터 함수
 * @returns {Array} 필터링된 엔티티 배열
 */
export function filterEntities(container, predicate) {
  return getAllEntities(container).filter(predicate);
}

/**
 * 가장 가까운 엔티티 찾기
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {Object} position - 기준 위치 { x, y }
 * @param {Object} options - 옵션 { type, tag, maxDistance }
 * @returns {Object|null} 가장 가까운 엔티티 또는 null
 */
export function findNearestEntity(container, position, options = {}) {
  let entities = getAllEntities(container);

  // 타입 필터
  if (options.type) {
    entities = getEntitiesByType(container, options.type);
  }

  // 태그 필터
  if (options.tag) {
    entities = getEntitiesByTag(container, options.tag);
  }

  // 추가 필터
  if (options.filter) {
    entities = entities.filter(options.filter);
  }

  let nearest = null;
  let nearestDistance = options.maxDistance || Infinity;

  entities.forEach(entity => {
    const dx = entity.position.x - position.x;
    const dy = entity.position.y - position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = entity;
    }
  });

  return nearest;
}

/**
 * 범위 내 엔티티 찾기
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {Object} position - 중심 위치 { x, y }
 * @param {number} radius - 반경
 * @param {Object} options - 옵션 { type, tag, filter }
 * @returns {Array} 범위 내 엔티티 배열
 */
export function findEntitiesInRange(container, position, radius, options = {}) {
  let entities = getAllEntities(container);

  // 타입 필터
  if (options.type) {
    entities = getEntitiesByType(container, options.type);
  }

  // 태그 필터
  if (options.tag) {
    entities = getEntitiesByTag(container, options.tag);
  }

  // 추가 필터
  if (options.filter) {
    entities = entities.filter(options.filter);
  }

  return entities.filter(entity => {
    const dx = entity.position.x - position.x;
    const dy = entity.position.y - position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= radius;
  });
}

/**
 * 데미지 적용
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} entityId - 엔티티 ID
 * @param {number} damage - 데미지 양
 * @param {Object} options - 옵션 { ignoreDefense, damageType }
 * @returns {Object} 업데이트된 컨테이너와 결과
 */
export function applyDamage(container, entityId, damage, options = {}) {
  const entity = getEntity(container, entityId);
  if (!entity) {
    return { container, result: { success: false, message: '엔티티를 찾을 수 없습니다.' } };
  }

  // 방어력 계산
  let actualDamage = damage;
  if (!options.ignoreDefense) {
    const defense = entity.attributes.defense || 0;
    actualDamage = Math.max(1, damage - defense * 0.5);
  }

  // 체력 감소
  const newHealth = Math.max(0, entity.health - actualDamage);
  const isDead = newHealth === 0;

  // 상태 업데이트
  const newState = isDead ? ENTITY_STATES.DEAD : ENTITY_STATES.DAMAGED;

  const updatedContainer = updateEntity(container, entityId, {
    health: newHealth,
    state: newState,
  });

  return {
    container: updatedContainer,
    result: {
      success: true,
      damage: actualDamage,
      isDead,
      remainingHealth: newHealth,
    },
  };
}

/**
 * 힐링 적용
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} entityId - 엔티티 ID
 * @param {number} amount - 힐링 양
 * @returns {Object} 업데이트된 컨테이너와 결과
 */
export function applyHealing(container, entityId, amount) {
  const entity = getEntity(container, entityId);
  if (!entity) {
    return { container, result: { success: false, message: '엔티티를 찾을 수 없습니다.' } };
  }

  const newHealth = Math.min(entity.maxHealth, entity.health + amount);
  const actualHealing = newHealth - entity.health;

  const updatedContainer = updateEntity(container, entityId, {
    health: newHealth,
  });

  return {
    container: updatedContainer,
    result: {
      success: true,
      healing: actualHealing,
      health: newHealth,
    },
  };
}

/**
 * 상태 효과 추가
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} entityId - 엔티티 ID
 * @param {Object} statusEffect - 상태 효과 { type, duration, value }
 * @returns {Object} 업데이트된 컨테이너
 */
export function addStatusEffect(container, entityId, statusEffect) {
  const entity = getEntity(container, entityId);
  if (!entity) {
    return container;
  }

  const effect = {
    ...statusEffect,
    id: `effect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    appliedAt: Date.now(),
    expiresAt: Date.now() + (statusEffect.duration || 0),
  };

  const newStatusEffects = [...entity.statusEffects, effect];

  return updateEntity(container, entityId, {
    statusEffects: newStatusEffects,
  });
}

/**
 * 상태 효과 제거
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} entityId - 엔티티 ID
 * @param {string} effectId - 상태 효과 ID
 * @returns {Object} 업데이트된 컨테이너
 */
export function removeStatusEffect(container, entityId, effectId) {
  const entity = getEntity(container, entityId);
  if (!entity) {
    return container;
  }

  const newStatusEffects = entity.statusEffects.filter(e => e.id !== effectId);

  return updateEntity(container, entityId, {
    statusEffects: newStatusEffects,
  });
}

/**
 * 만료된 상태 효과 정리
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @param {string} entityId - 엔티티 ID
 * @returns {Object} 업데이트된 컨테이너
 */
export function cleanupExpiredEffects(container, entityId) {
  const entity = getEntity(container, entityId);
  if (!entity) {
    return container;
  }

  const now = Date.now();
  const newStatusEffects = entity.statusEffects.filter(e => e.expiresAt > now);

  if (newStatusEffects.length === entity.statusEffects.length) {
    return container;
  }

  return updateEntity(container, entityId, {
    statusEffects: newStatusEffects,
  });
}

/**
 * 모든 엔티티의 만료된 상태 효과 정리
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @returns {Object} 업데이트된 컨테이너
 */
export function cleanupAllExpiredEffects(container) {
  let updatedContainer = container;

  getAllEntities(container).forEach(entity => {
    updatedContainer = cleanupExpiredEffects(updatedContainer, entity.id);
  });

  return updatedContainer;
}

/**
 * 엔티티 수 가져오기
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @returns {number} 엔티티 수
 */
export function getEntityCount(container) {
  return container.entities.size;
}

/**
 * 모든 엔티티 제거
 * 
 * @param {Object} container - 엔티티 컨테이너
 * @returns {Object} 빈 컨테이너
 */
export function clearAllEntities(container) {
  return createEntityContainer();
}

export default {
  ENTITY_TYPES,
  ENTITY_STATES,
  createEntity,
  createEntityContainer,
  addEntity,
  removeEntity,
  updateEntity,
  getEntity,
  getAllEntities,
  getEntitiesByType,
  getEntitiesByTag,
  filterEntities,
  findNearestEntity,
  findEntitiesInRange,
  applyDamage,
  applyHealing,
  addStatusEffect,
  removeStatusEffect,
  cleanupExpiredEffects,
  cleanupAllExpiredEffects,
  getEntityCount,
  clearAllEntities,
};
