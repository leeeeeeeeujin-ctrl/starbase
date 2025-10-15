import { supabase } from '@/lib/supabase'

export function subscribeToQueue(queueId, handler) {
  if (!queueId) return () => {}
  const channel = supabase.channel(`arena-queue:${queueId}`)
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'rank_queue_tickets', filter: `queue_id=eq.${queueId}` },
    (payload) => handler?.({ type: 'queue', payload }),
  )
  channel.subscribe()
  return () => supabase.removeChannel(channel)
}

export function subscribeToSession(sessionId, handler) {
  if (!sessionId) return () => {}
  const channel = supabase.channel(`arena-session:${sessionId}`)
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'rank_sessions', filter: `id=eq.${sessionId}` },
    (payload) => handler?.({ type: 'session', payload }),
  )
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'rank_turns', filter: `session_id=eq.${sessionId}` },
    (payload) => handler?.({ type: 'turn', payload }),
  )
  channel.subscribe()
  return () => supabase.removeChannel(channel)
}
