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

  // push: turn_no → idx, is_public → public, game_id 제거
async function push({ role, content, public: isPublic = true, turnNo }) {
  if (!sessionId) throw new Error('세션이 없습니다. beginSession() 먼저 호출')
  // 로그인 체크 유지 (원하면 beginSession에서만 확인하고 여기선 생략 가능)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인 필요')

  const nextIdx = typeof turnNo === 'number'
    ? turnNo
    : Math.max(-1, ...memory.map(m => (typeof m.idx === 'number' ? m.idx : -1))) + 1

  const ins = await supabase
    .from('rank_turns')
    .insert({
      session_id: sessionId,
      idx: nextIdx,
      role,
      public: !!isPublic,
      content
    })
    .select('*')
    .single()

  if (ins.error) throw ins.error
  setMemory(prev => [...prev, ins.data])
  return ins.data
}

// joinedText: public 컬럼명에 맞춰 필터/정렬
function joinedText({ onlyPublic = true, last = 20 } = {}) {
  const rows = memory
    .filter(m => (onlyPublic ? m.public : true))
    .sort((a, b) => (a.idx - b.idx))
    .slice(-last)
  return rows.map(r => `[${r.role}] ${r.content}`).join('\n')
}


  return { beginSession, push, joinedText, sessionId }
}
