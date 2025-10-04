/**
 * @jest-environment jsdom
 */

import React from 'react'
import { act, create } from 'react-test-renderer'

const mockStoreActiveSessionRecord = jest.fn()
const mockUpdateActiveSessionRecord = jest.fn()
const mockClearActiveSessionRecord = jest.fn()
const mockMarkActiveSessionDefeated = jest.fn()

const mockPurgeExpiredCooldowns = jest.fn()
const mockGetApiKeyCooldown = jest.fn()
const mockMarkApiKeyCooldown = jest.fn()

jest.mock('../../../../../lib/rank/activeSessionStorage', () => ({
  storeActiveSessionRecord: (...args) => mockStoreActiveSessionRecord(...args),
  updateActiveSessionRecord: (...args) => mockUpdateActiveSessionRecord(...args),
  clearActiveSessionRecord: (...args) => mockClearActiveSessionRecord(...args),
  markActiveSessionDefeated: (...args) => mockMarkActiveSessionDefeated(...args),
}))

jest.mock('../../../../../lib/rank/apiKeyCooldown', () => ({
  purgeExpiredCooldowns: (...args) => mockPurgeExpiredCooldowns(...args),
  getApiKeyCooldown: (...args) => mockGetApiKeyCooldown(...args),
  markApiKeyCooldown: (...args) => mockMarkApiKeyCooldown(...args),
}))

jest.mock('../../../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
  },
}))

const mockReloadGeminiModels = jest.fn()

jest.mock('../../../../../components/rank/hooks/useGeminiModelCatalog', () => ({
  __esModule: true,
  default: () => ({
    options: [{ id: 'gemini-pro', label: 'Gemini Pro' }],
    loading: false,
    error: null,
    reload: mockReloadGeminiModels,
  }),
}))

import { useHistoryBuffer } from '../../../../../components/rank/StartClient/hooks/useHistoryBuffer'
import { useStartManualResponse } from '../../../../../components/rank/StartClient/hooks/useStartManualResponse'
import { useStartCooldown } from '../../../../../components/rank/StartClient/hooks/useStartCooldown'
import { useStartSessionLifecycle } from '../../../../../components/rank/StartClient/hooks/useStartSessionLifecycle'
import { useStartApiKeyManager } from '../../../../../components/rank/StartClient/hooks/useStartApiKeyManager'

function renderHook(callback, props) {
  let result
  const Test = (hookProps) => {
    result = callback(hookProps)
    return null
  }
  const renderer = create(<Test {...props} />)
  return {
    get result() {
      return result
    },
    rerender: (nextProps) => {
      act(() => {
        renderer.update(<Test {...nextProps} />)
      })
    },
    unmount: () => {
      renderer.unmount()
    },
  }
}

