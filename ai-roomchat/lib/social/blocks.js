'use client';

import { supabase } from '@/lib/supabase';

export async function listBlockedOwners() {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = Array.isArray(data) ? data.map(r => r.blocked_id).filter(Boolean) : [];
  return ids;
}

export async function blockOwner({ ownerId, reason = null }) {
  if (!ownerId) throw new Error('missing_owner_id');
  const payload = { blocker_id: undefined, blocked_id: ownerId };
  if (reason && String(reason).trim()) payload.reason = String(reason).trim();
  const { error } = await supabase.from('user_blocks').insert(payload);
  if (error) throw error;
  return { ok: true };
}

export async function unblockOwner({ ownerId }) {
  if (!ownerId) throw new Error('missing_owner_id');
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .match({ blocked_id: ownerId });
  if (error) throw error;
  return { ok: true };
}
