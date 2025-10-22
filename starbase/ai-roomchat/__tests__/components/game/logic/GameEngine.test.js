/**
 * Tests for GameEngine module
 */

import * as GameEngine from '../../../../components/game/logic/GameEngine';

describe('GameEngine', () => {
  describe('initializeGameState', () => {
    it('should create a valid initial game state', () => {
      const state = GameEngine.initializeGameState();
      
      expect(state).toBeDefined();
      expect(state.nodes).toEqual([]);
      expect(state.variables).toEqual({});
      expect(state.gameHistory).toEqual([]);
      expect(state.gameState.phase).toBe('preparation');
      expect(state.gameState.currentTurn).toBe(1);
    });

    it('should accept custom options', () => {
      const nodes = [{ id: 'node1', type: 'ai' }];
      const variables = { '{{test}}': 'value' };
      
      const state = GameEngine.initializeGameState({ nodes, variables });
      
      expect(state.nodes).toEqual(nodes);
      expect(state.variables).toEqual(variables);
    });
  });

  describe('updateGameState', () => {
    it('should update state immutably', () => {
      const state = GameEngine.initializeGameState();
      const updated = GameEngine.updateGameState(state, { currentNode: 'node1' });
      
      expect(updated).not.toBe(state);
      expect(updated.currentNode).toBe('node1');
      expect(state.currentNode).toBeNull();
    });

    it('should throw error for null state', () => {
      expect(() => {
        GameEngine.updateGameState(null, {});
      }).toThrow();
    });
  });

  describe('findNode', () => {
    it('should find node by id', () => {
      const nodes = [
        { id: 'node1', type: 'ai' },
        { id: 'node2', type: 'user_action' },
      ];
      const state = GameEngine.initializeGameState({ nodes });
      
      const node = GameEngine.findNode(state, 'node2');
      
      expect(node).toBeDefined();
      expect(node.id).toBe('node2');
      expect(node.type).toBe('user_action');
    });

    it('should return null for non-existent node', () => {
      const state = GameEngine.initializeGameState();
      const node = GameEngine.findNode(state, 'nonexistent');
      
      expect(node).toBeNull();
    });
  });

  describe('findStartNode', () => {
    it('should find node marked as start', () => {
      const nodes = [
        { id: 'node1', type: 'ai', isStart: false },
        { id: 'node2', type: 'ai', isStart: true },
      ];
      const state = GameEngine.initializeGameState({ nodes });
      
      const startNode = GameEngine.findStartNode(state);
      
      expect(startNode).toBeDefined();
      expect(startNode.id).toBe('node2');
    });

    it('should return first node if no start node', () => {
      const nodes = [
        { id: 'node1', type: 'ai' },
        { id: 'node2', type: 'ai' },
      ];
      const state = GameEngine.initializeGameState({ nodes });
      
      const startNode = GameEngine.findStartNode(state);
      
      expect(startNode).toBeDefined();
      expect(startNode.id).toBe('node1');
    });
  });

  describe('compileTemplate', () => {
    it('should replace variables', () => {
      const template = 'Hello {{name}}, you have {{score}} points.';
      const variables = {
        '{{name}}': 'Player',
        '{{score}}': 100,
      };
      
      const result = GameEngine.compileTemplate(template, variables);
      
      expect(result).toBe('Hello Player, you have 100 points.');
    });

    it('should handle conditional blocks', () => {
      const template = 'Status: {{#if active}}Active{{/if}}';
      const variables = { '{{active}}': true };
      
      const result = GameEngine.compileTemplate(template, variables);
      
      expect(result).toBe('Status: Active');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Hello {{name}}';
      const variables = {};
      
      const result = GameEngine.compileTemplate(template, variables);
      
      expect(result).toBe('Hello {{name}}');
    });

    it('should handle null/undefined values', () => {
      const template = 'Value: {{value}}';
      const variables = { '{{value}}': null };
      
      const result = GameEngine.compileTemplate(template, variables);
      
      expect(result).toBe('Value: ');
    });
  });

  describe('evaluateCondition', () => {
    it('should evaluate keyword conditions', () => {
      const condition = {
        type: 'keyword',
        keywords: ['attack', 'fight'],
      };
      
      expect(GameEngine.evaluateCondition(condition, 'I will attack')).toBe(true);
      expect(GameEngine.evaluateCondition(condition, 'I will run away')).toBe(false);
    });

    it('should evaluate variable conditions', () => {
      const condition = {
        type: 'variable',
        variable: '{{hp}}',
        operator: '>',
        value: 50,
      };
      const variables = { '{{hp}}': 75 };
      
      expect(GameEngine.evaluateCondition(condition, '', variables)).toBe(true);
    });

    it('should handle compound conditions with AND', () => {
      const condition = {
        type: 'compound',
        logic: 'AND',
        conditions: [
          { type: 'keyword', keywords: ['yes'] },
          { type: 'variable', variable: '{{level}}', operator: '>=', value: 5 },
        ],
      };
      const variables = { '{{level}}': 10 };
      
      expect(GameEngine.evaluateCondition(condition, 'yes please', variables)).toBe(true);
      expect(GameEngine.evaluateCondition(condition, 'no thanks', variables)).toBe(false);
    });
  });

  describe('startGame', () => {
    it('should set game to playing state', () => {
      const nodes = [{ id: 'node1', type: 'ai', isStart: true }];
      const state = GameEngine.initializeGameState({ nodes });
      
      const started = GameEngine.startGame(state);
      
      expect(started.gameState.phase).toBe('playing');
      expect(started.currentNode).toBe('node1');
      expect(started.gameState.startTime).toBeDefined();
    });

    it('should throw error if no start node', () => {
      const state = GameEngine.initializeGameState();
      
      expect(() => {
        GameEngine.startGame(state);
      }).toThrow();
    });
  });

  describe('validateGameState', () => {
    it('should validate correct state', () => {
      const state = GameEngine.initializeGameState();
      const result = GameEngine.validateGameState(state);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid state', () => {
      const result = GameEngine.validateGameState({});
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('performance', () => {
    it('should detect low-end devices', () => {
      // Mock navigator
      const originalNavigator = global.navigator;
      global.navigator = { deviceMemory: 1, hardwareConcurrency: 2 };
      
      const isLowEnd = GameEngine.isLowEndDevice();
      
      expect(isLowEnd).toBe(true);
      
      global.navigator = originalNavigator;
    });

    it('should calculate frame interval', () => {
      const interval60 = GameEngine.getFrameInterval(60);
      const interval30 = GameEngine.getFrameInterval(30);
      
      expect(interval60).toBeCloseTo(16.67, 1);
      expect(interval30).toBeCloseTo(33.33, 1);
    });
  });
});