describe('StartClient hooks', () => {
  beforeEach(() => {
    mockStoreActiveSessionRecord.mockClear()
    mockUpdateActiveSessionRecord.mockClear()
    mockClearActiveSessionRecord.mockClear()
    mockMarkActiveSessionDefeated.mockClear()
    mockPurgeExpiredCooldowns.mockClear()
    mockGetApiKeyCooldown.mockClear()
    mockMarkApiKeyCooldown.mockClear()
    mockReloadGeminiModels.mockClear()
    if (window.sessionStorage) window.sessionStorage.clear()
    if (window.localStorage) window.localStorage.clear()
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    )
  })

  it('increments history version when bumping', () => {
    const hook = renderHook(() => useHistoryBuffer())
    expect(hook.result.historyVersion).toBe(0)
    act(() => {
      hook.result.bumpHistoryVersion()
    })
    expect(hook.result.historyVersion).toBe(1)
    expect(typeof hook.result.history.push).toBe('function')
  })

  it('enforces manual response requirement with custom alert', () => {
    const alertMock = jest.fn()
    const hook = renderHook(() => useStartManualResponse({ onAlert: alertMock }))

    expect(hook.result.requireManualResponse()).toBeNull()
    expect(alertMock).toHaveBeenCalledWith('수동 응답을 입력하세요.')

    act(() => {
      hook.result.setManualResponse('  수동 입력  ')
    })
    expect(hook.result.requireManualResponse()).toBe('수동 입력')
  })

  it('checks cooldowns and voids session via useStartCooldown', () => {
    const evaluate = jest.fn(() => ({
      active: true,
      remainingMs: 1500,
      keySample: 'abc',
      reason: 'quota_exhausted',
    }))
    const applyCooldownInfo = jest.fn()
    const setStatusMessage = jest.fn()
    const setGameVoided = jest.fn()
    const setCurrentNodeId = jest.fn()
    const setTurnDeadline = jest.fn()
    const setTimeRemaining = jest.fn()
    const clearConsensusVotes = jest.fn()
    const updateHeroAssets = jest.fn()
    const updateSessionRecord = jest.fn()
    const clearSessionRecord = jest.fn()

    const hook = renderHook(() =>
      useStartCooldown({
        evaluateApiKeyCooldown: evaluate,
        applyCooldownInfo,
        setStatusMessage,
        setGameVoided,
        setCurrentNodeId,
        setTurnDeadline,
        setTimeRemaining,
        clearConsensusVotes,
        updateHeroAssets,
        updateSessionRecord,
        clearSessionRecord,
        viewerId: 'viewer-1',
        apiVersion: 'openai',
        gameId: 'game-1',
        game: { id: 'game-1' },
        sessionInfo: { id: 'session-1' },
      }),
    )

    expect(hook.result.ensureApiKeyReady('test-key')).toBe(false)
    expect(setStatusMessage).toHaveBeenCalledWith(
      expect.stringContaining('최근 사용한 API 키'),
    )

    mockMarkApiKeyCooldown.mockReturnValue({
      active: true,
      remainingMs: 1800,
      keySample: 'abc',
      reason: 'quota_exhausted',
    })

    hook.result.voidSession(null, { apiKey: 'test-key', reason: 'quota_exhausted' })

    expect(mockMarkApiKeyCooldown).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({ reason: 'quota_exhausted', provider: 'openai' }),
    )
    expect(applyCooldownInfo).toHaveBeenCalled()
    expect(setGameVoided).toHaveBeenCalledWith(true)
    expect(updateHeroAssets).toHaveBeenCalledWith([], null)
    expect(updateSessionRecord).toHaveBeenCalledWith({ status: 'voided', actorNames: [] })
    expect(clearConsensusVotes).toHaveBeenCalled()
    expect(clearSessionRecord).toHaveBeenCalled()
  })

  it('persists active session lifecycle records', () => {
    const realtimeReset = jest.fn(() => ({ presence: [] }))
    const dropInReset = jest.fn()
    const asyncReset = jest.fn()
    const applyRealtimeSnapshot = jest.fn()
    const setSessionInfo = jest.fn()
    const setTurnDeadline = jest.fn()
    const setTimeRemaining = jest.fn()

    const hook = renderHook(() =>
      useStartSessionLifecycle({
        gameId: 'game-1',
        game: { name: '테스트', description: '설명' },
        activeActorNames: ['Hero'],
        sessionInfo: { id: 'session-1' },
        setSessionInfo,
        realtimeManagerRef: { current: { reset: realtimeReset } },
        dropInQueueRef: { current: { reset: dropInReset } },
        asyncSessionManagerRef: { current: { reset: asyncReset } },
        applyRealtimeSnapshot,
        setTurnDeadline,
        setTimeRemaining,
      }),
    )

    act(() => {
      hook.result.rememberActiveSession({ turn: 3 })
    })
    expect(mockStoreActiveSessionRecord).toHaveBeenCalledWith(
      'game-1',
      expect.objectContaining({ turn: 3 }),
    )

    act(() => {
      hook.result.updateSessionRecord({ actorNames: ['Another'] })
    })
    expect(mockUpdateActiveSessionRecord).toHaveBeenCalledWith(
      'game-1',
      expect.objectContaining({ actorNames: ['Another'] }),
    )

    act(() => {
      hook.result.clearSessionRecord()
    })
    expect(mockClearActiveSessionRecord).toHaveBeenCalledWith('game-1')
    expect(realtimeReset).toHaveBeenCalled()
    expect(dropInReset).toHaveBeenCalled()
    expect(asyncReset).toHaveBeenCalled()
    expect(applyRealtimeSnapshot).toHaveBeenCalledWith({ presence: [] })
    expect(setSessionInfo).toHaveBeenCalledWith(null)
    expect(setTurnDeadline).toHaveBeenCalledWith(null)
    expect(setTimeRemaining).toHaveBeenCalledWith(null)

    act(() => {
      hook.result.markSessionDefeated()
    })
    expect(mockMarkActiveSessionDefeated).toHaveBeenCalledWith('game-1')
  })

  it('tracks API key changes and emits timeline events', async () => {
    mockPurgeExpiredCooldowns.mockReturnValue(new Map())
    mockGetApiKeyCooldown.mockReturnValue(null)

    const recordTimelineEvents = jest.fn()
    const hook = renderHook(() =>
      useStartApiKeyManager({
        initialApiKey: '',
        initialApiVersion: 'openai',
        viewerId: 'viewer-1',
        turn: 4,
        recordTimelineEvents,
      }),
    )

    await act(async () => {
      hook.result.setApiKey('  sample-key  ', {
        source: 'pool',
        reason: 'rotation',
        poolId: 'pool-1',
      })
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(window.sessionStorage.getItem('rank.start.apiKey')).toBe('sample-key')
    expect(recordTimelineEvents).toHaveBeenCalled()
    const call = recordTimelineEvents.mock.calls.find(
      (entry) => Array.isArray(entry[0]) && entry[0][0]?.type === 'api_key_pool_replaced',
    )
    expect(call).toBeTruthy()
    expect(call[0][0].metadata.apiKeyPool).toMatchObject({
      source: 'pool',
      reason: 'rotation',
      poolId: 'pool-1',
    })
  })
})
