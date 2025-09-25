// lib/aiHistory.js
import { supabase } from './supabase'
import { withTable } from '@/lib/supabaseTables'
// lib/aiHistory.js (핵심 부분 예시)
import { useRouter } from 'next/router'
import { useEffect, useState, useCallback } from 'react'

export function useAiHistory() {
  const [log, setLog] = useState([])

  const beginSession = useCallback(() => {
    setLog([])
  }, [])

  const push = useCallback((entry) => {
    setLog((prev) => [...prev, entry])
  }, [])

  const joinedText = useCallback(({ onlyPublic = true, last = 20 } = {}) => {
    const filtered = onlyPublic ? log.filter(l => l.public) : log
    const lines = filtered.slice(-last).map(l => l.content)
    return lines.join('\n')
  }, [log])

  return { log, beginSession, push, joinedText }
}

export default function SomeChild(props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const gameId = props?.gameId ?? router?.query?.id
  if (!mounted || !gameId) return null

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

  const ins = await withTable(supabase, 'rank_turns', (table) =>
    supabase
      .from(table)
      .insert({
        session_id: sessionId,
        idx: nextIdx,
        role,
        public: !!isPublic,
        content,
      })
      .select('*')
      .single(),
  )

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

// 
