/**
 * 🎯 PhysicsEngine - 충돌 감지, 이동, 중력 등 물리 연산
 * 
 * 순수 함수 기반 물리 시스템으로 게임 엔티티의 물리적 상호작용을 처리합니다.
 * 성능 최적화를 위한 공간 분할 및 충돌 감지 알고리즘을 사용합니다.
 * 
 * @module PhysicsEngine
 * @version 1.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

/**
 * 기본 물리 상수
 */
export const PHYSICS_CONSTANTS = {
  GRAVITY: 9.8, // m/s²
  AIR_RESISTANCE: 0.98, // 공기 저항 계수
  FRICTION: 0.95, // 마찰 계수
  MAX_VELOCITY: 500, // 최대 속도
  MIN_VELOCITY: 0.01, // 최소 속도 (이하는 0으로 처리)
  COLLISION_ELASTICITY: 0.8, // 충돌 탄성 계수
};

/**
 * 벡터 생성
 * 
 * @param {number} x - X 좌표
 * @param {number} y - Y 좌표
 * @returns {Object} 벡터 객체
 */
export function createVector(x = 0, y = 0) {
  return { x, y };
}

/**
 * 벡터 더하기
 * 
 * @param {Object} v1 - 벡터 1
 * @param {Object} v2 - 벡터 2
 * @returns {Object} 결과 벡터
 */
export function addVector(v1, v2) {
  return createVector(v1.x + v2.x, v1.y + v2.y);
}

/**
 * 벡터 빼기
 * 
 * @param {Object} v1 - 벡터 1
 * @param {Object} v2 - 벡터 2
 * @returns {Object} 결과 벡터
 */
export function subtractVector(v1, v2) {
  return createVector(v1.x - v2.x, v1.y - v2.y);
}

/**
 * 벡터 스칼라 곱
 * 
 * @param {Object} v - 벡터
 * @param {number} scalar - 스칼라 값
 * @returns {Object} 결과 벡터
 */
export function multiplyVector(v, scalar) {
  return createVector(v.x * scalar, v.y * scalar);
}

/**
 * 벡터 크기 (길이)
 * 
 * @param {Object} v - 벡터
 * @returns {number} 벡터의 크기
 */
