/**
 * 🤖 자연어 AI 게임 개발 인터페이스
 * 코딩 없이 대화로 게임을 만드는 시스템
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { IntegratedGameEngine } from '../../../services/IntegratedGameEngine'
import { GameContext } from '../../../services/GameContextManager'

const NaturalLanguageGameDeveloper = ({ 
  gameData, 
  onGameUpdate, 
  onClose,
  existingCode = '',
  gameContext = {}
}) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'ai',
      content: '안녕하세요! 🎮 AI 게임 개발자입니다.\n\n어떤 게임을 만들고 싶으신가요? 예를 들어:\n\n• "점프하는 캐릭터 게임 만들어줘"\n• "퍼즐 게임에 점수 시스템 추가해줘"\n• "플레이어가 죽으면 게임오버 화면 보여줘"\n\n자연스럽게 말씀해주시면 제가 코드로 구현해드릴게요!',
      timestamp: Date.now()
    }
  ])
  
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [gameEngine] = useState(() => new IntegratedGameEngine({
    enableAnalytics: true,
    enableSecureAI: true,
    debugMode: true
  }))
  
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // 메시지가 추가될 때마다 스크롤을 맨 아래로
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // AI 응답 처리
  const handleAIResponse = async (userMessage) => {
    setIsProcessing(true)
    
    try {
      // 게임 컨텍스트 정보 수집
      const contextInfo = generateGameContext()
      
      // AI에게 전달할 프롬프트 구성
      const aiPrompt = `
게임 개발 요청: ${userMessage}

현재 게임 상황:
${contextInfo}

기존 코드:
\`\`\`javascript
${existingCode}
\`\`\`

위 요청에 따라 다음을 제공해주세요:

1. 📝 **구현 계획**: 사용자 요청을 어떻게 구현할지 간단히 설명
2. 💻 **코드**: 실행 가능한 JavaScript 코드 (함수 형태로)
3. 🎮 **사용법**: 생성된 코드를 어떻게 게임에 적용하는지 설명
4. ✨ **추가 제안**: 더 재미있게 만들 수 있는 아이디어

응답은 친근하고 이해하기 쉽게 해주세요!
      `.trim()
      
      // AI 코드 생성 요청
      const aiResponse = await gameEngine.generateCode(aiPrompt, {
        type: 'natural_language_development',
        userRequest: userMessage,
        gameContext: contextInfo,
        existingCode
      })
      
      // AI 응답을 메시지로 추가
      const aiMessage = {
        id: Date.now(),
        type: 'ai',
        content: aiResponse,
        timestamp: Date.now(),
        userRequest: userMessage
      }
      
      setMessages(prev => [...prev, aiMessage])
      
      // 코드가 포함되어 있으면 자동으로 게임에 적용할지 물어보기
      if (aiResponse.includes('```javascript') || aiResponse.includes('```js')) {
        setTimeout(() => {
          const confirmMessage = {
            id: Date.now() + 1,
            type: 'ai',
            content: '🚀 위의 코드를 게임에 바로 적용해드릴까요?\n\n**적용하기** 버튼을 클릭하면 게임이 업데이트됩니다!',
            timestamp: Date.now(),
            hasApplyButton: true,
            codeToApply: extractJavaScriptCode(aiResponse)
          }
          setMessages(prev => [...prev, confirmMessage])
        }, 1000)
      }
      
    } catch (error) {
      console.error('AI 응답 오류:', error)
      
      const errorMessage = {
        id: Date.now(),
        type: 'ai',
        content: '😅 죄송합니다! AI 응답 중 오류가 발생했습니다.\n\n다시 한번 말씀해주시거나, 조금 다르게 표현해보시면 도움을 드릴 수 있을 것 같아요!',
        timestamp: Date.now(),
        isError: true
      }
      
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsProcessing(false)
    }
  }

  // 사용자 메시지 전송
  const sendMessage = async () => {
    if (!inputText.trim() || isProcessing) return
    
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputText,
      timestamp: Date.now()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInputText('')
    
    // AI 응답 처리
    await handleAIResponse(inputText)
  }

  // 게임 컨텍스트 정보 생성 (실제 게임 상태 활용)
  const generateGameContext = () => {
    try {
      // 🧠 실제 게임 컨텍스트 매니저에서 정보 가져오기
      const aiContext = GameContext.getAIContext()
      const contextParts = []
      
      // AI 컨텍스트의 요약 정보 사용
      if (aiContext.summary) {
        contextParts.push(aiContext.summary)
      }
      
      // 플레이어 정보
      const playerIds = Object.keys(aiContext.players)
      if (playerIds.length > 0) {
        contextParts.push(`활성 플레이어: ${playerIds.length}명`)
        
        // 첫 번째 플레이어의 점수 정보
        const firstPlayer = aiContext.players[playerIds[0]]
        if (firstPlayer?.score !== undefined) {
          contextParts.push(`점수: ${firstPlayer.score}`)
        }
      }
      
      // 게임 변수 정보
      const variableCount = Object.keys(aiContext.variables).length
      if (variableCount > 0) {
        contextParts.push(`게임 변수: ${variableCount}개`)
      }
      
      // 최근 이벤트
      if (aiContext.recentEvents && aiContext.recentEvents.length > 0) {
        contextParts.push(`최근 활동: ${aiContext.recentEvents.length}개 이벤트`)
      }
      
      // 기존 코드 정보
      if (existingCode) {
        const functionCount = (existingCode.match(/function/g) || []).length
        const classCount = (existingCode.match(/class/g) || []).length
        contextParts.push(`코드: ${functionCount}개 함수, ${classCount}개 클래스`)
      }
      
      return contextParts.length > 0 ? contextParts.join(' | ') : '새로운 게임'
      
    } catch (error) {
      console.error('게임 컨텍스트 생성 오류:', error)
      
      // 폴백: 기본 정보 사용
      const context = []
      
      if (gameContext.players) {
        context.push(`플레이어 수: ${gameContext.players}명`)
      }
      
      if (gameContext.gameType) {
        context.push(`게임 유형: ${gameContext.gameType}`)
      }
      
      if (gameContext.currentLevel) {
        context.push(`현재 레벨: ${gameContext.currentLevel}`)
      }
      
      if (gameContext.score !== undefined) {
        context.push(`현재 점수: ${gameContext.score}`)
      }
      
      return context.length > 0 ? context.join(', ') : '새로운 게임'
    }
  }

  // JavaScript 코드 추출
  const extractJavaScriptCode = (aiResponse) => {
    const codeBlocks = aiResponse.match(/```(?:javascript|js)\n([\s\S]*?)```/g)
    if (!codeBlocks) return ''
    
    return codeBlocks.map(block => 
      block.replace(/```(?:javascript|js)\n/, '').replace(/```$/, '')
    ).join('\n\n')
  }

  // 코드 적용
  const applyCode = (code) => {
    if (onGameUpdate) {
      onGameUpdate({
        type: 'code_update',
        code: code,
        source: 'natural_language_ai'
      })
    }
    
    // 성공 메시지 추가
    const successMessage = {
      id: Date.now(),
      type: 'ai',
      content: '✅ 코드가 게임에 적용되었습니다!\n\n게임을 테스트해보시고, 추가로 수정하고 싶은 부분이 있으면 언제든 말씀해주세요!',
      timestamp: Date.now(),
      isSuccess: true
    }
    
    setMessages(prev => [...prev, successMessage])
  }

  // 빠른 제안 버튼들
  const quickSuggestions = [
    { text: '점프 기능 추가해줘', emoji: '🦘' },
    { text: '적 캐릭터 만들어줘', emoji: '👾' },
    { text: '점수 시스템 넣어줘', emoji: '🏆' },
    { text: '사운드 효과 추가해줘', emoji: '🔊' },
    { text: '게임오버 화면 만들어줘', emoji: '💀' },
    { text: '파워업 아이템 만들어줘', emoji: '⚡' },
    { text: '배경음악 넣어줘', emoji: '🎵' },
    { text: '레벨 시스템 만들어줘', emoji: '🎯' }
  ]

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e40af 100%)',
        borderRadius: 24,
        padding: 0,
        width: '90vw',
        height: '85vh',
        maxWidth: 1000,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '20px 24px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20
            }}>
              🤖
            </div>
            <div>
              <h2 style={{ 
                margin: 0, 
                color: '#ffffff', 
                fontSize: 18,
                fontWeight: 700
              }}>
                AI 게임 개발자
              </h2>
              <p style={{ 
                margin: 0, 
                color: '#cbd5e1', 
                fontSize: 14 
              }}>
                자연어로 게임을 만들어보세요
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 12,
              color: '#ffffff',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            ✕ 닫기
          </button>
        </div>

        {/* 빠른 제안 버튼들 */}
        <div style={{
          padding: '16px 24px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            {quickSuggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => setInputText(suggestion.text)}
                disabled={isProcessing}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 20,
                  color: '#ffffff',
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  opacity: isProcessing ? 0.5 : 1,
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
                onMouseOver={(e) => {
                  if (!isProcessing) {
                    e.target.style.background = 'rgba(255, 255, 255, 0.2)'
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.1)'
                }}
              >
                {suggestion.emoji} {suggestion.text}
              </button>
            ))}
          </div>
        </div>

        {/* 채팅 영역 */}
        <div style={{
          flex: 1,
          padding: '20px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                display: 'flex',
                flexDirection: message.type === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                gap: 12
              }}
            >
              {/* 아바타 */}
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: message.type === 'user' 
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : message.isError
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  : message.isSuccess
                  ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                  : 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0
              }}>
                {message.type === 'user' ? '👤' : message.isError ? '😅' : message.isSuccess ? '✅' : '🤖'}
              </div>

              {/* 메시지 */}
              <div style={{
                background: message.type === 'user'
                  ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                  : 'rgba(255, 255, 255, 0.1)',
                borderRadius: 16,
                padding: '12px 16px',
                maxWidth: '70%',
                border: message.type === 'user' 
                  ? 'none'
                  : '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: '#ffffff'
                }}>
                  {message.content}
                </pre>

                {/* 코드 적용 버튼 */}
                {message.hasApplyButton && message.codeToApply && (
                  <button
                    onClick={() => applyCode(message.codeToApply)}
                    style={{
                      marginTop: 12,
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      border: 'none',
                      borderRadius: 12,
                      color: '#ffffff',
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)'
                    }}
                  >
                    🚀 게임에 적용하기
                  </button>
                )}

                {/* 타임스탬프 */}
                <div style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: 'rgba(255, 255, 255, 0.6)',
                  textAlign: message.type === 'user' ? 'right' : 'left'
                }}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {/* AI 처리 중 표시 */}
          {isProcessing && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16
              }}>
                🤖
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 16,
                padding: '12px 16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#8b5cf6',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#06b6d4',
                  animation: 'pulse 1.5s ease-in-out infinite 0.2s'
                }} />
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#10b981',
                  animation: 'pulse 1.5s ease-in-out infinite 0.4s'
                }} />
                <span style={{
                  color: '#cbd5e1',
                  fontSize: 14,
                  marginLeft: 4
                }}>
                  AI가 코드를 작성하고 있습니다...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 */}
        <div style={{
          padding: '20px 24px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end'
          }}>
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="어떤 게임 기능을 만들고 싶으신가요? (예: 점프하는 캐릭터 만들어줘)"
              disabled={isProcessing}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 16,
                color: '#ffffff',
                padding: '12px 16px',
                fontSize: 14,
                resize: 'none',
                minHeight: 48,
                maxHeight: 120,
                fontFamily: 'inherit',
                outline: 'none'
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!inputText.trim() || isProcessing}
              style={{
                background: inputText.trim() && !isProcessing
                  ? 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)'
                  : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: 16,
                color: '#ffffff',
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: inputText.trim() && !isProcessing ? 'pointer' : 'not-allowed',
                opacity: inputText.trim() && !isProcessing ? 1 : 0.5,
                boxShadow: inputText.trim() && !isProcessing 
                  ? '0 4px 12px rgba(139, 92, 246, 0.4)' 
                  : 'none'
              }}
            >
              {isProcessing ? '🤖 처리중...' : '📤 전송'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}

export default NaturalLanguageGameDeveloper