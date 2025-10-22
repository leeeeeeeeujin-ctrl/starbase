/**
 * Tests for ScoreManager module
 */

import * as ScoreManager from '../../../../components/game/logic/ScoreManager';

describe('ScoreManager', () => {
  describe('initializeScoreState', () => {
    it('should create initial score state', () => {
      const state = ScoreManager.initializeScoreState();
      
      expect(state.score).toBe(0);
      expect(state.highScore).toBe(0);
      expect(state.progress.current).toBe(0);
      expect(state.combo.current).toBe(0);
      expect(state.achievements).toEqual([]);
    });

    it('should accept custom options', () => {
      const state = ScoreManager.initializeScoreState({
        score: 100,
        highScore: 500,
        totalProgress: 200,
      });
      
      expect(state.score).toBe(100);
      expect(state.highScore).toBe(500);
      expect(state.progress.total).toBe(200);
    });
  });

  describe('score operations', () => {
    it('should add score', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.addScore(state, 100);
      
      expect(state.score).toBe(100);
    });

    it('should update high score', () => {
      let state = ScoreManager.initializeScoreState({ highScore: 50 });
      state = ScoreManager.addScore(state, 100);
      
      expect(state.highScore).toBe(100);
    });

    it('should apply combo multiplier', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.increaseCombo(state);
      state = ScoreManager.increaseCombo(state);
      // Combo multiplier should be > 1
      expect(state.combo.multiplier).toBeGreaterThan(1);
      
      state = ScoreManager.addScore(state, 100, { applyCombo: true });
      expect(state.score).toBeGreaterThan(100);
    });

    it('should subtract score', () => {
      let state = ScoreManager.initializeScoreState({ score: 100 });
      state = ScoreManager.subtractScore(state, 30);
      
      expect(state.score).toBe(70);
    });

    it('should not go below zero when subtracting', () => {
      let state = ScoreManager.initializeScoreState({ score: 10 });
      state = ScoreManager.subtractScore(state, 30);
      
      expect(state.score).toBe(0);
    });

    it('should reset score', () => {
      let state = ScoreManager.initializeScoreState({ score: 500 });
      state = ScoreManager.resetScore(state);
      
      expect(state.score).toBe(0);
      expect(state.combo.current).toBe(0);
    });
  });

  describe('progress tracking', () => {
    it('should update progress', () => {
      let state = ScoreManager.initializeScoreState({ totalProgress: 100 });
      state = ScoreManager.updateProgress(state, 50);
      
      expect(state.progress.current).toBe(50);
      expect(state.progress.percentage).toBe(50);
    });

    it('should not exceed total progress', () => {
      let state = ScoreManager.initializeScoreState({ totalProgress: 100 });
      state = ScoreManager.updateProgress(state, 150);
      
      expect(state.progress.current).toBe(100);
      expect(state.progress.percentage).toBe(100);
    });

    it('should add checkpoint', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.addProgressCheckpoint(state, {
        name: 'Level 1 Complete',
        value: 25,
      });
      
      expect(state.progress.checkpoints).toHaveLength(1);
      expect(state.progress.checkpoints[0].name).toBe('Level 1 Complete');
    });
  });

  describe('combo system', () => {
    it('should increase combo', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.increaseCombo(state);
      
      expect(state.combo.current).toBe(1);
      expect(state.combo.multiplier).toBeGreaterThan(1);
    });

    it('should track max combo', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.increaseCombo(state);
      state = ScoreManager.increaseCombo(state);
      state = ScoreManager.increaseCombo(state);
      
      expect(state.combo.max).toBe(3);
    });

    it('should reset combo', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.increaseCombo(state);
      state = ScoreManager.increaseCombo(state);
      state = ScoreManager.resetCombo(state);
      
      expect(state.combo.current).toBe(0);
      expect(state.combo.multiplier).toBe(1);
    });

    it('should timeout combo after window', () => {
      let state = ScoreManager.initializeScoreState({ comboWindow: 1000 });
      state = ScoreManager.increaseCombo(state);
      
      // Mock time passing
      state.combo.lastActionTime = Date.now() - 2000; // 2 seconds ago
      
      state = ScoreManager.checkComboTimeout(state);
      
      expect(state.combo.current).toBe(0);
    });

    it('should reset combo if action outside window', () => {
      let state = ScoreManager.initializeScoreState({ comboWindow: 1000 });
      state = ScoreManager.increaseCombo(state);
      
      // Mock time passing
      state.combo.lastActionTime = Date.now() - 2000;
      
      state = ScoreManager.increaseCombo(state);
      
      expect(state.combo.current).toBe(1); // Reset to 1
    });
  });

  describe('achievements', () => {
    it('should create achievement', () => {
      const achievement = ScoreManager.createAchievement({
        name: 'First Victory',
        description: 'Win your first game',
        requirementType: 'value',
        requirementValue: 1,
      });
      
      expect(achievement.name).toBe('First Victory');
      expect(achievement.unlocked).toBe(false);
      expect(achievement.requirement.value).toBe(1);
    });

    it('should add achievement', () => {
      let state = ScoreManager.initializeScoreState();
      const achievement = ScoreManager.createAchievement({
        id: 'ach1',
        name: 'Test Achievement',
      });
      
      state = ScoreManager.addAchievement(state, achievement);
      
      expect(state.achievements).toHaveLength(1);
    });

    it('should update achievement progress', () => {
      let state = ScoreManager.initializeScoreState();
      const achievement = ScoreManager.createAchievement({
        id: 'ach1',
        requirementValue: 10,
      });
      
      state = ScoreManager.addAchievement(state, achievement);
      
      const result = ScoreManager.updateAchievementProgress(state, 'ach1', 5);
      state = result.state;
      
      expect(state.achievements[0].progress).toBe(50);
      expect(result.unlocked).toBe(false);
    });

    it('should unlock achievement when requirement met', () => {
      let state = ScoreManager.initializeScoreState();
      const achievement = ScoreManager.createAchievement({
        id: 'ach1',
        requirementValue: 10,
      });
      
      state = ScoreManager.addAchievement(state, achievement);
      
      const result = ScoreManager.updateAchievementProgress(state, 'ach1', 10);
      state = result.state;
      
      expect(result.unlocked).toBe(true);
      expect(state.achievements[0].unlocked).toBe(true);
      expect(state.unlockedAchievements.has('ach1')).toBe(true);
    });

    it('should manually unlock achievement', () => {
      let state = ScoreManager.initializeScoreState();
      const achievement = ScoreManager.createAchievement({ id: 'ach1' });
      
      state = ScoreManager.addAchievement(state, achievement);
      
      const result = ScoreManager.unlockAchievement(state, 'ach1');
      state = result.state;
      
      expect(result.success).toBe(true);
      expect(state.achievements[0].unlocked).toBe(true);
    });

    it('should not unlock already unlocked achievement', () => {
      let state = ScoreManager.initializeScoreState();
      const achievement = ScoreManager.createAchievement({ id: 'ach1' });
      
      state = ScoreManager.addAchievement(state, achievement);
      state = ScoreManager.unlockAchievement(state, 'ach1').state;
      
      const result = ScoreManager.unlockAchievement(state, 'ach1');
      
      expect(result.success).toBe(false);
    });
  });

  describe('game statistics', () => {
    it('should record game start', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.recordGameStart(state);
      
      expect(state.startTime).toBeDefined();
      expect(state.stats.gamesPlayed).toBe(1);
    });

    it('should record game end with win', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.recordGameStart(state);
      state = ScoreManager.recordGameEnd(state, { won: true, score: 500 });
      
      expect(state.endTime).toBeDefined();
      expect(state.stats.gamesWon).toBe(1);
      expect(state.stats.totalScore).toBe(500);
    });

    it('should record game end with loss', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.recordGameStart(state);
      state = ScoreManager.recordGameEnd(state, { won: false, score: 100 });
      
      expect(state.stats.gamesLost).toBe(1);
    });

    it('should calculate average score', () => {
      let state = ScoreManager.initializeScoreState();
      
      state = ScoreManager.recordGameStart(state);
      state = ScoreManager.recordGameEnd(state, { score: 100 });
      
      state = ScoreManager.recordGameStart(state);
      state = ScoreManager.recordGameEnd(state, { score: 200 });
      
      expect(state.stats.averageScore).toBe(150);
    });

    it('should get stats', () => {
      let state = ScoreManager.initializeScoreState({ score: 500, highScore: 1000 });
      const stats = ScoreManager.getStats(state);
      
      expect(stats.currentScore).toBe(500);
      expect(stats.highScore).toBe(1000);
      expect(stats.achievementsTotal).toBe(0);
    });
  });

  describe('rewards', () => {
    it('should add reward', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.addReward(state, {
        type: 'item',
        value: 'sword',
        reason: 'Quest completion',
      });
      
      expect(state.rewards.pending).toHaveLength(1);
    });

    it('should claim reward', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.addReward(state, {
        type: 'item',
        value: 'sword',
      });
      
      const rewardId = state.rewards.pending[0].id;
      const result = ScoreManager.claimReward(state, rewardId);
      state = result.state;
      
      expect(result.success).toBe(true);
      expect(state.rewards.pending).toHaveLength(0);
      expect(state.rewards.claimed).toHaveLength(1);
    });

    it('should fail to claim non-existent reward', () => {
      const state = ScoreManager.initializeScoreState();
      const result = ScoreManager.claimReward(state, 'nonexistent');
      
      expect(result.success).toBe(false);
    });
  });

  describe('rankings', () => {
    it('should update ranking', () => {
      let state = ScoreManager.initializeScoreState();
      state = ScoreManager.updateRanking(state, 'daily', {
        rank: 5,
        total: 100,
        percentile: 95,
      });
      
      expect(state.rankings.daily).toBeDefined();
      expect(state.rankings.daily.rank).toBe(5);
    });
  });
});
