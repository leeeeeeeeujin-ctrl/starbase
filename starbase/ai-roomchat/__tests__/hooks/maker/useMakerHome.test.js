/**
 * @jest-environment jsdom
 */

import React from 'react'
import { act, create } from 'react-test-renderer'

import { success, failure } from '../../../lib/maker/promptSets/result'
import { useMakerHome } from '../../../hooks/maker/useMakerHome'

const mockGetUser = jest.fn()
const mockList = jest.fn()
const mockCreate = jest.fn()
const mockRename = jest.fn()
const mockRemove = jest.fn()
const mockInsertBundle = jest.fn()
const mockReadBundle = jest.fn()

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args) => mockGetUser(...args),
    },
  },
}))

jest.mock('../../../lib/maker/promptSets', () => {
  const actual = jest.requireActual('../../../lib/maker/promptSets')
  return {
    ...actual,
    promptSetsRepository: {
      list: (...args) => mockList(...args),
      create: (...args) => mockCreate(...args),
      rename: (...args) => mockRename(...args),
      remove: (...args) => mockRemove(...args),
    },
    insertPromptSetBundle: (...args) => mockInsertBundle(...args),
    readPromptSetBundle: (...args) => mockReadBundle(...args),
  }
})

function renderHook(props = {}) {
  let result
  const Test = (testProps) => {
    result = useMakerHome(testProps)
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
    unmount: () => renderer.unmount(),
  }
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('useMakerHome', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockList.mockReset()
    mockCreate.mockReset()
    mockRename.mockReset()
    mockRemove.mockReset()
    mockInsertBundle.mockReset()
    mockReadBundle.mockReset()
    if (window.localStorage) window.localStorage.clear()
    if (window.sessionStorage) window.sessionStorage.clear()
  })

  it('invokes onUnauthorized when no user is returned', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockList.mockResolvedValue(success([]))
    const onUnauthorized = jest.fn()

    const hook = renderHook({ onUnauthorized })
    await flushPromises()
    await flushPromises()

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(hook.result.loading).toBe(false)
    expect(hook.result.rows).toEqual([])
  })

  it('refreshes prompt sets for the authenticated user', async () => {
    const userId = 'user-1'
    mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
    const rows = [
      { id: 'set-a', name: 'A', created_at: '2023-02-03T00:00:00Z' },
      { id: 'set-b', name: 'B', created_at: '2023-02-02T00:00:00Z' },
    ]
    mockList.mockResolvedValue(success(rows))

    const hook = renderHook()
    // Wait for hydration + bootstrap effects to run reliably in CI
    for (let i = 0; i < 10 && mockList.mock.calls.length === 0; i += 1) {
      await flushPromises()
    }

    expect(mockList).toHaveBeenCalledWith(userId)
    expect(hook.result.loading).toBe(false)
    expect(hook.result.rows.map((row) => row.id)).toEqual(['set-a', 'set-b'])

    mockList.mockResolvedValue(failure(new Error('불러오기 실패')))

    await act(async () => {
      await hook.result.refresh()
    })
    await flushPromises()

    expect(hook.result.errorMessage).toBe('불러오기 실패')
  })

  it('imports prompt set bundles and records version notices', async () => {
    const userId = 'designer-123'
    mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
    mockList.mockResolvedValue(success([]))
    mockInsertBundle.mockResolvedValue(success({ id: 'set-99' }))

    const hook = renderHook()
    await flushPromises()
    // Ensure hydration + auth bootstrap completes so userId is set before import
    for (let i = 0; i < 5 && mockList.mock.calls.length === 0; i += 1) {
      await flushPromises()
    }

    const payload = {
      meta: { variableRulesVersion: 99 },
      set: { name: 'Legacy' },
    }
    const file = {
      text: () => Promise.resolve(JSON.stringify(payload)),
    }

    await act(async () => {
      await hook.result.importFromFile(file)
    })

    expect(mockInsertBundle).toHaveBeenCalledWith(userId, {
      meta: { variableRulesVersion: 99 },
      set: { name: 'Legacy' },
      slots: [],
      bridges: [],
    })
    expect(hook.result.noticeMessage).toContain('v99')
  })
})
