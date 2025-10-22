/**
 * 🏆 ScoreManager - 점수, 진행도, 업적 관리
 * 
 * 게임 내 점수 시스템, 진행도 추적, 업적 달성을 관리합니다.
 * 순수 함수 기반으로 불변성을 유지하며 통계 추적을 제공합니다.
 * 
 * @module ScoreManager
 * @version 1.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

/**
 * 업적 타입 상수
 */
export const ACHIEVEMENT_TYPES = {
  SCORE: 'score',
  PROGRESS: 'progress',
  TIME: 'time',
  COMBO: 'combo',
  COLLECTION: 'collection',
  SPECIAL: 'special',
};

/**
 * 점수 상태 초기화
 * 
 * @param {Object} options - 초기화 옵션
 * @returns {Object} 점수 상태 객체
 */
export function initializeScoreState(options = {}) {
  return {
    // 점수
    score: options.score || 0,
    highScore: options.highScore || 0,
    
    // 진행도
    progress: {
      current: 0,
      total: options.totalProgress || 100,
      percentage: 0,
      checkpoints: [],
    },
    
    // 콤보
    combo: {
      current: 0,
      max: 0,
      multiplier: 1,
      lastActionTime: null,
      comboWindow: options.comboWindow || 3000, // 3초
    },
    
    // 통계
    stats: {
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      totalPlayTime: 0,
      totalScore: 0,
      averageScore: 0,
      bestTime: Infinity,
      worstTime: 0,
    },
    
    // 업적
    achievements: [],
    unlockedAchievements: new Set(),
    
    // 랭킹
    rankings: {
      daily: null,
      weekly: null,
      allTime: null,
    },
    
    // 보상
    rewards: {
      pending: [],
      claimed: [],
    },
    
    // 메타
    startTime: null,
    endTime: null,
    lastUpdateTime: Date.now(),
  };
}

/**
 * 점수 추가
 * 
 * @param {Object} state - 점수 상태
 * @param {number} points - 추가할 점수
 * @param {Object} options - 옵션 { reason, applyCombo }
 * @returns {Object} 업데이트된 상태
 */
export function addScore(state, points, options = {}) {
  if (!state || typeof points !== 'number' || points < 0) {
    return state;
  }

  // 콤보 적용
  let actualPoints = points;
  if (options.applyCombo !== false) {
    actualPoints = Math.floor(points * state.combo.multiplier);
  }

  const newScore = state.score + actualPoints;
  const newHighScore = Math.max(state.highScore, newScore);

  return {
    ...state,
    score: newScore,
    highScore: newHighScore,
    lastUpdateTime: Date.now(),
  };
}

/**
 * 점수 차감
 * 
 * @param {Object} state - 점수 상태
 * @param {number} points - 차감할 점수
 * @returns {Object} 업데이트된 상태
 */
export function subtractScore(state, points) {
  if (!state || typeof points !== 'number' || points < 0) {
    return state;
  }

  const newScore = Math.max(0, state.score - points);

  return {
    ...state,
    score: newScore,
    lastUpdateTime: Date.now(),
  };
}

/**
 * 점수 초기화
 * 
 * @param {Object} state - 점수 상태
 * @returns {Object} 업데이트된 상태
 */
export function resetScore(state) {
  return {
    ...state,
    score: 0,
    combo: {
      ...state.combo,
      current: 0,
      multiplier: 1,
      lastActionTime: null,
    },
    lastUpdateTime: Date.now(),
  };
}

/**
 * 진행도 업데이트
 * 
 * @param {Object} state - 점수 상태
 * @param {number} current - 현재 진행도
 * @param {number} total - 전체 진행도 (선택적)
 * @returns {Object} 업데이트된 상태
 */
export function updateProgress(state, current, total = null) {
  if (!state) {
    return state;
  }

  const newTotal = total !== null ? total : state.progress.total;
  const newCurrent = Math.min(Math.max(0, current), newTotal);
  const percentage = newTotal > 0 ? (newCurrent / newTotal) * 100 : 0;

  return {
    ...state,
    progress: {
      ...state.progress,
      current: newCurrent,
      total: newTotal,
      percentage: Math.round(percentage * 100) / 100,
    },
    lastUpdateTime: Date.now(),
  };
}

