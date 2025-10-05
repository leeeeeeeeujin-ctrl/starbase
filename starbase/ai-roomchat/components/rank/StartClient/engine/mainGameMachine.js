export const initialMainGameState = {
  loading: true,
  error: '',
  game: null,
  participants: [],
  slotLayout: [],
  graph: { nodes: [], edges: [] },
  preflight: true,
  turn: 1,
  currentNodeId: null,
  activeGlobal: [],
  activeLocal: [],
  logs: [],
  battleLogDraft: null,
  statusMessage: '',
  promptMetaWarning: '',
  isAdvancing: false,
  winCount: 0,
  lastDropInTurn: null,
  viewerId: null,
  turnDeadline: null,
  timeRemaining: null,
  activeHeroAssets: {
    backgrounds: [],
    bgmUrl: null,
    bgmDuration: null,
    audioProfile: null,
  },
  activeActorNames: [],
}

const ACTIONS = {
  RESET: 'mainGame/reset',
  PATCH: 'mainGame/patch',
  REPLACE_LOGS: 'mainGame/replaceLogs',
  APPEND_LOGS: 'mainGame/appendLogs',
}

export function mainGameReducer(state, action) {
  switch (action.type) {
    case ACTIONS.RESET: {
      return { ...initialMainGameState, ...(action.payload || {}) }
    }
    case ACTIONS.PATCH: {
      if (!action.payload || typeof action.payload !== 'object') {
        return state
      }
      return { ...state, ...action.payload }
    }
    case ACTIONS.REPLACE_LOGS: {
      const nextLogs = Array.isArray(action.payload) ? [...action.payload] : []
      return { ...state, logs: nextLogs }
    }
    case ACTIONS.APPEND_LOGS: {
      if (!Array.isArray(action.payload) || action.payload.length === 0) {
        return state
      }
      return { ...state, logs: [...state.logs, ...action.payload] }
    }
    default:
      return state
  }
}

export const resetMainGameState = (payload = {}) => ({
  type: ACTIONS.RESET,
  payload,
})

export const patchMainGameState = (payload = {}) => ({
  type: ACTIONS.PATCH,
  payload,
})

export const replaceMainGameLogs = (entries = []) => ({
  type: ACTIONS.REPLACE_LOGS,
  payload: entries,
})

export const appendMainGameLogs = (entries = []) => ({
  type: ACTIONS.APPEND_LOGS,
  payload: entries,
})
