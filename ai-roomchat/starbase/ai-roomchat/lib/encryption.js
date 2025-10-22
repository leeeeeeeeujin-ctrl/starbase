// lib/encryption.js
// 🔐 클라이언트 사이드 암호화/복호화 유틸리티

// 환경 변수에서 암호화 키 가져오기 (없으면 기본값 사용)
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'starbase-ai-roomchat-default-key-2024'

// 🔐 간단한 암호화 함수 (실제 운영 환경에서는 더 강력한 암호화 사용)
export function encrypt(text) {
  try {
    // Base64 인코딩을 사용한 간단한 암호화
    // 실제 운영에서는 AES 등 더 강력한 암호화 알고리즘 사용 권장
    const encoded = btoa(unescape(encodeURIComponent(text + '|' + ENCRYPTION_KEY)))
    
    // 추가 보안을 위한 간단한 변환
    return encoded.split('').reverse().join('')
  } catch (error) {
    console.error('암호화 실패:', error)
    return text // 암호화 실패시 원본 반환
  }
}

// 🔓 복호화 함수
export function decrypt(encryptedText) {
  try {
    // 암호화의 역순으로 복호화
    const reversed = encryptedText.split('').reverse().join('')
    const decoded = decodeURIComponent(escape(atob(reversed)))
    
    // 암호화 키로 분리하여 원본 텍스트 추출
    const parts = decoded.split('|' + ENCRYPTION_KEY)
    if (parts.length !== 2) {
      throw new Error('Invalid encryption format')
    }
    
    return parts[0]
  } catch (error) {
    console.error('복호화 실패:', error)
    return null
  }
}

// 🧪 암호화/복호화 테스트 함수
export function testEncryption() {
  const testData = {
    apiKey: 'sk-test123456789',
    provider: 'openai',
    model: 'gpt-4'
  }
  
  const original = JSON.stringify(testData)
  const encrypted = encrypt(original)
  const decrypted = decrypt(encrypted)
  
  console.log('암호화 테스트:')
  console.log('원본:', original)
  console.log('암호화:', encrypted)
  console.log('복호화:', decrypted)
  console.log('일치:', original === decrypted)
  
  return original === decrypted
}

// 🔒 API 키 검증 함수들
export function validateApiKey(provider, apiKey) {
  const patterns = {
    openai: /^sk-[A-Za-z0-9]{48,}$/,
    anthropic: /^sk-ant-[A-Za-z0-9_-]{95,}$/,
    google: /^AIza[0-9A-Za-z_-]{35}$/,
    cohere: /^[A-Za-z0-9]{40}$/,
    local: /.*/  // 로컬 서버는 별도 검증 없음
  }
  
  const pattern = patterns[provider]
  if (!pattern) return false
  
  return pattern.test(apiKey)
}

// 🎭 API 키 마스킹 (보안 표시용)
export function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 8) return '***'
  
  const start = apiKey.substring(0, 4)
  const end = apiKey.substring(apiKey.length - 4)
  const middle = '*'.repeat(Math.max(4, apiKey.length - 8))
  
  return `${start}${middle}${end}`
}

// 🔄 안전한 API 설정 관리
export class SecureApiManager {
  constructor() {
    this.storageKey = 'encrypted_ai_apis'
    this.configs = this.loadConfigs()
  }

  // 설정 로드
  loadConfigs() {
    try {
      if (typeof window === 'undefined') return {}
      
      const encrypted = localStorage.getItem(this.storageKey)
      if (!encrypted) return {}
      
      const decrypted = decrypt(encrypted)
      return decrypted ? JSON.parse(decrypted) : {}
    } catch (error) {
      console.error('API 설정 로드 실패:', error)
      return {}
    }
  }

  // 설정 저장
  saveConfigs(configs) {
    try {
      if (typeof window === 'undefined') return false
      
      const encrypted = encrypt(JSON.stringify(configs))
      localStorage.setItem(this.storageKey, encrypted)
      this.configs = configs
      return true
    } catch (error) {
      console.error('API 설정 저장 실패:', error)
      return false
    }
  }

  // API 키 추가
  addApiKey(provider, model, apiKey, metadata = {}) {
    if (!validateApiKey(provider, apiKey)) {
      throw new Error(`유효하지 않은 ${provider} API 키 형식입니다`)
    }

    const newConfigs = {
      ...this.configs,
      [provider]: {
        ...this.configs[provider],
        [model]: {
          apiKey,
          enabled: true,
          addedAt: new Date().toISOString(),
          ...metadata
        }
      }
    }

    if (this.saveConfigs(newConfigs)) {
      return true
    }
    throw new Error('API 키 저장에 실패했습니다')
  }

  // API 키 제거
  removeApiKey(provider, model) {
    const newConfigs = { ...this.configs }
    
    if (newConfigs[provider]) {
      delete newConfigs[provider][model]
      
      // 제공업체에 모델이 없으면 제공업체도 삭제
      if (Object.keys(newConfigs[provider]).length === 0) {
        delete newConfigs[provider]
      }
    }

    return this.saveConfigs(newConfigs)
  }

  // 활성/비활성 토글
  toggleApiKey(provider, model, enabled) {
    if (!this.configs[provider] || !this.configs[provider][model]) {
      return false
    }

    const newConfigs = {
      ...this.configs,
      [provider]: {
        ...this.configs[provider],
        [model]: {
          ...this.configs[provider][model],
          enabled
        }
      }
    }

    return this.saveConfigs(newConfigs)
  }

  // 활성화된 API 키 가져오기
  getActiveApiKey(provider, model) {
    const config = this.configs[provider]?.[model]
    if (config && config.enabled) {
      return config.apiKey
    }
    return null
  }

  // 모든 활성 API 키 목록
  getActiveApis() {
    const activeApis = []
    
    Object.entries(this.configs).forEach(([provider, models]) => {
      Object.entries(models).forEach(([model, config]) => {
        if (config.enabled) {
          activeApis.push({
            provider,
            model,
            maskedKey: maskApiKey(config.apiKey),
            addedAt: config.addedAt
          })
        }
      })
    })

    return activeApis
  }

  // 설정 초기화
  clearAllConfigs() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.storageKey)
    }
    this.configs = {}
    return true
  }

  // 백업 생성 (암호화된 상태로)
  exportBackup() {
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: encrypt(JSON.stringify(this.configs))
    }
  }

  // 백업 복원
  importBackup(backupData) {
    try {
      if (!backupData.data) {
        throw new Error('유효하지 않은 백업 데이터입니다')
      }

      const decrypted = decrypt(backupData.data)
      const configs = JSON.parse(decrypted)
      
      return this.saveConfigs(configs)
    } catch (error) {
      console.error('백업 복원 실패:', error)
      return false
    }
  }
}

// 전역 인스턴스
export const apiManager = new SecureApiManager()