export function vectorMagnitude(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * 벡터 정규화
 * 
 * @param {Object} v - 벡터
 * @returns {Object} 정규화된 벡터
 */
export function normalizeVector(v) {
  const magnitude = vectorMagnitude(v);
  if (magnitude === 0) {
    return createVector(0, 0);
  }
  return createVector(v.x / magnitude, v.y / magnitude);
}

/**
 * 두 점 사이의 거리
 * 
 * @param {Object} p1 - 점 1
 * @param {Object} p2 - 점 2
 * @returns {number} 거리
 */
export function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 물리 객체 생성
 * 
 * @param {Object} options - 물리 객체 옵션
 * @returns {Object} 물리 객체
 */
export function createPhysicsObject(options = {}) {
  return {
    position: createVector(options.x || 0, options.y || 0),
    velocity: createVector(options.vx || 0, options.vy || 0),
    acceleration: createVector(options.ax || 0, options.ay || 0),
    mass: options.mass || 1,
    radius: options.radius || 10,
    width: options.width || 20,
    height: options.height || 20,
    type: options.type || 'rectangle', // rectangle, circle
    isStatic: options.isStatic || false,
    elasticity: options.elasticity || PHYSICS_CONSTANTS.COLLISION_ELASTICITY,
    friction: options.friction || PHYSICS_CONSTANTS.FRICTION,
  };
}

/**
 * 중력 적용
 * 
 * @param {Object} physicsObject - 물리 객체
 * @param {number} gravity - 중력 값 (기본: 9.8)
 * @param {number} deltaTime - 시간 간격 (초)
 * @returns {Object} 업데이트된 물리 객체
 */
export function applyGravity(physicsObject, gravity = PHYSICS_CONSTANTS.GRAVITY, deltaTime = 1/60) {
  if (physicsObject.isStatic) {
    return physicsObject;
  }

  const gravityAcceleration = createVector(0, gravity * deltaTime);
  
  return {
    ...physicsObject,
    acceleration: addVector(physicsObject.acceleration, gravityAcceleration),
  };
}

/**
 * 속도 업데이트
 * 
 * @param {Object} physicsObject - 물리 객체
 * @param {number} deltaTime - 시간 간격 (초)
 * @returns {Object} 업데이트된 물리 객체
 */
export function updateVelocity(physicsObject, deltaTime = 1/60) {
  if (physicsObject.isStatic) {
    return physicsObject;
  }

  // 가속도를 속도에 적용
  let newVelocity = addVector(
    physicsObject.velocity,
    multiplyVector(physicsObject.acceleration, deltaTime)
  );

  // 공기 저항 적용
  newVelocity = multiplyVector(newVelocity, PHYSICS_CONSTANTS.AIR_RESISTANCE);

  // 최대/최소 속도 제한
  const magnitude = vectorMagnitude(newVelocity);
  if (magnitude > PHYSICS_CONSTANTS.MAX_VELOCITY) {
    newVelocity = multiplyVector(
      normalizeVector(newVelocity),
      PHYSICS_CONSTANTS.MAX_VELOCITY
    );
  } else if (magnitude < PHYSICS_CONSTANTS.MIN_VELOCITY) {
    newVelocity = createVector(0, 0);
  }

  return {
    ...physicsObject,
    velocity: newVelocity,
    acceleration: createVector(0, 0), // 가속도 초기화
  };
}

/**
 * 위치 업데이트
 * 
 * @param {Object} physicsObject - 물리 객체
 * @param {number} deltaTime - 시간 간격 (초)
 * @returns {Object} 업데이트된 물리 객체
 */
export function updatePosition(physicsObject, deltaTime = 1/60) {
  if (physicsObject.isStatic) {
    return physicsObject;
  }

  const newPosition = addVector(
    physicsObject.position,
    multiplyVector(physicsObject.velocity, deltaTime)
  );

  return {
    ...physicsObject,
    position: newPosition,
  };
}

/**
 * 물리 업데이트 (중력, 속도, 위치)
 * 
 * @param {Object} physicsObject - 물리 객체
 * @param {number} deltaTime - 시간 간격 (초)
 * @param {Object} options - 추가 옵션
 * @returns {Object} 업데이트된 물리 객체
 */
export function updatePhysics(physicsObject, deltaTime = 1/60, options = {}) {
  let updated = physicsObject;

  // 중력 적용 (옵션으로 비활성화 가능)
  if (options.applyGravity !== false) {
    updated = applyGravity(updated, options.gravity, deltaTime);
  }

  // 속도 업데이트
  updated = updateVelocity(updated, deltaTime);

  // 위치 업데이트
  updated = updatePosition(updated, deltaTime);

  return updated;
}

/**
 * AABB (Axis-Aligned Bounding Box) 충돌 감지
 * 
 * @param {Object} obj1 - 물리 객체 1
 * @param {Object} obj2 - 물리 객체 2
 * @returns {boolean} 충돌 여부
 */
export function checkAABBCollision(obj1, obj2) {
  const halfWidth1 = obj1.width / 2;
  const halfHeight1 = obj1.height / 2;
  const halfWidth2 = obj2.width / 2;
  const halfHeight2 = obj2.height / 2;

  return (
    Math.abs(obj1.position.x - obj2.position.x) < halfWidth1 + halfWidth2 &&
    Math.abs(obj1.position.y - obj2.position.y) < halfHeight1 + halfHeight2
  );
}

/**
 * 원형 충돌 감지
 * 
 * @param {Object} obj1 - 물리 객체 1 (원형)
 * @param {Object} obj2 - 물리 객체 2 (원형)
 * @returns {boolean} 충돌 여부
 */
export function checkCircleCollision(obj1, obj2) {
  const dist = distance(obj1.position, obj2.position);
  return dist < obj1.radius + obj2.radius;
}

/**
 * 충돌 감지 (타입 자동 판별)
 * 
 * @param {Object} obj1 - 물리 객체 1
 * @param {Object} obj2 - 물리 객체 2
 * @returns {boolean} 충돌 여부
 */
export function checkCollision(obj1, obj2) {
  if (obj1.type === 'circle' && obj2.type === 'circle') {
    return checkCircleCollision(obj1, obj2);
  }
  
  // 기본은 AABB (사각형 또는 혼합 타입)
  return checkAABBCollision(obj1, obj2);
}

/**
 * 충돌 응답 (탄성 충돌)
 * 
 * @param {Object} obj1 - 물리 객체 1
 * @param {Object} obj2 - 물리 객체 2
 * @returns {Object} 업데이트된 물리 객체들 { obj1, obj2 }
 */
export function resolveCollision(obj1, obj2) {
  // 정적 객체는 충돌 응답 없음
  if (obj1.isStatic && obj2.isStatic) {
    return { obj1, obj2 };
  }

  // 충돌 벡터 계산
  const collisionVector = subtractVector(obj2.position, obj1.position);
  const collisionNormal = normalizeVector(collisionVector);

  // 상대 속도
  const relativeVelocity = subtractVector(obj1.velocity, obj2.velocity);
  
  // 충돌 속도 (법선 방향)
  const velocityAlongNormal = 
    relativeVelocity.x * collisionNormal.x + 
    relativeVelocity.y * collisionNormal.y;

  // 이미 분리 중이면 충돌 응답 불필요
  if (velocityAlongNormal > 0) {
    return { obj1, obj2 };
  }

  // 탄성 계수 (평균)
  const elasticity = (obj1.elasticity + obj2.elasticity) / 2;

  // 충격량 계산
  const impulse = -(1 + elasticity) * velocityAlongNormal / (1/obj1.mass + 1/obj2.mass);

  // 속도 업데이트
  const impulseVector = multiplyVector(collisionNormal, impulse);

  let newObj1 = obj1;
  let newObj2 = obj2;

  if (!obj1.isStatic) {
    newObj1 = {
      ...obj1,
      velocity: addVector(obj1.velocity, multiplyVector(impulseVector, 1/obj1.mass)),
    };
  }

  if (!obj2.isStatic) {
    newObj2 = {
      ...obj2,
      velocity: subtractVector(obj2.velocity, multiplyVector(impulseVector, 1/obj2.mass)),
    };
  }

  // 위치 보정 (겹침 해소)
  const penetrationDepth = (obj1.radius + obj2.radius) - vectorMagnitude(collisionVector);
  if (penetrationDepth > 0) {
    const correction = multiplyVector(collisionNormal, penetrationDepth / 2);
    
    if (!obj1.isStatic) {
      newObj1 = {
        ...newObj1,
        position: subtractVector(newObj1.position, correction),
      };
    }
    
    if (!obj2.isStatic) {
      newObj2 = {
        ...newObj2,
        position: addVector(newObj2.position, correction),
      };
    }
  }

  return { obj1: newObj1, obj2: newObj2 };
}

/**
 * 경계 충돌 처리 (화면 가장자리 등)
 * 
 * @param {Object} physicsObject - 물리 객체
 * @param {Object} bounds - 경계 { minX, maxX, minY, maxY }
 * @returns {Object} 업데이트된 물리 객체
 */
export function constrainToBounds(physicsObject, bounds) {
  let updated = { ...physicsObject };
  let velocity = { ...physicsObject.velocity };

  // X 축 경계
  if (updated.position.x - updated.width/2 < bounds.minX) {
    updated.position.x = bounds.minX + updated.width/2;
    velocity.x = Math.abs(velocity.x) * updated.elasticity;
  } else if (updated.position.x + updated.width/2 > bounds.maxX) {
    updated.position.x = bounds.maxX - updated.width/2;
    velocity.x = -Math.abs(velocity.x) * updated.elasticity;
  }

  // Y 축 경계
  if (updated.position.y - updated.height/2 < bounds.minY) {
    updated.position.y = bounds.minY + updated.height/2;
    velocity.y = Math.abs(velocity.y) * updated.elasticity;
  } else if (updated.position.y + updated.height/2 > bounds.maxY) {
    updated.position.y = bounds.maxY - updated.height/2;
    velocity.y = -Math.abs(velocity.y) * updated.elasticity;
  }

  return {
    ...updated,
    velocity,
  };
}

/**
 * 힘 적용
 * 
 * @param {Object} physicsObject - 물리 객체
 * @param {Object} force - 힘 벡터 { x, y }
 * @returns {Object} 업데이트된 물리 객체
 */
export function applyForce(physicsObject, force) {
  if (physicsObject.isStatic) {
    return physicsObject;
  }

  // F = ma => a = F/m
  const acceleration = multiplyVector(force, 1 / physicsObject.mass);

  return {
    ...physicsObject,
    acceleration: addVector(physicsObject.acceleration, acceleration),
  };
}

/**
 * 공간 분할 (성능 최적화) - 간단한 그리드 기반
 * 
 * @param {Array} objects - 물리 객체 배열
 * @param {number} cellSize - 셀 크기
 * @returns {Map} 그리드 맵
 */
export function createSpatialGrid(objects, cellSize = 100) {
  const grid = new Map();

  objects.forEach((obj, index) => {
    const cellX = Math.floor(obj.position.x / cellSize);
    const cellY = Math.floor(obj.position.y / cellSize);
    const cellKey = `${cellX},${cellY}`;

    if (!grid.has(cellKey)) {
      grid.set(cellKey, []);
    }
    grid.get(cellKey).push({ obj, index });
  });

  return grid;
}

/**
 * 충돌 감지 최적화 (공간 분할 사용)
 * 
 * @param {Array} objects - 물리 객체 배열
 * @param {number} cellSize - 셀 크기
 * @returns {Array} 충돌 쌍 배열 [{ i, j, obj1, obj2 }]
 */
export function detectCollisionsOptimized(objects, cellSize = 100) {
  const collisions = [];
  const grid = createSpatialGrid(objects, cellSize);

  // 각 셀 내에서 충돌 검사
  grid.forEach((cellObjects) => {
    for (let i = 0; i < cellObjects.length; i++) {
      for (let j = i + 1; j < cellObjects.length; j++) {
        const { obj: obj1, index: idx1 } = cellObjects[i];
        const { obj: obj2, index: idx2 } = cellObjects[j];

        if (checkCollision(obj1, obj2)) {
          collisions.push({ i: idx1, j: idx2, obj1, obj2 });
        }
      }
    }
  });

  return collisions;
}

/**
 * 레이캐스트 (광선 투사) - 간단한 버전
 * 
 * @param {Object} origin - 시작점
 * @param {Object} direction - 방향 벡터
 * @param {Array} objects - 물리 객체 배열
 * @param {number} maxDistance - 최대 거리
 * @returns {Object|null} 충돌 정보 또는 null
 */
export function raycast(origin, direction, objects, maxDistance = Infinity) {
  const normalizedDir = normalizeVector(direction);
  let closestHit = null;
  let closestDistance = maxDistance;

  objects.forEach(obj => {
    // 간단한 원형 충돌만 지원
    if (obj.type !== 'circle') return;

    const toObject = subtractVector(obj.position, origin);
    const projection = toObject.x * normalizedDir.x + toObject.y * normalizedDir.y;

    if (projection < 0) return; // 뒤쪽 방향

    const closestPoint = addVector(origin, multiplyVector(normalizedDir, projection));
    const distanceToCenter = distance(closestPoint, obj.position);

    if (distanceToCenter <= obj.radius && projection < closestDistance) {
      closestDistance = projection;
      closestHit = {
        object: obj,
        distance: projection,
        point: closestPoint,
      };
    }
  });

  return closestHit;
}

export default {
  PHYSICS_CONSTANTS,
  createVector,
  addVector,
  subtractVector,
  multiplyVector,
  vectorMagnitude,
  normalizeVector,
  distance,
  createPhysicsObject,
  applyGravity,
  updateVelocity,
  updatePosition,
  updatePhysics,
  checkAABBCollision,
  checkCircleCollision,
  checkCollision,
  resolveCollision,
  constrainToBounds,
  applyForce,
  createSpatialGrid,
  detectCollisionsOptimized,
  raycast,
};
