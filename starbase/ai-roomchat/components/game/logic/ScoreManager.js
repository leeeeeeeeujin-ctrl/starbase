/**
 * ScoreManager - 점수 관리 모듈
 * 게임 점수, 통계, 업적 등을 추적하고 관리
 */
export default class ScoreManager {
  constructor(options = {}) {
    this.options = {
      enableAchievements: true,
      enableStats: true,
      ...options,
    }
    this.score = 0
    this.highScore = 0
    this.stats = {}
    this.achievements = []
    this.isInitialized = false
  }

  /**
   * 점수 관리자 초기화
   */
  async initialize(savedData = {}) {
    try {
      this.score = savedData.score || 0
      this.highScore = savedData.highScore || 0
      this.stats = savedData.stats || {}
      this.achievements = savedData.achievements || []

      this.isInitialized = true
      return true
    } catch (error) {
      console.error('[ScoreManager] 초기화 실패:', error)
      return false
    }
  }

  /**
   * 점수 추가
   */
  addScore(points) {
    if (typeof points !== 'number' || points < 0) {
      console.warn('[ScoreManager] 유효하지 않은 점수:', points)
      return
    }

    this.score += points
    
    // 최고 점수 업데이트
    if (this.score > this.highScore) {
      this.highScore = this.score
      console.log(`[ScoreManager] 새로운 최고 점수: ${this.highScore}`)
    }

    // 업적 체크
    this.checkAchievements()

    return this.score
  }

  /**
   * 점수 차감
   */
  subtractScore(points) {
    if (typeof points !== 'number' || points < 0) {
      console.warn('[ScoreManager] 유효하지 않은 점수:', points)
      return
    }

    this.score = Math.max(0, this.score - points)
    return this.score
  }

  /**
   * 점수 설정
   */
  setScore(points) {
    if (typeof points !== 'number' || points < 0) {
      console.warn('[ScoreManager] 유효하지 않은 점수:', points)
      return
    }

    this.score = points
    
    if (this.score > this.highScore) {
      this.highScore = this.score
    }

    return this.score
  }

  /**
   * 현재 점수 가져오기
   */
  getScore() {
    return this.score
  }

  /**
   * 최고 점수 가져오기
   */
  getHighScore() {
    return this.highScore
  }

  /**
   * 통계 기록
   */
  recordStat(statName, value) {
    if (!this.options.enableStats) return

    if (typeof value === 'number') {
      this.stats[statName] = (this.stats[statName] || 0) + value
    } else {
      this.stats[statName] = value
    }
  }

  /**
   * 통계 가져오기
   */
  getStat(statName) {
    return this.stats[statName] || 0
  }

  /**
   * 모든 통계 가져오기
   */
  getAllStats() {
    return { ...this.stats }
  }

  /**
   * 업적 등록
   */
  registerAchievement(achievement) {
    if (!this.options.enableAchievements) return

    const { id, name, description, condition } = achievement

    if (!id || !name || !condition) {
      console.warn('[ScoreManager] 유효하지 않은 업적 정의')
      return false
    }

    // 중복 체크
    if (this.achievements.some(a => a.id === id)) {
      console.warn(`[ScoreManager] 이미 등록된 업적: ${id}`)
      return false
    }

    this.achievements.push({
      id,
      name,
      description,
      condition,
      unlocked: false,
      unlockedAt: null,
    })

    return true
  }

  /**
   * 업적 해제
   */
  unlockAchievement(achievementId) {
    const achievement = this.achievements.find(a => a.id === achievementId)
    
    if (!achievement) {
      console.warn(`[ScoreManager] 업적을 찾을 수 없음: ${achievementId}`)
      return false
    }

    if (achievement.unlocked) {
      return false
    }

    achievement.unlocked = true
    achievement.unlockedAt = new Date().toISOString()
    
    console.log(`[ScoreManager] 업적 해제: ${achievement.name}`)
    return true
  }

  /**
   * 업적 체크
   */
  checkAchievements() {
    if (!this.options.enableAchievements) return

    this.achievements.forEach(achievement => {
      if (achievement.unlocked) return

      try {
        const conditionMet = achievement.condition(this)
        if (conditionMet) {
          this.unlockAchievement(achievement.id)
        }
      } catch (error) {
        console.error(`[ScoreManager] 업적 조건 체크 오류 (${achievement.id}):`, error)
      }
    })
  }

  /**
   * 해제된 업적 가져오기
   */
  getUnlockedAchievements() {
    return this.achievements.filter(a => a.unlocked)
  }

  /**
   * 모든 업적 가져오기
   */
  getAllAchievements() {
    return [...this.achievements]
  }

  /**
   * 점수 리셋
   */
  resetScore() {
    this.score = 0
    console.log('[ScoreManager] 점수 리셋')
  }

  /**
   * 모든 데이터 리셋
   */
  resetAll() {
    this.score = 0
    this.stats = {}
    this.achievements.forEach(a => {
      a.unlocked = false
      a.unlockedAt = null
    })
    console.log('[ScoreManager] 모든 데이터 리셋')
  }

  /**
   * 저장 데이터 내보내기
   */
  exportData() {
    return {
      score: this.score,
      highScore: this.highScore,
      stats: { ...this.stats },
      achievements: this.achievements.map(a => ({
        id: a.id,
        unlocked: a.unlocked,
        unlockedAt: a.unlockedAt,
      })),
    }
  }

  /**
   * 보고서 생성
   */
  generateReport() {
    const totalAchievements = this.achievements.length
    const unlockedAchievements = this.getUnlockedAchievements().length

    return {
      score: this.score,
      highScore: this.highScore,
      achievementProgress: `${unlockedAchievements}/${totalAchievements}`,
      achievementPercentage: totalAchievements > 0 
        ? Math.round((unlockedAchievements / totalAchievements) * 100)
        : 0,
      stats: { ...this.stats },
    }
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    this.isInitialized = false
  }
}
