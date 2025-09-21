// lib/aiHistory.js
import { useRef, useState } from 'react'
import { supabase } from './supabase'
// lib/aiHistory.js (핵심 부분 예시)
export function useAiHistory({ gameId }) {
  const [sessionId, setSessionId] = useState(null)
  const [memory, setMemory] = useState([]) // 로컬 캐시

  async function beginSession() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('로그인 필요')

    // rank_sessions insert (이미 구현/수정한 버전 사용)
    const ins = await supabase
      .from('rank_sessions')
      .insert({ game_id: gameId, status: 'active', turn: 0 })
      .select('*')
      .single()

    if (ins.error) throw ins.error
    setSessionId(ins.data.id)
    setMemory([]) // 새 세션이니 클리어
    return ins.data
  }

  async function push({ role, content, public: isPublic = true, turnNo }) {
    if (!sessionId) throw new Error('세션이 없습니다. beginSession() 먼저 호출')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('로그인 필요')

    // turn_no가 명시되면 사용, 아니면 메모리 기반 auto-increment
    const nextTurn = typeof turnNo === 'number'
      ? turnNo
      : Math.max(0, ...memory.map(m => m.turn_no ?? 0)) + 1

    // DB 기록
    const ins = await supabase
      .from('rank_turns')
      .insert({
        session_id: sessionId,
        game_id: gameId,
        role,
        is_public: !!isPublic,
        turn_no: nextTurn,
        content
      })
      .select('*')
      .single()

    if (ins.error) throw ins.error

    // 로컬 캐시에도 반영
    setMemory(prev => [...prev, ins.data])
    return ins.data
  }

  // 공개 로그 조합(최근 N개)
  function joinedText({ onlyPublic = true, last = 20 } = {}) {
    const rows = memory
      .filter(m => (onlyPublic ? m.is_public : true))
      .sort((a, b) => (a.turn_no - b.turn_no))
      .slice(-last)
    return rows.map(r => `[${r.role}] ${r.content}`).join('\n')
  }

  return { beginSession, push, joinedText, sessionId }
}

// named export 필수
export function useAiHistory({ gameId }) {
  const [sessionId, setSessionId] = useState(null)
  const bufRef = useRef([]) // { role, content, public }

  async function beginSession() {
    // 테이블 없으면 메모리만 사용
    try {
      const { data: s } = await supabase
        .from('rank_sessions')
        .insert({ game_id: gameId })
        .select()
        .single()
      if (s?.id) setSessionId(s.id)
    } catch {
      // 무시: 메모리 모드
    }
  }

  async function push({ role, content, public: isPublic = false }) {
    bufRef.current.push({ role, content, public: isPublic })
    if (sessionId) {
      const turn_no = bufRef.current.length
      try {
        await supabase.from('rank_turns').insert({ session_id: sessionId, turn_no, role, content })
      } catch {
        // 무시(로그 실패해도 진행)
      }
    }
  }

  function joinedText({ onlyPublic = false, last = 10 } = {}) {
    const src = onlyPublic ? bufRef.current.filter(x => x.public) : bufRef.current
    return src.slice(-last).map(x => `[${x.role}] ${x.content}`).join('\n')
  }

  return { beginSession, push, joinedText }
}
