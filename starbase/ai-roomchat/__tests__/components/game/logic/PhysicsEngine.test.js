/**
 * Tests for PhysicsEngine module
 */

import * as PhysicsEngine from '../../../../components/game/logic/PhysicsEngine';

describe('PhysicsEngine', () => {
  describe('vector operations', () => {
    it('should create vectors', () => {
      const v = PhysicsEngine.createVector(3, 4);
      expect(v).toEqual({ x: 3, y: 4 });
    });

    it('should add vectors', () => {
      const v1 = PhysicsEngine.createVector(1, 2);
      const v2 = PhysicsEngine.createVector(3, 4);
      const result = PhysicsEngine.addVector(v1, v2);
      
      expect(result).toEqual({ x: 4, y: 6 });
    });

    it('should subtract vectors', () => {
      const v1 = PhysicsEngine.createVector(5, 7);
      const v2 = PhysicsEngine.createVector(2, 3);
      const result = PhysicsEngine.subtractVector(v1, v2);
      
      expect(result).toEqual({ x: 3, y: 4 });
    });

    it('should multiply vector by scalar', () => {
      const v = PhysicsEngine.createVector(2, 3);
      const result = PhysicsEngine.multiplyVector(v, 2);
      
      expect(result).toEqual({ x: 4, y: 6 });
    });

    it('should calculate vector magnitude', () => {
      const v = PhysicsEngine.createVector(3, 4);
      const magnitude = PhysicsEngine.vectorMagnitude(v);
      
      expect(magnitude).toBe(5);
    });

    it('should normalize vectors', () => {
      const v = PhysicsEngine.createVector(3, 4);
      const normalized = PhysicsEngine.normalizeVector(v);
      
      expect(normalized.x).toBeCloseTo(0.6);
      expect(normalized.y).toBeCloseTo(0.8);
    });

    it('should handle zero vector normalization', () => {
      const v = PhysicsEngine.createVector(0, 0);
      const normalized = PhysicsEngine.normalizeVector(v);
      
      expect(normalized).toEqual({ x: 0, y: 0 });
    });
  });

  describe('distance', () => {
    it('should calculate distance between points', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };
      const dist = PhysicsEngine.distance(p1, p2);
      
      expect(dist).toBe(5);
    });
  });

  describe('physics object', () => {
    it('should create physics object with defaults', () => {
      const obj = PhysicsEngine.createPhysicsObject();
      
      expect(obj.position).toEqual({ x: 0, y: 0 });
      expect(obj.velocity).toEqual({ x: 0, y: 0 });
      expect(obj.mass).toBe(1);
      expect(obj.isStatic).toBe(false);
    });

    it('should create physics object with custom values', () => {
      const obj = PhysicsEngine.createPhysicsObject({
        x: 10,
        y: 20,
        vx: 5,
        vy: -5,
        mass: 2,
        radius: 15,
      });
      
      expect(obj.position).toEqual({ x: 10, y: 20 });
      expect(obj.velocity).toEqual({ x: 5, y: -5 });
      expect(obj.mass).toBe(2);
      expect(obj.radius).toBe(15);
    });
  });

  describe('gravity', () => {
    it('should apply gravity to object', () => {
      const obj = PhysicsEngine.createPhysicsObject({ x: 0, y: 0 });
      const withGravity = PhysicsEngine.applyGravity(obj, 9.8, 1/60);
      
      expect(withGravity.acceleration.y).toBeCloseTo(9.8 / 60);
    });

    it('should not apply gravity to static objects', () => {
      const obj = PhysicsEngine.createPhysicsObject({ isStatic: true });
      const withGravity = PhysicsEngine.applyGravity(obj);
      
      expect(withGravity.acceleration).toEqual({ x: 0, y: 0 });
    });
  });

  describe('velocity update', () => {
    it('should update velocity based on acceleration', () => {
      const obj = PhysicsEngine.createPhysicsObject({
        vx: 0,
        vy: 0,
        ax: 10,
        ay: 0,
      });
      obj.acceleration = { x: 10, y: 0 };
      
      const updated = PhysicsEngine.updateVelocity(obj, 1/60);
      
      expect(updated.velocity.x).toBeGreaterThan(0);
      expect(updated.acceleration).toEqual({ x: 0, y: 0 });
    });

    it('should apply air resistance', () => {
      const obj = PhysicsEngine.createPhysicsObject({ vx: 100, vy: 0 });
      const updated = PhysicsEngine.updateVelocity(obj, 1/60);
      
      expect(updated.velocity.x).toBeLessThan(100);
    });

    it('should limit maximum velocity', () => {
      const obj = PhysicsEngine.createPhysicsObject({ vx: 1000, vy: 0 });
      const updated = PhysicsEngine.updateVelocity(obj, 1/60);
      
      expect(PhysicsEngine.vectorMagnitude(updated.velocity)).toBeLessThanOrEqual(
        PhysicsEngine.PHYSICS_CONSTANTS.MAX_VELOCITY
      );
    });
  });

  describe('position update', () => {
    it('should update position based on velocity', () => {
      const obj = PhysicsEngine.createPhysicsObject({
        x: 0,
        y: 0,
        vx: 60,
        vy: 0,
      });
      
      const updated = PhysicsEngine.updatePosition(obj, 1);
      
      expect(updated.position.x).toBeCloseTo(60);
      expect(updated.position.y).toBeCloseTo(0);
    });
  });

  describe('collision detection', () => {
    it('should detect AABB collision', () => {
      const obj1 = PhysicsEngine.createPhysicsObject({
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      });
      const obj2 = PhysicsEngine.createPhysicsObject({
        x: 10,
        y: 0,
        width: 20,
        height: 20,
      });
      
      const colliding = PhysicsEngine.checkAABBCollision(obj1, obj2);
      
      expect(colliding).toBe(true);
    });

    it('should not detect non-colliding AABB', () => {
      const obj1 = PhysicsEngine.createPhysicsObject({
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      });
      const obj2 = PhysicsEngine.createPhysicsObject({
        x: 50,
        y: 0,
        width: 20,
        height: 20,
      });
      
      const colliding = PhysicsEngine.checkAABBCollision(obj1, obj2);
      
      expect(colliding).toBe(false);
    });

    it('should detect circle collision', () => {
      const obj1 = PhysicsEngine.createPhysicsObject({
        x: 0,
        y: 0,
        radius: 10,
        type: 'circle',
      });
      const obj2 = PhysicsEngine.createPhysicsObject({
        x: 15,
        y: 0,
        radius: 10,
        type: 'circle',
      });
      
      const colliding = PhysicsEngine.checkCircleCollision(obj1, obj2);
      
      expect(colliding).toBe(true);
    });
  });

  describe('collision response', () => {
    it('should resolve collision between two objects', () => {
      const obj1 = PhysicsEngine.createPhysicsObject({
        x: 0,
        y: 0,
        vx: 10,
        vy: 0,
        radius: 10,
        type: 'circle',
      });
      const obj2 = PhysicsEngine.createPhysicsObject({
        x: 15,
        y: 0,
        vx: -10,
        vy: 0,
        radius: 10,
        type: 'circle',
      });
      
      const { obj1: resolved1, obj2: resolved2 } = PhysicsEngine.resolveCollision(obj1, obj2);
      
      // Velocities should have changed
      expect(resolved1.velocity.x).not.toBe(obj1.velocity.x);
      expect(resolved2.velocity.x).not.toBe(obj2.velocity.x);
    });

    it('should not resolve collision with static objects', () => {
      const obj1 = PhysicsEngine.createPhysicsObject({
        x: 0,
        y: 0,
        vx: 10,
        radius: 10,
        isStatic: true,
      });
      const obj2 = PhysicsEngine.createPhysicsObject({
        x: 15,
        y: 0,
        vx: -10,
        radius: 10,
        isStatic: true,
      });
      
      const { obj1: resolved1, obj2: resolved2 } = PhysicsEngine.resolveCollision(obj1, obj2);
      
      expect(resolved1).toBe(obj1);
      expect(resolved2).toBe(obj2);
    });
  });

  describe('bounds constraint', () => {
    it('should constrain object to bounds', () => {
      const obj = PhysicsEngine.createPhysicsObject({
        x: 150,
        y: 50,
        vx: 10,
        vy: 5,
        width: 20,
        height: 20,
      });
      const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
      
      const constrained = PhysicsEngine.constrainToBounds(obj, bounds);
      
      expect(constrained.position.x).toBeLessThanOrEqual(bounds.maxX);
      expect(constrained.position.y).toBeLessThanOrEqual(bounds.maxY);
    });
  });

  describe('force application', () => {
    it('should apply force to object', () => {
      const obj = PhysicsEngine.createPhysicsObject({ mass: 2 });
      const force = { x: 20, y: 0 };
      
      const withForce = PhysicsEngine.applyForce(obj, force);
      
      expect(withForce.acceleration.x).toBe(10); // F/m = 20/2
    });

    it('should not apply force to static objects', () => {
      const obj = PhysicsEngine.createPhysicsObject({ isStatic: true });
      const force = { x: 20, y: 0 };
      
      const withForce = PhysicsEngine.applyForce(obj, force);
      
      expect(withForce.acceleration).toEqual({ x: 0, y: 0 });
    });
  });

  describe('spatial grid', () => {
    it('should create spatial grid', () => {
      const objects = [
        PhysicsEngine.createPhysicsObject({ x: 0, y: 0 }),
        PhysicsEngine.createPhysicsObject({ x: 100, y: 0 }),
        PhysicsEngine.createPhysicsObject({ x: 200, y: 0 }),
      ];
      
      const grid = PhysicsEngine.createSpatialGrid(objects, 100);
      
      expect(grid.size).toBeGreaterThan(0);
    });
  });

  describe('raycast', () => {
    it('should detect ray collision', () => {
      const origin = { x: 0, y: 0 };
      const direction = { x: 1, y: 0 };
      const objects = [
        PhysicsEngine.createPhysicsObject({
          x: 50,
          y: 0,
          radius: 10,
          type: 'circle',
        }),
      ];
      
      const hit = PhysicsEngine.raycast(origin, direction, objects);
      
      expect(hit).toBeDefined();
      expect(hit.object).toBe(objects[0]);
    });

    it('should return null for no collision', () => {
      const origin = { x: 0, y: 0 };
      const direction = { x: 1, y: 0 };
      const objects = [
        PhysicsEngine.createPhysicsObject({
          x: 50,
          y: 100,
          radius: 10,
          type: 'circle',
        }),
      ];
      
      const hit = PhysicsEngine.raycast(origin, direction, objects);
      
      expect(hit).toBeNull();
    });
  });
});
