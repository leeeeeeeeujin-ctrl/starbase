// lib/aiHistory.js
import { useRef, useState } from 'react'
import { supabase } from './supabase'

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