/**
 * 진행도 체크포인트 추가
 * 
 * @param {Object} state - 점수 상태
 * @param {Object} checkpoint - 체크포인트 { name, value, timestamp }
 * @returns {Object} 업데이트된 상태
 */
export function addProgressCheckpoint(state, checkpoint) {
  if (!state || !checkpoint) {
    return state;
  }

  const newCheckpoint = {
    ...checkpoint,
    timestamp: checkpoint.timestamp || Date.now(),
  };

  return {
    ...state,
    progress: {
      ...state.progress,
      checkpoints: [...state.progress.checkpoints, newCheckpoint],
    },
    lastUpdateTime: Date.now(),
  };
}

/**
 * 콤보 증가
 * 
 * @param {Object} state - 점수 상태
 * @param {number} increment - 증가량 (기본: 1)
 * @returns {Object} 업데이트된 상태
 */
export function increaseCombo(state, increment = 1) {
  if (!state) {
    return state;
  }

  const now = Date.now();
  const lastActionTime = state.combo.lastActionTime;
  const comboWindow = state.combo.comboWindow;

  // 콤보 윈도우 체크
  let newCurrent = state.combo.current;
  if (lastActionTime && (now - lastActionTime) > comboWindow) {
    // 콤보 초기화
    newCurrent = increment;
  } else {
    newCurrent += increment;
  }

  const newMax = Math.max(state.combo.max, newCurrent);
  const newMultiplier = 1 + (newCurrent * 0.1); // 콤보당 10% 증가

  return {
    ...state,
    combo: {
      ...state.combo,
      current: newCurrent,
      max: newMax,
      multiplier: Math.round(newMultiplier * 100) / 100,
      lastActionTime: now,
    },
    lastUpdateTime: now,
  };
}

/**
 * 콤보 초기화
 * 
 * @param {Object} state - 점수 상태
 * @returns {Object} 업데이트된 상태
 */
export function resetCombo(state) {
  if (!state) {
    return state;
  }

  return {
    ...state,
    combo: {
      ...state.combo,
      current: 0,
      multiplier: 1,
      lastActionTime: null,
    },
    lastUpdateTime: Date.now(),
  };
}

/**
 * 콤보 타임아웃 체크
 * 
 * @param {Object} state - 점수 상태
 * @returns {Object} 업데이트된 상태 (필요시)
 */
export function checkComboTimeout(state) {
  if (!state || !state.combo.lastActionTime) {
    return state;
  }

  const now = Date.now();
  const elapsed = now - state.combo.lastActionTime;

  if (elapsed > state.combo.comboWindow) {
    return resetCombo(state);
  }

  return state;
}

/**
 * 업적 생성
 * 
 * @param {Object} options - 업적 옵션
 * @returns {Object} 업적 객체
 */
