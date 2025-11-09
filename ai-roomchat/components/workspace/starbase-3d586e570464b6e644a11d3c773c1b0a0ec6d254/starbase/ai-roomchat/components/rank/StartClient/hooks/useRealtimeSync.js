import { useCallback, useEffect, useRef, useState } from 'react';
import { initializeRealtimeEvents, appendSnapshotEvents } from '../engine/timelineState';
import { mergeTimelineEvents } from '@/lib/rank/timelineEvents';
import { subscribeToBroadcastTopic } from '@/lib/realtime/broadcast';

// Note: this hook centralizes realtime presence/events and the Supabase channel
// subscription for timeline events and turn-state broadcast events. The parent
// should pass `supabase`, `sessionInfo`, `applyTurnStateChange`, and
// `backfillTurnEvents` so the hook can coordinate subscriptions and backfill.

export function useRealtimeSync({ initialSnapshot = null, supabase = null, sessionInfo = null, applyTurnStateChange = null, backfillTurnEvents = null } = {}) {
  const [realtimePresence, setRealtimePresence] = useState(initialSnapshot);
  const [realtimeEvents, setRealtimeEvents] = useState(() =>
    initializeRealtimeEvents(initialSnapshot)
  );
  const realtimeEventsRef = useRef(realtimeEvents);

  useEffect(() => {
    realtimeEventsRef.current = Array.isArray(realtimeEvents) ? realtimeEvents : [];
  }, [realtimeEvents]);

  const applyRealtimeSnapshot = useCallback(snapshot => {
    if (!snapshot) {
      setRealtimePresence(null);
      setRealtimeEvents([]);
      return;
    }
    setRealtimePresence(snapshot);
    setRealtimeEvents(prev => appendSnapshotEvents(prev, snapshot));
  }, []);

  const mergeEvents = useCallback(events => {
    setRealtimeEvents(prev => mergeTimelineEvents(prev, events));
  }, []);

  useEffect(() => {
    const sessionId = sessionInfo?.id;
    if (!sessionId || !supabase) return undefined;

    const channel = supabase.channel(`rank-session:${sessionId}`, {
      config: { broadcast: { ack: true } },
    });

    const handleTimeline = payload => {
      const raw = payload?.payload || payload || {};
      const events = Array.isArray(raw.events) ? raw.events : [];
      if (!events.length) return;
      setRealtimeEvents(prev => mergeTimelineEvents(prev, events));
    };

    channel.on('broadcast', { event: 'rank:timeline-event' }, handleTimeline);

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        if (typeof backfillTurnEvents === 'function') backfillTurnEvents();
        return;
      }
      if (status === 'CHANNEL_ERROR') {
        console.error('[StartClient] 실시간 타임라인 채널 오류가 발생했습니다.');
      }
      if (status === 'TIMED_OUT') {
        console.warn(
          '[StartClient] 실시간 타임라인 채널 구독이 제한 시간 안에 완료되지 않았습니다.'
        );
      }
    });

    const unsubscribeTurnEvents = subscribeToBroadcastTopic(
      `rank_turn_state_events:session:${sessionId}`,
      change => {
        const changePayload = change?.new || change?.payload || null;
        const commitTimestamp = change?.commit_timestamp || change?.payload?.commit_timestamp || null;
        if (typeof applyTurnStateChange === 'function') {
          applyTurnStateChange(changePayload, { commitTimestamp });
        }
      },
      { events: ['INSERT', 'UPDATE', 'DELETE'] }
    );

    return () => {
      try {
        channel.unsubscribe();
      } catch (error) {
        console.warn('[StartClient] 실시간 타임라인 채널 해제 실패:', error);
      }
      if (typeof supabase.removeChannel === 'function') {
        try {
          supabase.removeChannel(channel);
        } catch (err) {
          // ignore
        }
      }
      if (typeof unsubscribeTurnEvents === 'function') {
        unsubscribeTurnEvents();
      }
    };
  }, [sessionInfo?.id, supabase, applyTurnStateChange, backfillTurnEvents]);

  return {
    realtimePresence,
    realtimeEvents,
    realtimeEventsRef,
    setRealtimeEvents,
    applyRealtimeSnapshot,
    mergeEvents,
  };
}
