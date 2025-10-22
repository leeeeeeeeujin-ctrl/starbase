/**
 * 🔐 보안 강화된 AI API 프록시 서비스
 * 클라이언트에서 직접 AI API 호출하지 않고 서버를 통해 프록시
 */

// pages/api/ai/secure-proxy.js
import jwt from 'jsonwebtoken'
import { supabase } from '../../../lib/supabaseAdmin'
import crypto from 'crypto'

// 암호화 키 (환경변수에서 가져오기)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-char-encryption-key-here'
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret'

// 서버사이드 암호화/복호화
class ServerSideEncryption {
  static encrypt(text) {
    const algorithm = 'aes-256-cbc'
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
    const iv = crypto.randomBytes(16)
    
    const cipher = crypto.createCipher(algorithm, key)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    return {
      encrypted,
      iv: iv.toString('hex')
    }
  }
  
  static decrypt(encryptedData, ivHex) {
    const algorithm = 'aes-256-cbc'
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
    const iv = Buffer.from(ivHex, 'hex')
    
    const decipher = crypto.createDecipher(algorithm, key)
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }
}

// JWT 토큰 검증 미들웨어
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (error) {
    throw new Error('Invalid token')
  }
}

// AI API 호출 함수들
const aiProviders = {
  async openai(apiKey, model, messages) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1000
      })
    })
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }
    
    return await response.json()
  },
  
  async anthropic(apiKey, model, messages) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1000
      })
    })
    
    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }
    
    return await response.json()
  },
  
  async google(apiKey, model, messages) {
    // Google Gemini API 구현
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: messages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }))
      })
    })
    
    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`)
    }
    
    return await response.json()
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  
  try {
    const { token, provider, model, messages, projectId } = req.body
    
    // 1. JWT 토큰 검증
    const decoded = verifyToken(token)
    const userId = decoded.userId
    
    // 2. 사용자의 AI API 설정 조회 (수퍼베이스에서)
    const { data: apiConfigs, error } = await supabase
      .from('ai_api_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('model_name', model)
      .eq('enabled', true)
      .single()
    
    if (error || !apiConfigs) {
      return res.status(404).json({ error: 'API configuration not found' })
    }
    
    // 3. 암호화된 API 키 복호화
    const decryptedApiKey = ServerSideEncryption.decrypt(
      apiConfigs.api_key_encrypted,
      apiConfigs.iv
    )
    
    // 4. AI API 호출 (서버에서 대신 호출)
    const startTime = Date.now()
    const aiResponse = await aiProviders[provider](decryptedApiKey, model, messages)
    const responseTime = Date.now() - startTime
    
    // 5. 사용량 로그 기록
    await supabase.from('ai_assistant_logs').insert({
      user_id: userId,
      project_id: projectId,
      provider,
      model_name: model,
      user_message: messages[messages.length - 1]?.content || '',
      ai_response: JSON.stringify(aiResponse),
      response_time_ms: responseTime,
      tokens_used: aiResponse.usage?.total_tokens || 0
    })
    
    // 6. API 사용량 카운터 증가
    await supabase.rpc('increment_api_usage', {
      p_provider: provider,
      p_model_name: model
    })
    
    // 7. 안전한 응답 반환 (API 키는 절대 반환하지 않음)
    res.status(200).json({
      success: true,
      response: aiResponse,
      metadata: {
        provider,
        model,
        responseTime,
        tokensUsed: aiResponse.usage?.total_tokens || 0
      }
    })
    
  } catch (error) {
    console.error('Secure AI Proxy Error:', error)
    
    // 에러 로깅
    if (req.body.token) {
      try {
        const decoded = verifyToken(req.body.token)
        await supabase.from('ai_assistant_logs').insert({
          user_id: decoded.userId,
          project_id: req.body.projectId,
          provider: req.body.provider,
          model_name: req.body.model,
          user_message: req.body.messages?.[req.body.messages.length - 1]?.content || '',
          execution_success: false,
          execution_error: error.message
        })
      } catch (logError) {
        console.error('Error logging failed:', logError)
      }
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// JWT 토큰 생성 API
// pages/api/auth/generate-token.js
export async function generateUserToken(userId) {
  const payload = {
    userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24시간 유효
  }
  
  return jwt.sign(payload, JWT_SECRET)
}