export function createAchievement(options = {}) {
  return {
    id: options.id || `achievement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: options.name || 'Unnamed Achievement',
    description: options.description || '',
    type: options.type || ACHIEVEMENT_TYPES.SPECIAL,
    
    // 조건
    requirement: {
      type: options.requirementType || 'value',
      value: options.requirementValue || 0,
      current: 0,
    },
    
    // 보상
    reward: {
      score: options.rewardScore || 0,
      items: options.rewardItems || [],
      title: options.rewardTitle || null,
    },
    
    // 상태
    unlocked: false,
    unlockedAt: null,
    progress: 0,
    
    // 메타
    icon: options.icon || '🏆',
    rarity: options.rarity || 'common', // common, rare, epic, legendary
    hidden: options.hidden || false,
  };
}

/**
 * 업적 추가
 * 
 * @param {Object} state - 점수 상태
 * @param {Object} achievement - 업적 객체
 * @returns {Object} 업데이트된 상태
 */
export function addAchievement(state, achievement) {
  if (!state || !achievement) {
    return state;
  }

  return {
    ...state,
    achievements: [...state.achievements, achievement],
    lastUpdateTime: Date.now(),
  };
}

/**
 * 업적 진행도 업데이트
 * 
 * @param {Object} state - 점수 상태
 * @param {string} achievementId - 업적 ID
 * @param {number} value - 현재 값
 * @returns {Object} 업데이트된 상태와 결과
 */
export function updateAchievementProgress(state, achievementId, value) {
  if (!state) {
    return { state, unlocked: false };
  }

  const achievementIndex = state.achievements.findIndex(a => a.id === achievementId);
  if (achievementIndex === -1) {
    return { state, unlocked: false };
  }

  const achievement = state.achievements[achievementIndex];
  if (achievement.unlocked) {
    return { state, unlocked: false };
  }

  const newCurrent = value;
  const required = achievement.requirement.value;
  const progress = required > 0 ? Math.min(100, (newCurrent / required) * 100) : 0;
  const isUnlocked = newCurrent >= required;

  const updatedAchievement = {
    ...achievement,
    requirement: {
      ...achievement.requirement,
      current: newCurrent,
    },
    progress,
    unlocked: isUnlocked,
    unlockedAt: isUnlocked ? Date.now() : null,
  };

  const newAchievements = [...state.achievements];
  newAchievements[achievementIndex] = updatedAchievement;

  const newUnlockedAchievements = new Set(state.unlockedAchievements);
  if (isUnlocked) {
    newUnlockedAchievements.add(achievementId);
  }

  return {
    state: {
      ...state,
      achievements: newAchievements,
      unlockedAchievements: newUnlockedAchievements,
      lastUpdateTime: Date.now(),
    },
    unlocked: isUnlocked,
    achievement: isUnlocked ? updatedAchievement : null,
  };
}

/**
 * 업적 잠금 해제
 * 
 * @param {Object} state - 점수 상태
 * @param {string} achievementId - 업적 ID
 * @returns {Object} 업데이트된 상태와 결과
 */
export function unlockAchievement(state, achievementId) {
  if (!state) {
    return { state, success: false };
  }

  const achievementIndex = state.achievements.findIndex(a => a.id === achievementId);
  if (achievementIndex === -1) {
    return { state, success: false, message: '업적을 찾을 수 없습니다.' };
  }

  const achievement = state.achievements[achievementIndex];
  if (achievement.unlocked) {
    return { state, success: false, message: '이미 잠금 해제된 업적입니다.' };
  }

  const updatedAchievement = {
    ...achievement,
    unlocked: true,
    unlockedAt: Date.now(),
    progress: 100,
    requirement: {
      ...achievement.requirement,
      current: achievement.requirement.value,
    },
  };

  const newAchievements = [...state.achievements];
  newAchievements[achievementIndex] = updatedAchievement;

  const newUnlockedAchievements = new Set(state.unlockedAchievements);
  newUnlockedAchievements.add(achievementId);

  return {
    state: {
      ...state,
      achievements: newAchievements,
      unlockedAchievements: newUnlockedAchievements,
      lastUpdateTime: Date.now(),
    },
    success: true,
    achievement: updatedAchievement,
  };
}

/**
 * 게임 시작 기록
 * 
 * @param {Object} state - 점수 상태
 * @returns {Object} 업데이트된 상태
 */
export function recordGameStart(state) {
  if (!state) {
    return state;
  }

  return {
    ...state,
    startTime: Date.now(),
    stats: {
      ...state.stats,
      gamesPlayed: state.stats.gamesPlayed + 1,
    },
    lastUpdateTime: Date.now(),
  };
}

/**
 * 게임 종료 기록
 * 
 * @param {Object} state - 점수 상태
 * @param {Object} result - 게임 결과 { won: boolean, score: number }
 * @returns {Object} 업데이트된 상태
 */
export function recordGameEnd(state, result = {}) {
  if (!state) {
    return state;
  }

  const endTime = Date.now();
  const playTime = state.startTime ? endTime - state.startTime : 0;

  const newStats = {
    ...state.stats,
    gamesWon: result.won ? state.stats.gamesWon + 1 : state.stats.gamesWon,
    gamesLost: !result.won ? state.stats.gamesLost + 1 : state.stats.gamesLost,
    totalPlayTime: state.stats.totalPlayTime + playTime,
    totalScore: state.stats.totalScore + (result.score || state.score),
    averageScore: 0, // 계산 후 업데이트
    bestTime: Math.min(state.stats.bestTime, playTime),
    worstTime: Math.max(state.stats.worstTime, playTime),
  };

  // 평균 점수 계산
  if (newStats.gamesPlayed > 0) {
    newStats.averageScore = Math.round(newStats.totalScore / newStats.gamesPlayed);
  }

  return {
    ...state,
    endTime,
    stats: newStats,
    lastUpdateTime: endTime,
  };
}

/**
 * 보상 추가
 * 
 * @param {Object} state - 점수 상태
 * @param {Object} reward - 보상 { type, value, reason }
 * @returns {Object} 업데이트된 상태
 */
export function addReward(state, reward) {
  if (!state || !reward) {
    return state;
  }

  const newReward = {
    ...reward,
    id: `reward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    claimed: false,
  };

  return {
    ...state,
    rewards: {
      ...state.rewards,
      pending: [...state.rewards.pending, newReward],
    },
    lastUpdateTime: Date.now(),
  };
}

