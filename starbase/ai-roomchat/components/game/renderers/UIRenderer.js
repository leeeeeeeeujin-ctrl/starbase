/**
 * UIRenderer - UI 오버레이 렌더링 모듈
 * HUD, 메뉴, 대화 상자 등 UI 요소를 렌더링
 */
export default class UIRenderer {
  constructor(options = {}) {
    this.container = null
    this.elements = {}
    this.options = {
      theme: 'dark',
      fontSize: 'medium',
      ...options,
    }
    this.isInitialized = false
  }

  /**
   * UI 렌더러 초기화
   */
  async initialize(containerElement) {
    try {
      if (!containerElement) {
        throw new Error('Container element is required')
      }

      this.container = document.createElement('div')
      this.container.style.position = 'absolute'
      this.container.style.top = '0'
      this.container.style.left = '0'
      this.container.style.width = '100%'
      this.container.style.height = '100%'
      this.container.style.pointerEvents = 'none'
      this.container.style.zIndex = '10'
      
      containerElement.appendChild(this.container)
      
      this.isInitialized = true
      return true
    } catch (error) {
      console.error('[UIRenderer] 초기화 실패:', error)
      return false
    }
  }

  /**
   * UI 렌더링
   */
  render(gameState, executionState) {
    if (!this.isInitialized || !this.container) return

    try {
      // HUD 렌더링
      this.renderHUD(gameState, executionState)

      // 대화 상자 렌더링
      this.renderDialogue(gameState, executionState)

      // 액션 버튼 렌더링
      this.renderActionButtons(executionState)
    } catch (error) {
      console.error('[UIRenderer] 렌더링 오류:', error)
    }
  }

  /**
   * HUD 렌더링
   */
  renderHUD(gameState, executionState) {
    const hudId = 'game-hud'
    let hud = this.elements[hudId]

    if (!hud) {
      hud = document.createElement('div')
      hud.id = hudId
      hud.style.position = 'absolute'
      hud.style.top = '20px'
      hud.style.right = '20px'
      hud.style.padding = '16px'
      hud.style.background = 'rgba(0,0,0,0.7)'
      hud.style.borderRadius = '8px'
      hud.style.color = 'white'
      hud.style.fontSize = '14px'
      hud.style.pointerEvents = 'auto'
      this.container.appendChild(hud)
      this.elements[hudId] = hud
    }

    // HUD 내용 업데이트
    const { characterData } = gameState
    const { currentTurn, gamePhase } = executionState
    
    hud.innerHTML = `
      <div><strong>캐릭터:</strong> ${characterData?.name || '알 수 없음'}</div>
      <div><strong>턴:</strong> ${currentTurn}</div>
      <div><strong>상태:</strong> ${gamePhase}</div>
      <div><strong>HP:</strong> ${gameState.variables['{{캐릭터.HP}}'] || 100}</div>
    `
  }

  /**
   * 대화 상자 렌더링
   */
  renderDialogue(gameState, executionState) {
    const dialogueId = 'game-dialogue'
    let dialogue = this.elements[dialogueId]

    if (!dialogue) {
      dialogue = document.createElement('div')
      dialogue.id = dialogueId
      dialogue.style.position = 'absolute'
      dialogue.style.bottom = '20px'
      dialogue.style.left = '50%'
      dialogue.style.transform = 'translateX(-50%)'
      dialogue.style.width = '80%'
      dialogue.style.maxWidth = '600px'
      dialogue.style.padding = '16px 20px'
      dialogue.style.background = 'rgba(0,0,0,0.8)'
      dialogue.style.borderRadius = '12px'
      dialogue.style.color = 'white'
      dialogue.style.fontSize = '16px'
      dialogue.style.pointerEvents = 'auto'
      this.container.appendChild(dialogue)
      this.elements[dialogueId] = dialogue
    }

    // 대화 내용 업데이트
    const { lastResponse } = executionState
    if (lastResponse) {
      dialogue.textContent = lastResponse
      dialogue.style.display = 'block'
    } else {
      dialogue.style.display = 'none'
    }
  }

  /**
   * 액션 버튼 렌더링
   */
  renderActionButtons(executionState) {
    // 이 메서드는 나중에 필요 시 구현
    // 현재는 UnifiedGameSystem에서 직접 관리
  }

  /**
   * UI 요소 숨기기
   */
  hide(elementId) {
    const element = this.elements[elementId]
    if (element) {
      element.style.display = 'none'
    }
  }

  /**
   * UI 요소 표시
   */
  show(elementId) {
    const element = this.elements[elementId]
    if (element) {
      element.style.display = 'block'
    }
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container)
    }
    this.container = null
    this.elements = {}
    this.isInitialized = false
  }
}
