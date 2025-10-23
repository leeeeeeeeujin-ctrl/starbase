/**
 * Real Game Simulator (Read-only mode)
 * 
 * Fetches real data from Supabase (heroes, game config, roles)
 * Uses actual matching logic from lib/rank/matching.js
 * Uses actual game engine from components/rank/StartClient/useStartClientEngine.js
 * BUT: All state stored in-memory, no writes to Supabase
 * 
 * This lets you test full game flows locally without affecting production data.
 */
import { matchRankParticipants, matchCasualParticipants } from './rank/matching'
import { buildSystemMessage, parseRules } from '../components/rank/StartClient/engine/systemPrompt'
import { parseOutcome } from './promptEngine'

class RealGameSimulator {
  constructor() {
    this.sessions = new Map() // sessionId -> { gameId, participants, history, state, config }
  }

  /**
   * Create a new simulation session with real hero data
   * @param {object} supabaseClient - Supabase client (read-only usage)
   * @param {object} params
   * @param {string} params.gameId - Real game ID from rank_games
   * @param {string} params.mode - Match mode (rank_solo, casual_match, etc)
   * @param {array} params.heroIds - Array of real hero IDs to participate
   * @param {object} params.config - { apiKey, apiVersion, turnTimer }
   */
  async createSession(supabaseClient, { gameId, mode, heroIds = [], config = {} }) {
    const sessionId = `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // 1. Fetch real game data
    const { data: game, error: gameError } = await supabaseClient
      .from('rank_games')
      .select('id, name, rules, description')
      .eq('id', gameId)
      .single()

    if (gameError) throw new Error(`Game not found: ${gameError.message}`)

    // 2. Fetch real roles
    const { data: roles, error: rolesError } = await supabaseClient
      .from('rank_game_roles')
      .select('id, name, slot_count, active')
      .eq('game_id', gameId)
      .eq('active', true)

    if (rolesError) throw new Error(`Failed to fetch roles: ${rolesError.message}`)

    // 3. Fetch real heroes
    const { data: heroes, error: heroesError } = await supabaseClient
      .from('heroes')
      .select('id, name, prompt, abilities, tags, image_url, background_url')
      .in('id', heroIds)

    if (heroesError) throw new Error(`Failed to fetch heroes: ${heroesError.message}`)

    if (heroes.length !== heroIds.length) {
      throw new Error(`Some heroes not found. Expected ${heroIds.length}, got ${heroes.length}`)
    }

    // 4. Build participants (assign roles via matching logic)
    const queueEntries = heroes.map((hero, index) => ({
      id: `queue-${index}`,
      owner_id: `sim-user-${index}`,
      hero_id: hero.id,
      role: roles[index % roles.length]?.name || 'fighter',
      score: 1000,
      joined_at: new Date().toISOString(),
    }))

    const matchResult = mode.includes('casual')
      ? matchCasualParticipants({ roles: roles.map(r => ({ name: r.name, slot_count: r.slot_count })), queue: queueEntries })
      : matchRankParticipants({ roles: roles.map(r => ({ name: r.name, slot_count: r.slot_count })), queue: queueEntries })

    if (!matchResult.ready) {
      throw new Error(`Match not ready: ${JSON.stringify(matchResult.error)}`)
    }

    // 5. Build slots from assignments
    const slots = []
    matchResult.assignments.forEach(assignment => {
      assignment.members.forEach(member => {
        const hero = heroes.find(h => h.id === member.hero_id)
        if (hero) {
          slots.push({
            slotIndex: slots.length,
            role: assignment.role,
            ownerId: member.owner_id,
            heroId: hero.id,
            hero,
            ready: true,
          })
        }
      })
    })

    // 6. Parse rules and initialize game state
    const rules = parseRules(game.rules)
    const endConditionVariable = rules?.end_condition_variable || null
    const brawlEnabled = rules?.brawl_rule === 'allow-brawl'

    const session = {
      id: sessionId,
      gameId,
      game,
      mode,
      roles,
      slots,
      heroes,
      participants: slots,
      config: {
        apiKey: config.apiKey || null,
        apiVersion: config.apiVersion || 'gpt-4',
        turnTimer: config.turnTimer || 60,
      },
      state: {
        turn: 0,
        currentNodeId: null,
        endConditionVariable,
        brawlEnabled,
        winCount: 0,
        statusMessage: 'Ready to start',
        finished: false,
      },
      history: [
        {
          idx: 0,
          role: 'system',
          content: 'Simulation session created',
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: Date.now(),
    }

    this.sessions.set(sessionId, session)
    return this.getSnapshot(sessionId)
  }

  /**
   * Advance one turn using real game engine logic
   * @param {string} sessionId
   * @param {string} userInput - Player action/response
   * @param {object} aiClient - Function to call AI API: async (messages) => { text }
   */
  async advanceTurn(sessionId, userInput, aiClient) {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')
    if (session.state.finished) throw new Error('Session already finished')

    const turn = session.state.turn + 1
    
    // Use real prompt engine
    const systemPrompt = buildSystemMessage({
      gameName: session.game.name,
      gameDescription: session.game.description || '',
      rules: session.game.rules,
    })

    // Build messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...session.history.filter(h => h.role !== 'system').map(h => ({
        role: h.role === 'player' ? 'user' : 'assistant',
        content: h.content,
      })),
      { role: 'user', content: userInput },
    ]

    // Call AI
    const aiResponse = await aiClient(messages)

    // Parse outcome using real logic
    const outcome = parseOutcome(aiResponse.text)

    // Add to history
    session.history.push({
      idx: turn * 2 - 1,
      role: 'player',
      content: userInput,
      createdAt: new Date().toISOString(),
    })

    session.history.push({
      idx: turn * 2,
      role: 'assistant',
      content: aiResponse.text,
      outcome,
      createdAt: new Date().toISOString(),
    })

    // Update state based on outcome
    session.state.turn = turn
    
    const outcomeVariables = outcome.variables || []
    const triggeredEnd = session.state.endConditionVariable
      ? outcomeVariables.includes(session.state.endConditionVariable)
      : false

    if (outcome.action === 'win') {
      session.state.winCount++
      if (session.state.brawlEnabled && !triggeredEnd) {
        session.state.statusMessage = `승리 ${session.state.winCount}회! 난입 허용으로 계속됩니다.`
      } else {
        session.state.finished = true
        session.state.statusMessage = `승리! 총 ${session.state.winCount}회 승리`
      }
    } else if (outcome.action === 'lose') {
      session.state.finished = true
      session.state.statusMessage = session.state.brawlEnabled
        ? `패배. 누적 승리 ${session.state.winCount}회 기록`
        : '패배'
    } else if (outcome.action === 'draw') {
      session.state.finished = true
      session.state.statusMessage = '무승부'
    }

    session.updatedAt = Date.now()
    return this.getSnapshot(sessionId)
  }

  /**
   * Get current session snapshot
   */
  getSnapshot(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')

    return {
      sessionId: session.id,
      gameId: session.gameId,
      gameName: session.game.name,
      mode: session.mode,
      slots: session.slots.map(s => ({
        slotIndex: s.slotIndex,
        role: s.role,
        heroId: s.heroId,
        heroName: s.hero?.name,
        heroImage: s.hero?.image_url,
      })),
      state: { ...session.state },
      history: session.history,
      config: session.config,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }
  }

  /**
   * List all active sessions
   */
  listSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      gameId: s.gameId,
      gameName: s.game.name,
      mode: s.mode,
      turn: s.state.turn,
      finished: s.state.finished,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))
  }

  /**
   * Reset/delete session
   */
  resetSession(sessionId) {
    this.sessions.delete(sessionId)
    return { ok: true }
  }
}

const singleton = new RealGameSimulator()

export function getRealGameSimulator() {
  return singleton
}