/**
 * 보상 획득
 * 
 * @param {Object} state - 점수 상태
 * @param {string} rewardId - 보상 ID
 * @returns {Object} 업데이트된 상태와 결과
 */
export function claimReward(state, rewardId) {
  if (!state) {
    return { state, success: false };
  }

  const rewardIndex = state.rewards.pending.findIndex(r => r.id === rewardId);
  if (rewardIndex === -1) {
    return { state, success: false, message: '보상을 찾을 수 없습니다.' };
  }

  const reward = state.rewards.pending[rewardIndex];
  const claimedReward = {
    ...reward,
    claimed: true,
    claimedAt: Date.now(),
  };

  const newPending = [...state.rewards.pending];
  newPending.splice(rewardIndex, 1);

  return {
    state: {
      ...state,
      rewards: {
        pending: newPending,
        claimed: [...state.rewards.claimed, claimedReward],
      },
      lastUpdateTime: Date.now(),
    },
    success: true,
    reward: claimedReward,
  };
}

/**
 * 통계 가져오기
 * 
 * @param {Object} state - 점수 상태
 * @returns {Object} 통계 객체
 */
export function getStats(state) {
  if (!state) {
    return null;
  }

  return {
    ...state.stats,
    currentScore: state.score,
    highScore: state.highScore,
    progress: state.progress.percentage,
    comboMax: state.combo.max,
    achievementsUnlocked: state.unlockedAchievements.size,
    achievementsTotal: state.achievements.length,
  };
}

/**
 * 랭킹 업데이트
 * 
 * @param {Object} state - 점수 상태
 * @param {string} period - 기간 ('daily', 'weekly', 'allTime')
 * @param {Object} ranking - 랭킹 정보 { rank, total, percentile }
 * @returns {Object} 업데이트된 상태
 */
export function updateRanking(state, period, ranking) {
  if (!state || !['daily', 'weekly', 'allTime'].includes(period)) {
    return state;
  }

  return {
    ...state,
    rankings: {
      ...state.rankings,
      [period]: {
        ...ranking,
        updatedAt: Date.now(),
      },
    },
    lastUpdateTime: Date.now(),
  };
}

export default {
  ACHIEVEMENT_TYPES,
  initializeScoreState,
  addScore,
  subtractScore,
  resetScore,
  updateProgress,
  addProgressCheckpoint,
  increaseCombo,
  resetCombo,
  checkComboTimeout,
  createAchievement,
  addAchievement,
  updateAchievementProgress,
  unlockAchievement,
  recordGameStart,
  recordGameEnd,
  addReward,
  claimReward,
  getStats,
  updateRanking,
};
