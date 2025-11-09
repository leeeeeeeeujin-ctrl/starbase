'use client';

import { useEffect, useRef, useState } from 'react';

import { supabase } from '../../lib/supabase';

export function useHeroPresence(trackPayload) {
  const channelRef = useRef(null);
  const joinedRef = useRef(false);
  const [presenceList, setPresenceList] = useState([]);

  useEffect(() => {
    const presenceKey = trackPayload?.presenceKey || 'guest';
    const channel = supabase.channel('hero-presence', {
      config: {
        presence: { key: presenceKey },
      },
    });

    channelRef.current = channel;
    joinedRef.current = false;

    const sync = () => {
      const state = channel.presenceState();
      const rows = [];
      Object.entries(state).forEach(([key, entries]) => {
        entries.forEach(payload => {
          rows.push({ presenceKey: key, ...payload });
        });
      });
      setPresenceList(rows);
    };

    channel.on('presence', { event: 'sync' }, sync);
    channel.on('presence', { event: 'join' }, sync);
    channel.on('presence', { event: 'leave' }, sync);

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        joinedRef.current = true;
        if (trackPayload) {
          channel.track({ ...trackPayload, timestamp: new Date().toISOString() });
        }
      }
    });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
      channelRef.current = null;
      joinedRef.current = false;
    };
  }, [trackPayload?.presenceKey]);

  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !joinedRef.current) return;
    if (!trackPayload) return;
    channel.track({ ...trackPayload, timestamp: new Date().toISOString() });
  }, [trackPayload?.heroId, trackPayload?.heroName, trackPayload?.page, trackPayload?.avatarUrl]);

  return presenceList;
}
