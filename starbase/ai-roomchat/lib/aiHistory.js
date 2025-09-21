// lib/aiHistory.js
import { useRef, useState } from 'react'
import { supabase } from './supabase'

export function useAiHistory({ gameId }) {
  const [sessionId, setSessionId] = useState(null)
  const bufRef = useRef([]) // { role: 'user'|'assistant'|'system', content, public?: true }

  // 선택 기능: 존재하면 DB에 저장, 없으면 메모리만
  async function tableExists(name) {
    try {
      const { data, error } = await supabase.rpc('pg_table_exists', { tbl: name })
      if (error || data == null) return false
      return !!data
    } catch {
      return false
    }
  }

  async function beginSession() {
    const ok = await tableExists('rank_sessions')
    if (!ok) return
    const { data: s } = await supabase.from('rank_sessions')
      .insert({ game_id: gameId })
      .select()
      .single()
    if (s?.id) setSessionId(s.id)
  }

  async function push({ role, content, public: isPublic = false }) {
    bufRef.current.push({ role, content, public: isPublic })
    if (sessionId) {
      const turn_no = bufRef.current.length
      await supabase.from('rank_turns').insert({
        session_id: sessionId, turn_no, role, content
      })
    }
  }

  function joinedText({ onlyPublic = false, last = 10 } = {}) {
    const src = onlyPublic ? bufRef.current.filter(x => x.public) : bufRef.current
    const lines = src.slice(-last).map(x => `[${x.role}] ${x.content}`)
    return lines.join('\n')
  }

  return { beginSession, push, joinedText }
}

// (옵션) 없으면 만들어두면 좋은 RPC
// create or replace function public.pg_table_exists(tbl text)
// returns boolean language plpgsql as $$
// begin
//   return exists (select 1 from information_schema.tables
//                  where table_schema='public' and table_name=tbl);
// end; $$;
