// lib/aiWorkerClient.js
// 스타베이스에서 AI Worker Pool VS Code Extension과 통신하는 클라이언트

/**
 * AI Worker Pool VS Code Extension과 통신하는 클라이언트
 * localhost:3001에서 실행되는 AI Worker Pool 서버와 연결
 */
class AIWorkerClient {
  constructor() {
    this.baseURL = 'http://localhost:3001'
    this.isConnected = false
  }

  /**
   * AI Worker Pool 서버 연결 상태 확인
   */
  async checkConnection() {
    try {
      const response = await fetch(`${this.baseURL}/health`)
      this.isConnected = response.ok
      return this.isConnected
    } catch (error) {
      console.warn('AI Worker Pool 서버에 연결할 수 없습니다:', error.message)
      this.isConnected = false
      return false
    }
  }

  /**
   * 자연어 프롬프트로 게임 생성 요청
   * @param {string} prompt - 사용자의 자연어 게임 생성 요청
   * @returns {Promise<Object>} 게임 생성 결과
   */
  async generateGame(prompt) {
    // 1순위: 내부 스타베이스 API 호출
    try {
      const response = await fetch('/api/ai-workers/generate-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          task: 'game-generation',
          context: 'starbase-maker'
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ 스타베이스 내부 AI로 게임 생성 완료')
        return result
      }
    } catch (error) {
      console.warn('스타베이스 내부 AI 호출 실패:', error)
    }

    // 2순위: 외부 AI Worker Pool VS Code Extension 호출
    if (await this.checkConnection()) {
      try {
        const response = await fetch(`${this.baseURL}/api/ai-workers/generate-game`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt,
            task: 'game-generation',
            context: 'starbase-maker'
          })
        })

        if (response.ok) {
          const result = await response.json()
          console.log('✅ AI Worker Pool Extension으로 게임 생성 완료')
          return result
        }
      } catch (error) {
        console.warn('AI Worker Pool Extension 호출 실패:', error)
      }
    }

    throw new Error('모든 AI 서비스에 연결할 수 없습니다.')
  }

  /**
   * 게임 밸런스 분석 요청
   * @param {Object} gameData - 게임 데이터
   * @returns {Promise<Object>} 밸런스 분석 결과
   */
  async analyzeBalance(gameData) {
    if (!await this.checkConnection()) {
      return null // 연결되지 않으면 로컬 처리
    }

    try {
      const response = await fetch(`${this.baseURL}/api/ai-workers/analyze-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gameData: gameData,
          task: 'balance-analysis',
          context: 'starbase-game'
        })
      })

      if (!response.ok) {
        return null // 실패시 로컬 처리
      }

      return await response.json()
    } catch (error) {
      console.warn('AI Worker Pool 밸런스 분석 실패:', error)
      return null
    }
  }

  /**
   * 실시간 게임 시뮬레이션 요청
   * @param {Object} gameConfig - 게임 설정
   * @returns {Promise<Object>} 시뮬레이션 결과
   */
  async simulateGame(gameConfig) {
    if (!await this.checkConnection()) {
      return null
    }

    try {
      const response = await fetch(`${this.baseURL}/api/ai-workers/simulate-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gameConfig: gameConfig,
          task: 'game-simulation',
          context: 'starbase-preview'
        })
      })

      if (!response.ok) {
        return null
      }

      return await response.json()
    } catch (error) {
      console.warn('AI Worker Pool 게임 시뮬레이션 실패:', error)
      return null
    }
  }

  /**
   * 실시간 스트리밍으로 AI 작업 진행상황 받기
   * @param {string} taskId - 작업 ID
   * @param {function} onProgress - 진행상황 콜백
   */
  async streamProgress(taskId, onProgress) {
    if (!await this.checkConnection()) {
      return
    }

    try {
      const response = await fetch(`${this.baseURL}/api/ai-workers/stream/${taskId}`)
      const reader = response.body?.getReader()
      
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              onProgress(data)
            } catch (e) {
              console.warn('스트림 데이터 파싱 실패:', e)
            }
          }
        }
      }
    } catch (error) {
      console.warn('AI Worker Pool 스트리밍 실패:', error)
    }
  }
}

// 싱글톤 인스턴스
export const aiWorkerClient = new AIWorkerClient()

// 편의 함수들
export async function generateGameWithAI(prompt) {
  return aiWorkerClient.generateGame(prompt)
}

export async function analyzeGameBalance(gameData) {
  return aiWorkerClient.analyzeBalance(gameData)
}

export async function simulateGamePreview(gameConfig) {
  return aiWorkerClient.simulateGame(gameConfig)
}

// React Hook 임포트 (클라이언트에서만 사용)
let React = null
try {
  React = require('react')
} catch (e) {
  // 서버사이드에서는 React hooks 사용 안 함
}

// AI Worker Pool 연결 상태 확인 hook용
export function useAIWorkerConnection() {
  if (!React) return false
  
  const [isConnected, setIsConnected] = React.useState(false)
  
  React.useEffect(() => {
    const checkConnection = async () => {
      const connected = await aiWorkerClient.checkConnection()
      setIsConnected(connected)
    }
    
    checkConnection()
    const interval = setInterval(checkConnection, 10000) // 10초마다 확인
    
    return () => clearInterval(interval)
  }, [])
  
  return isConnected
}