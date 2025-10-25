// lib/rank/roles.js
import { supabase } from './db';

export async function getActiveRoles(gameId) {
  const { data, error } = await supabase
    .from('rank_game_roles')
    .select('id,name,slot_count')
    .eq('game_id', gameId)
    .eq('active', true)
    .order('id');
  if (error) throw error;
  return data || [];
}

export function totalSlots(roles) {
  return roles.reduce((s, r) => s + (r.slot_count || 0), 0);
}

export function buildRoleRequirements(roles = []) {
  const requirements = [];
  let slotIndex = 1;

  roles.forEach((role, roleIndex) => {
    const count = Number(role?.slot_count) || 0;
    if (count <= 0) {
      return;
    }

    const rawName = typeof role?.name === 'string' ? role.name.trim() : '';
    const roleName = rawName || `역할 ${roleIndex + 1}`;
    for (let offset = 0; offset < count; offset += 1) {
      requirements.push({
        slotIndex,
        roleId: role?.id ?? null,
        roleName,
        roleIndex,
        roleSlotIndex: offset,
      });
      slotIndex += 1;
    }
  });

  return requirements;
}
