import { supabase } from '@/lib/supabase';

export function createSyncChannel(setId, opts = {}) {
  const name = `ws_set_${String(setId)}`;
  const channel = supabase.channel(name, { config: { broadcast: { ack: true }, presence: { key: opts.clientId || 'client' } } });
  return channel;
}

export async function joinSyncChannel(channel, presence = {}) {
  return new Promise((resolve) => {
    try {
      channel.on('presence', { event: 'join' }, () => {}).subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          try { channel.track(presence || {}); } catch {}
          resolve(true);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

export function leaveSyncChannel(channel) {
  try { channel.unsubscribe(); } catch {}
}

export function broadcastPatch(channel, type, payload) {
  try { channel.send({ type: 'broadcast', event: type, payload }); } catch {}
}

export function onPatch(channel, type, handler) {
  try { channel.on('broadcast', { event: type }, (e) => handler && handler(e?.payload)); } catch {}
}

