import { subscribeToBroadcastTopic } from '@/lib/realtime/broadcast';

export function subscribeToQueue(queueId, handler) {
  if (!queueId) return () => {};

  return subscribeToBroadcastTopic(
    `rank_queue_tickets:queue:${queueId}`,
    change => {
      handler?.({ type: 'queue', payload: change });
    },
    { events: ['INSERT', 'UPDATE', 'DELETE'] }
  );
}

export function subscribeToSession(sessionId, handler) {
  if (!sessionId) return () => {};

  const unsubscribers = [
    subscribeToBroadcastTopic(
      `rank_sessions:session:${sessionId}`,
      change => {
        handler?.({ type: 'session', payload: change });
      },
      { events: ['INSERT', 'UPDATE', 'DELETE'] }
    ),
    subscribeToBroadcastTopic(
      `rank_turns:session:${sessionId}`,
      change => {
        handler?.({ type: 'turn', payload: change });
      },
      { events: ['INSERT', 'UPDATE', 'DELETE'] }
    ),
  ];

  return () => {
    unsubscribers.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
  };
}
