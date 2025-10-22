/**
 * 🔐 클라이언트용 보안 강화된 AI 서비스
 * 이제 클라이언트에서 API 키가 노출되지 않음!
 */

'use client'

class SecureAIService {
  constructor() {
    this.userToken = null
    this.tokenExpiry = null
  }
  
  // JWT 토큰 관리
  async ensureValidToken() {
    // 토큰이 없거나 만료되었으면 새로 발급
    if (!this.userToken || !this.tokenExpiry || Date.now() > this.tokenExpiry) {
      await this.refreshToken()
    }
    return this.userToken
  }
  
  async refreshToken() {
    try {
      // 수퍼베이스 인증을 통해 JWT 토큰 발급
      const response = await fetch('/api/auth/get-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 수퍼베이스 세션 토큰 사용
          'Authorization': `Bearer ${this.getSupabaseSession()}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Token refresh failed')
      }
      
      const data = await response.json()
      this.userToken = data.token
      this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000) // 23시간 후 만료
      
    } catch (error) {
      console.error('Token refresh error:', error)
      throw new Error('Authentication failed')
    }
  }
  
  getSupabaseSession() {
    // 실제로는 supabase.auth.getSession()에서 가져옴
    if (typeof window !== 'undefined') {
      return localStorage.getItem('supabase.auth.token')
    }
    return null
  }
  
  // 보안 강화된 AI API 호출
  async callAI(provider, model, messages, projectId = null) {
    try {
      const token = await this.ensureValidToken()
      
      const response = await fetch('/api/ai/secure-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          provider,
          model,
          messages,
          projectId
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'AI API call failed')
      }
      
      return await response.json()
      
    } catch (error) {
      console.error('Secure AI call error:', error)
      throw error
    }
  }
  
  // 편의 메서드들
  async chatCompletion(provider, model, userMessage, systemPrompt = '', projectId = null) {
    const messages = []
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    
    messages.push({ role: 'user', content: userMessage })
    
    const result = await this.callAI(provider, model, messages, projectId)
    
    // 응답 형식 정규화
    let aiMessage = ''
    if (provider === 'openai') {
      aiMessage = result.response.choices[0]?.message?.content || ''
    } else if (provider === 'anthropic') {
      aiMessage = result.response.content[0]?.text || ''
    } else if (provider === 'google') {
      aiMessage = result.response.candidates[0]?.content?.parts[0]?.text || ''
    }
    
    return {
      success: true,
      message: aiMessage,
      metadata: result.metadata
    }
  }
  
  // 코드 생성 특화 메서드
  async generateCode(language, prompt, projectId = null) {
    const systemPrompt = `당신은 ${language} 전문 개발자입니다. 사용자의 요청에 따라 깔끔하고 실행 가능한 코드를 생성해주세요. 코드에는 주석을 포함하고, 에러 처리도 고려해주세요.`
    
    try {
      // 사용 가능한 AI 설정 중에서 자동 선택
      const bestConfig = await this.getBestAvailableConfig(language)
      
      if (!bestConfig) {
        throw new Error('사용 가능한 AI 설정이 없습니다')
      }
      
      const result = await this.chatCompletion(
        bestConfig.provider,
        bestConfig.model,
        prompt,
        systemPrompt,
        projectId
      )
      
      return {
        ...result,
        language,
        generatedCode: this.extractCode(result.message, language)
      }
      
    } catch (error) {
      console.error('Code generation error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }
  
  // 코드 추출 (마크다운에서 코드 블록 추출)
  extractCode(text, language) {
    const codeBlockRegex = new RegExp(`\`\`\`${language}?\\n([\\s\\S]*?)\\n\`\`\``, 'g')
    const matches = [...text.matchAll(codeBlockRegex)]
    
    if (matches.length > 0) {
      return matches.map(match => match[1]).join('\n\n')
    }
    
    // 코드 블록이 없으면 전체 텍스트 반환
    return text
  }
  
  // 사용 가능한 최적의 AI 설정 자동 선택
  async getBestAvailableConfig(language = null) {
    try {
      const token = await this.ensureValidToken()
      
      const response = await fetch('/api/ai/get-user-configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      })
      
      if (!response.ok) {
        throw new Error('Failed to get AI configs')
      }
      
      const data = await response.json()
      const configs = data.configs || []
      
      // 언어별 최적 모델 선택 로직
      const preferences = {
        javascript: ['gpt-4', 'claude-3-opus', 'gemini-pro'],
        python: ['gpt-4', 'claude-3-opus', 'gemini-pro'],
        sql: ['gpt-4', 'claude-3-opus'],
        default: ['gpt-4', 'claude-3-opus', 'gemini-pro']
      }
      
      const preferredModels = preferences[language] || preferences.default
      
      // 선호도 순으로 사용 가능한 설정 찾기
      for (const model of preferredModels) {
        const config = configs.find(c => 
          c.enabled && 
          c.test_status === 'success' &&
          c.model_name.includes(model.split('-')[0]) // gpt-4 -> gpt 매치
        )
        
        if (config) {
          return {
            provider: config.provider,
            model: config.model_name
          }
        }
      }
      
      // 아무거나 사용 가능한 것
      const anyConfig = configs.find(c => c.enabled && c.test_status === 'success')
      return anyConfig ? {
        provider: anyConfig.provider,
        model: anyConfig.model_name
      } : null
      
    } catch (error) {
      console.error('Error getting AI configs:', error)
      return null
    }
  }
  
  // 사용량 통계 조회
  async getUsageStats() {
    try {
      const token = await this.ensureValidToken()
      
      const response = await fetch('/api/ai/usage-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      })
      
      if (!response.ok) {
        throw new Error('Failed to get usage stats')
      }
      
      return await response.json()
      
    } catch (error) {
      console.error('Error getting usage stats:', error)
      return { success: false, error: error.message }
    }
  }
}

// 싱글톤 인스턴스
const secureAIService = new SecureAIService()

export default secureAIService
export { SecureAIService }