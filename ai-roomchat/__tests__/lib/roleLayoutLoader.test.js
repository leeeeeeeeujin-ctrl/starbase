// Tests for roleLayoutLoader heuristics
import { normaliseRolesAndSlots } from '@/lib/rank/roleLayoutLoader';

describe('roleLayoutLoader normaliseRolesAndSlots', () => {
  test('prefers rank_game_slots when rank_games.roles is just distinct roles', () => {
    const roleRows = [
      { name: '공격', slot_count: 1, active: true },
      { name: '수비', slot_count: 2, active: true },
    ];
    const slotRows = [
      { slot_index: 0, role: '공격', active: true },
      { slot_index: 1, role: '수비', active: true },
      { slot_index: 2, role: '수비', active: true },
    ];
    // Inline roles without duplicates or indices; looks like a role list, not layout
    const gameRoleSlots = ['공격', '수비'];

    const { roles, slotLayout } = normaliseRolesAndSlots(roleRows, slotRows, gameRoleSlots);

    expect(Array.isArray(slotLayout)).toBe(true);
    expect(slotLayout.map(s => s.role)).toEqual(['공격', '수비', '수비']);
    const roleMap = new Map(roles.map(r => [r.name, r.slotCount || r.slot_count]));
    expect(roleMap.get('공격')).toBe(1);
    expect(roleMap.get('수비')).toBe(2);
  });

  test('uses inline layout when it contains duplicates (looks like layout)', () => {
    const roleRows = [];
    const slotRows = [];
    const gameRoleSlots = ['공격', '수비', '수비'];

    const { roles, slotLayout } = normaliseRolesAndSlots(roleRows, slotRows, gameRoleSlots);

    expect(slotLayout.map(s => s.role)).toEqual(['공격', '수비', '수비']);
    const roleMap = new Map(roles.map(r => [r.name, r.slotCount || r.slot_count]));
    expect(roleMap.get('공격')).toBe(1);
    expect(roleMap.get('수비')).toBe(2);
  });
});
