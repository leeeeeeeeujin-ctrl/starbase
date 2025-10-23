/**
 * @jest-environment jsdom
 */

import TestRenderer, { act } from 'react-test-renderer'

import TurnInfoPanel from '@/components/rank/StartClient/TurnInfoPanel'

describe('TurnInfoPanel', () => {
  const baseProps = {
    turn: 1,
    currentNode: { id: 'node-1', slot_no: 1 },
    activeGlobal: [],
    activeLocal: [],
    apiKey: '',
    onApiKeyChange: jest.fn(),
    apiVersion: 'gemini',
    onApiVersionChange: jest.fn(),
    geminiMode: 'chat',
    onGeminiModeChange: jest.fn(),
    geminiModel: 'gemini-pro',
    onGeminiModelChange: jest.fn(),
    geminiModelOptions: [],
    geminiModelLoading: false,
    geminiModelError: '',
    onReloadGeminiModels: jest.fn(),
    realtimeLockNotice: '',
    apiKeyNotice: '',
    currentActor: { name: '주역', role: 'leader' },
  }

  beforeEach(() => {
    const vibrateMock = jest.fn()
    Object.defineProperty(global, 'navigator', {
      value: { vibrate: vibrateMock },
      configurable: true,
      writable: true,
    })
  })

  it('highlights critical timer and triggers vibration', () => {
    let renderer
    act(() => {
      renderer = TestRenderer.create(
        <TurnInfoPanel
          {...baseProps}
          turnTimerSeconds={60}
          timeRemaining={9}
        />,
      )
    })

    const vibrateMock = navigator.vibrate
    expect(vibrateMock).toHaveBeenCalledWith(200)

    const spanNodes = renderer.root.findAll((node) => node.type === 'span')
    const timerNode = spanNodes.find((node) =>
      Array.isArray(node.props.children)
        ? node.props.children.join('') === '남은 시간 09초'
        : node.props.children === '남은 시간 09초',
    )

    expect(timerNode).toBeTruthy()
    expect(timerNode.props.style.background).toBe('rgba(248, 113, 113, 0.28)')
    expect(timerNode.props['aria-live']).toBe('assertive')

    act(() => {
      renderer.update(
        <TurnInfoPanel
          {...baseProps}
          turnTimerSeconds={60}
          timeRemaining={8}
        />,
      )
    })

    expect(vibrateMock).toHaveBeenCalledTimes(2)
  })
})
