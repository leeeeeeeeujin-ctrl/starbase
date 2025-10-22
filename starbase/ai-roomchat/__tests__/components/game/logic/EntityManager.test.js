/**
 * Tests for EntityManager module
 */

import * as EntityManager from '../../../../components/game/logic/EntityManager';

describe('EntityManager', () => {
  describe('createEntity', () => {
    it('should create entity with defaults', () => {
      const entity = EntityManager.createEntity();
      
      expect(entity.id).toBeDefined();
      expect(entity.type).toBe(EntityManager.ENTITY_TYPES.NPC);
      expect(entity.health).toBe(100);
      expect(entity.state).toBe(EntityManager.ENTITY_STATES.IDLE);
    });

    it('should create entity with custom values', () => {
      const entity = EntityManager.createEntity({
        type: EntityManager.ENTITY_TYPES.PLAYER,
        name: 'Hero',
        health: 150,
        x: 100,
        y: 200,
      });
      
      expect(entity.type).toBe(EntityManager.ENTITY_TYPES.PLAYER);
      expect(entity.name).toBe('Hero');
      expect(entity.health).toBe(150);
      expect(entity.position).toEqual({ x: 100, y: 200 });
    });
  });

  describe('container operations', () => {
    it('should create empty container', () => {
      const container = EntityManager.createEntityContainer();
      
      expect(container.entities).toBeInstanceOf(Map);
      expect(container.entities.size).toBe(0);
    });

    it('should add entity to container', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({ id: 'test1' });
      
      container = EntityManager.addEntity(container, entity);
      
      expect(container.entities.size).toBe(1);
      expect(container.entities.get('test1')).toBe(entity);
    });

    it('should maintain immutability when adding', () => {
      const original = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({ id: 'test1' });
      
      const updated = EntityManager.addEntity(original, entity);
      
      expect(updated).not.toBe(original);
      expect(original.entities.size).toBe(0);
      expect(updated.entities.size).toBe(1);
    });

    it('should remove entity from container', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({ id: 'test1' });
      
      container = EntityManager.addEntity(container, entity);
      container = EntityManager.removeEntity(container, 'test1');
      
      expect(container.entities.size).toBe(0);
    });

    it('should update entity in container', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({ id: 'test1', health: 100 });
      
      container = EntityManager.addEntity(container, entity);
      container = EntityManager.updateEntity(container, 'test1', { health: 75 });
      
      const updated = container.entities.get('test1');
      expect(updated.health).toBe(75);
    });
  });

  describe('entity retrieval', () => {
    it('should get entity by id', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({ id: 'test1' });
      
      container = EntityManager.addEntity(container, entity);
      const retrieved = EntityManager.getEntity(container, 'test1');
      
      expect(retrieved).toBe(entity);
    });

    it('should return null for non-existent entity', () => {
      const container = EntityManager.createEntityContainer();
      const retrieved = EntityManager.getEntity(container, 'nonexistent');
      
      expect(retrieved).toBeNull();
    });

    it('should get all entities', () => {
      let container = EntityManager.createEntityContainer();
      const entity1 = EntityManager.createEntity({ id: 'test1' });
      const entity2 = EntityManager.createEntity({ id: 'test2' });
      
      container = EntityManager.addEntity(container, entity1);
      container = EntityManager.addEntity(container, entity2);
      
      const all = EntityManager.getAllEntities(container);
      
      expect(all).toHaveLength(2);
    });

    it('should get entities by type', () => {
      let container = EntityManager.createEntityContainer();
      const player = EntityManager.createEntity({
        id: 'player1',
        type: EntityManager.ENTITY_TYPES.PLAYER,
      });
      const enemy = EntityManager.createEntity({
        id: 'enemy1',
        type: EntityManager.ENTITY_TYPES.ENEMY,
      });
      
      container = EntityManager.addEntity(container, player);
      container = EntityManager.addEntity(container, enemy);
      
      const players = EntityManager.getEntitiesByType(container, EntityManager.ENTITY_TYPES.PLAYER);
      
      expect(players).toHaveLength(1);
      expect(players[0].id).toBe('player1');
    });

    it('should get entities by tag', () => {
      let container = EntityManager.createEntityContainer();
      const entity1 = EntityManager.createEntity({ id: 'test1', tags: ['friendly'] });
      const entity2 = EntityManager.createEntity({ id: 'test2', tags: ['friendly', 'magic'] });
      const entity3 = EntityManager.createEntity({ id: 'test3', tags: ['hostile'] });
      
      container = EntityManager.addEntity(container, entity1);
      container = EntityManager.addEntity(container, entity2);
      container = EntityManager.addEntity(container, entity3);
      
      const friendly = EntityManager.getEntitiesByTag(container, 'friendly');
      
      expect(friendly).toHaveLength(2);
    });
  });

  describe('spatial queries', () => {
    it('should find nearest entity', () => {
      let container = EntityManager.createEntityContainer();
      const entity1 = EntityManager.createEntity({ id: 'test1', x: 10, y: 10 });
      const entity2 = EntityManager.createEntity({ id: 'test2', x: 50, y: 50 });
      const entity3 = EntityManager.createEntity({ id: 'test3', x: 100, y: 100 });
      
      container = EntityManager.addEntity(container, entity1);
      container = EntityManager.addEntity(container, entity2);
      container = EntityManager.addEntity(container, entity3);
      
      const nearest = EntityManager.findNearestEntity(container, { x: 0, y: 0 });
      
      expect(nearest.id).toBe('test1');
    });

    it('should find entities in range', () => {
      let container = EntityManager.createEntityContainer();
      const entity1 = EntityManager.createEntity({ id: 'test1', x: 10, y: 10 });
      const entity2 = EntityManager.createEntity({ id: 'test2', x: 50, y: 50 });
      const entity3 = EntityManager.createEntity({ id: 'test3', x: 100, y: 100 });
      
      container = EntityManager.addEntity(container, entity1);
      container = EntityManager.addEntity(container, entity2);
      container = EntityManager.addEntity(container, entity3);
      
      const inRange = EntityManager.findEntitiesInRange(container, { x: 0, y: 0 }, 60);
      
      expect(inRange).toHaveLength(2);
    });
  });

  describe('combat system', () => {
    it('should apply damage', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({
        id: 'test1',
        health: 100,
        attributes: { defense: 10 },
      });
      
      container = EntityManager.addEntity(container, entity);
      const result = EntityManager.applyDamage(container, 'test1', 30);
      
      expect(result.result.success).toBe(true);
      expect(result.result.damage).toBeGreaterThan(0);
      expect(result.result.isDead).toBe(false);
      
      const damaged = EntityManager.getEntity(result.container, 'test1');
      expect(damaged.health).toBeLessThan(100);
    });

    it('should mark entity as dead when health reaches 0', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({ id: 'test1', health: 10 });
      
      container = EntityManager.addEntity(container, entity);
      const result = EntityManager.applyDamage(container, 'test1', 100);
      
      expect(result.result.isDead).toBe(true);
      
      const dead = EntityManager.getEntity(result.container, 'test1');
      expect(dead.health).toBe(0);
      expect(dead.state).toBe(EntityManager.ENTITY_STATES.DEAD);
    });

    it('should apply healing', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({
        id: 'test1',
        health: 50,
        maxHealth: 100,
      });
      
      container = EntityManager.addEntity(container, entity);
      const result = EntityManager.applyHealing(container, 'test1', 30);
      
      expect(result.result.success).toBe(true);
      
      const healed = EntityManager.getEntity(result.container, 'test1');
      expect(healed.health).toBe(80);
    });

    it('should not exceed max health when healing', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({
        id: 'test1',
        health: 90,
        maxHealth: 100,
      });
      
      container = EntityManager.addEntity(container, entity);
      const result = EntityManager.applyHealing(container, 'test1', 50);
      
      const healed = EntityManager.getEntity(result.container, 'test1');
      expect(healed.health).toBe(100);
    });
  });

  describe('status effects', () => {
    it('should add status effect', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({ id: 'test1' });
      
      container = EntityManager.addEntity(container, entity);
      container = EntityManager.addStatusEffect(container, 'test1', {
        type: 'poison',
        duration: 5000,
        value: 2,
      });
      
      const updated = EntityManager.getEntity(container, 'test1');
      expect(updated.statusEffects).toHaveLength(1);
      expect(updated.statusEffects[0].type).toBe('poison');
    });

    it('should remove status effect', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({ id: 'test1' });
      
      container = EntityManager.addEntity(container, entity);
      container = EntityManager.addStatusEffect(container, 'test1', {
        type: 'poison',
        duration: 5000,
      });
      
      const withEffect = EntityManager.getEntity(container, 'test1');
      const effectId = withEffect.statusEffects[0].id;
      
      container = EntityManager.removeStatusEffect(container, 'test1', effectId);
      
      const updated = EntityManager.getEntity(container, 'test1');
      expect(updated.statusEffects).toHaveLength(0);
    });

    it('should cleanup expired effects', () => {
      let container = EntityManager.createEntityContainer();
      const entity = EntityManager.createEntity({ id: 'test1' });
      
      container = EntityManager.addEntity(container, entity);
      
      // Add an effect that already expired
      container = EntityManager.addStatusEffect(container, 'test1', {
        type: 'poison',
        duration: -1000, // Already expired
      });
      
      container = EntityManager.cleanupExpiredEffects(container, 'test1');
      
      const updated = EntityManager.getEntity(container, 'test1');
      expect(updated.statusEffects).toHaveLength(0);
    });
  });

  describe('container utilities', () => {
    it('should get entity count', () => {
      let container = EntityManager.createEntityContainer();
      const entity1 = EntityManager.createEntity({ id: 'test1' });
      const entity2 = EntityManager.createEntity({ id: 'test2' });
      
      container = EntityManager.addEntity(container, entity1);
      container = EntityManager.addEntity(container, entity2);
      
      expect(EntityManager.getEntityCount(container)).toBe(2);
    });

    it('should clear all entities', () => {
      let container = EntityManager.createEntityContainer();
      const entity1 = EntityManager.createEntity({ id: 'test1' });
      const entity2 = EntityManager.createEntity({ id: 'test2' });
      
      container = EntityManager.addEntity(container, entity1);
      container = EntityManager.addEntity(container, entity2);
      
      container = EntityManager.clearAllEntities(container);
      
      expect(EntityManager.getEntityCount(container)).toBe(0);
    });
  });
});
